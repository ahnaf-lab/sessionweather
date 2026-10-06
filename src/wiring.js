'use strict';

const { classifyHookEvent, classifyIdleGap, DEFAULT_IDLE_THRESHOLD_MS } = require('./taxonomy');
const { reduce, INITIAL_STATE } = require('./weather');
const { render } = require('./render');
const store = require('./store');

/**
 * Plugin wiring: the glue between live session hook events and the pure
 * taxonomy/weather/render modules built in earlier milestones. A hook
 * invocation and a status-line redraw are separate, short-lived processes,
 * so this module is the only place that touches persisted state.
 */

function sessionIdOf(event) {
  return (event && typeof event.session_id === 'string' && event.session_id) || 'default';
}

function skyOf(record) {
  return (record && record.sky) || INITIAL_STATE;
}

/**
 * Advances a session's weather state by one live hook event and persists
 * the result. If enough wall-clock time passed since the previous event,
 * an idle-gap forcing is applied first so a long silence can still roll in
 * fog even though the only event marking it is whatever arrives next.
 *
 * @param {object} event - raw hook event object (as received on stdin).
 * @param {{now: number, dir: string, idleThresholdMs: number}} [options]
 * @returns {{state: object, frame: string}} the new sky state and its frame.
 */
function processHookEvent(event, options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const idleThresholdMs = options.idleThresholdMs || DEFAULT_IDLE_THRESHOLD_MS;
  const sessionId = sessionIdOf(event);

  const record = store.loadRecord(sessionId, options.dir);
  let sky = skyOf(record);

  if (record && typeof record.lastEventAt === 'number') {
    const gapForcing = classifyIdleGap(now - record.lastEventAt, idleThresholdMs);
    sky = reduce(sky, gapForcing);
  }

  const eventForcing = classifyHookEvent(event);
  sky = reduce(sky, eventForcing);

  store.saveRecord(sessionId, { sky, lastEventAt: now }, options.dir);

  return { state: sky, frame: render(sky) };
}

/**
 * Renders a session's current, already-persisted sky state without
 * advancing it. This is what the status-line command calls on every
 * redraw: it never classifies an event or mutates state on its own.
 *
 * @param {string} sessionId
 * @param {{dir: string}} [options]
 * @returns {string} a fixed-width ASCII frame.
 */
function readCurrentFrame(sessionId, options = {}) {
  const record = store.loadRecord(sessionId, options.dir);
  return render(skyOf(record));
}

module.exports = {
  processHookEvent,
  readCurrentFrame,
};
