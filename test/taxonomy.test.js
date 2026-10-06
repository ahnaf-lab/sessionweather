'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FORCING,
  REASON,
  DEFAULT_IDLE_THRESHOLD_MS,
  classifyHookEvent,
  classifyIdleGap,
} = require('../src/taxonomy');

test('a failed Bash tool call brews a storm', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm /does/not/exist' },
    tool_response: { error: 'ENOENT: no such file or directory' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.STORM);
  assert.equal(result.reason, REASON.TOOL_CALL_FAILED);
});

test('a failed non-Bash tool call also brews a storm', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/missing.txt' },
    tool_response: { is_error: true },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.STORM);
});

test('a clean npm test run clears the sky', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'All tests passed' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.CLEAR);
  assert.equal(result.reason, REASON.TEST_RUN_PASSED);
});

test('a clean pytest run also clears the sky', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'pytest -q' },
    tool_response: { stdout: '5 passed' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.CLEAR);
});

test('a test command that reports an error stays a storm, not clear sky', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { error: 'tests failed' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.STORM);
});

test('an unrelated successful Bash command is weather-neutral', () => {
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_response: { stdout: 'file1\nfile2' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.CALM);
  assert.equal(result.reason, REASON.NEUTRAL_EVENT);
});

test('PreToolUse events are weather-neutral regardless of payload', () => {
  const event = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
  };

  const result = classifyHookEvent(event);

  assert.equal(result.forcing, FORCING.CALM);
});

test('malformed or missing events do not throw and resolve to calm', () => {
  assert.equal(classifyHookEvent(null).forcing, FORCING.CALM);
  assert.equal(classifyHookEvent(undefined).forcing, FORCING.CALM);
  assert.equal(classifyHookEvent({}).forcing, FORCING.CALM);
});

test('a short idle gap is weather-neutral', () => {
  const result = classifyIdleGap(30 * 1000);

  assert.equal(result.forcing, FORCING.CALM);
});

test('a long idle gap rolls in fog', () => {
  const result = classifyIdleGap(DEFAULT_IDLE_THRESHOLD_MS + 1);

  assert.equal(result.forcing, FORCING.FOG);
  assert.equal(result.reason, REASON.IDLE_GAP);
});

test('idle gap threshold is customizable', () => {
  const shortThreshold = 1000;

  assert.equal(classifyIdleGap(1500, shortThreshold).forcing, FORCING.FOG);
  assert.equal(classifyIdleGap(500, shortThreshold).forcing, FORCING.CALM);
});
