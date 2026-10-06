'use strict';

const fs = require('fs');

const { classifyHookEvent, classifyIdleGap, DEFAULT_IDLE_THRESHOLD_MS } = require('./taxonomy');
const { reduce, INITIAL_STATE } = require('./weather');

/**
 * Replay mode: re-derives the weather state machine's full timeline from a
 * recorded transcript instead of live hook events, so a past session's
 * forecast can be reconstructed identically on demand.
 *
 * A transcript is a JSONL file: one hook event per line, each carrying a
 * `timestamp` (an ISO 8601 string or epoch-millisecond number) alongside the
 * usual hook event fields (`hook_event_name`, `tool_name`, `tool_input`,
 * `tool_response`). Idle gaps between consecutive timestamps are classified
 * exactly as they are for a live session in src/wiring.js.
 */

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Parses raw JSONL text into an ordered list of transcript entries. Blank
 * lines are skipped, and a line that is not valid JSON (or not an object)
 * is dropped rather than aborting the whole replay, mirroring how the live
 * hook entry point (bin/hook.js) tolerates bad input.
 *
 * @param {string} text - raw file contents.
 * @returns {Array<{event: object, timestamp: (number|null)}>}
 */
function parseTranscript(text) {
  const entries = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!event || typeof event !== 'object') {
      continue;
    }

    entries.push({ event, timestamp: parseTimestamp(event.timestamp) });
  }

  return entries;
}

/**
 * Re-derives the full weather timeline from parsed transcript entries. Pure
 * function: the same entries and options always produce the same frames.
 *
 * Index 0 of the returned array is the starting frame, before any entry is
 * applied, so callers can render a full timeline the same way
 * src/weather.js's run() does.
 *
 * @param {Array<{event: object, timestamp: (number|null)}>} entries
 * @param {{idleThresholdMs: number, initialState: object}} [options]
 * @returns {Array<{state: object, event: (object|null), timestamp: (number|null)}>}
 */
function replayEntries(entries, options = {}) {
  const idleThresholdMs = options.idleThresholdMs || DEFAULT_IDLE_THRESHOLD_MS;
  let state = options.initialState || INITIAL_STATE;
  let previousTimestamp = null;

  const frames = [{ state, event: null, timestamp: null }];

  for (const { event, timestamp } of entries) {
    if (previousTimestamp != null && timestamp != null) {
      const gapForcing = classifyIdleGap(timestamp - previousTimestamp, idleThresholdMs);
      state = reduce(state, gapForcing);
    }

    const eventForcing = classifyHookEvent(event);
    state = reduce(state, eventForcing);

    frames.push({ state, event, timestamp });

    if (timestamp != null) {
      previousTimestamp = timestamp;
    }
  }

  return frames;
}

/**
 * Reads a transcript file from disk and replays it end to end.
 *
 * @param {string} filePath - path to a transcript.jsonl file.
 * @param {{idleThresholdMs: number}} [options]
 * @returns {Array<{state: object, event: (object|null), timestamp: (number|null)}>}
 */
function replayTranscriptFile(filePath, options = {}) {
  const text = fs.readFileSync(filePath, 'utf8');
  const entries = parseTranscript(text);
  return replayEntries(entries, options);
}

module.exports = {
  parseTimestamp,
  parseTranscript,
  replayEntries,
  replayTranscriptFile,
};
