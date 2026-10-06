'use strict';

/**
 * Event taxonomy: maps Claude Code hook events to weather-forcing inputs.
 *
 * A "forcing" is the deterministic classification of a single hook event
 * (or a measured idle gap) into one of a small set of weather drivers.
 * Later milestones turn a sequence of forcings into an actual forecast
 * state machine; this module only answers "what kind of event is this?".
 */

/** The set of weather-forcing categories an event can resolve to. */
const FORCING = Object.freeze({
  STORM: 'storm',
  CLEAR: 'clear',
  FOG: 'fog',
  CALM: 'calm',
});

/** Reasons are stable string codes so the same transcript always maps the same way. */
const REASON = Object.freeze({
  TOOL_CALL_FAILED: 'tool_call_failed',
  TEST_RUN_PASSED: 'test_run_passed',
  IDLE_GAP: 'idle_gap',
  NEUTRAL_EVENT: 'neutral_event',
});

/** Default idle gap, in milliseconds, before a silence rolls in fog. */
const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Command patterns recognized as "running the test suite". Matched against
 * the shell command string of a Bash tool call.
 */
const TEST_COMMAND_PATTERNS = [
  /\b(?:npm|yarn|pnpm)\s+(?:run\s+)?test\b/i,
  /\bpytest\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bmocha\b/i,
  /\brspec\b/i,
  /\bgo\s+test\b/i,
  /\bcargo\s+test\b/i,
  /\bctest\b/i,
];

/**
 * Hook events carry failure in whatever shape the underlying tool returns.
 * There is no single documented "ok" flag across tools, so this checks the
 * handful of shapes Claude Code tools actually emit on error.
 */
function isToolError(event) {
  const response = event.tool_response;

  if (response == null) {
    return false;
  }

  if (typeof response === 'string') {
    return /^error/i.test(response.trim());
  }

  if (typeof response === 'object') {
    // Non-empty stderr alone is not reliable (tools log warnings to stderr
    // on success too), so only the explicit error/is_error fields count.
    if (response.error) {
      return true;
    }
    if (response.is_error === true) {
      return true;
    }
  }

  return false;
}

function getBashCommand(event) {
  if (event.tool_name !== 'Bash') {
    return null;
  }
  const input = event.tool_input;
  if (!input || typeof input.command !== 'string') {
    return null;
  }
  return input.command;
}

function isTestCommand(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return false;
  }
  return TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function neutral(event) {
  return {
    forcing: FORCING.CALM,
    magnitude: 0,
    reason: REASON.NEUTRAL_EVENT,
    event_name: event ? event.hook_event_name : null,
  };
}

/**
 * Classify a single Claude Code hook event (the JSON object a hook receives
 * on stdin) into a weather-forcing input.
 *
 * Only PostToolUse carries enough information to force weather: it is the
 * one event with a tool_response to inspect. All other hook events
 * (PreToolUse, Notification, UserPromptSubmit, Stop, SubagentStop,
 * PreCompact, SessionStart, SessionEnd) resolve to CALM here; the state
 * machine milestone decides what, if anything, they reset.
 *
 * @param {object} event - raw hook event object.
 * @returns {{forcing: string, magnitude: number, reason: string, event_name: (string|null)}}
 */
function classifyHookEvent(event) {
  if (!event || typeof event !== 'object') {
    return neutral(null);
  }

  if (event.hook_event_name !== 'PostToolUse') {
    return neutral(event);
  }

  if (isToolError(event)) {
    return {
      forcing: FORCING.STORM,
      magnitude: 1,
      reason: REASON.TOOL_CALL_FAILED,
      event_name: event.hook_event_name,
    };
  }

  const command = getBashCommand(event);
  if (isTestCommand(command)) {
    return {
      forcing: FORCING.CLEAR,
      magnitude: 1,
      reason: REASON.TEST_RUN_PASSED,
      event_name: event.hook_event_name,
    };
  }

  return neutral(event);
}

/**
 * Classify a measured idle gap between two consecutive hook events into a
 * weather-forcing input. Idle gaps are a property of the timeline, not of
 * any single event, so they are classified separately from
 * classifyHookEvent.
 *
 * @param {number} gapMs - milliseconds elapsed since the previous event.
 * @param {number} [thresholdMs] - gap length that counts as "long".
 */
function classifyIdleGap(gapMs, thresholdMs = DEFAULT_IDLE_THRESHOLD_MS) {
  if (typeof gapMs !== 'number' || !Number.isFinite(gapMs) || gapMs < thresholdMs) {
    return {
      forcing: FORCING.CALM,
      magnitude: 0,
      reason: REASON.NEUTRAL_EVENT,
      event_name: null,
    };
  }

  return {
    forcing: FORCING.FOG,
    magnitude: 1,
    reason: REASON.IDLE_GAP,
    event_name: null,
  };
}

module.exports = {
  FORCING,
  REASON,
  DEFAULT_IDLE_THRESHOLD_MS,
  classifyHookEvent,
  classifyIdleGap,
};
