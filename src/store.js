'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Session state store: persists the weather reducer's state between process
 * invocations. Each hook event and each status-line redraw runs in its own
 * short-lived process, so the current sky state has to live on disk between
 * them, keyed by the session that produced it.
 */

/** Default directory state records are written to and read from. */
const DEFAULT_STATE_DIR = path.join(os.tmpdir(), 'sessionweather');

/**
 * session_id arrives as untrusted input from a hook event's JSON payload, so
 * it is reduced to a safe filename before it ever touches the filesystem.
 */
function safeFileStem(sessionId) {
  const text = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : 'default';
  return text.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function stateFilePath(sessionId, dir = DEFAULT_STATE_DIR) {
  return path.join(dir, `${safeFileStem(sessionId)}.json`);
}

/**
 * Loads the persisted record for a session, or null if none exists yet
 * (first event of a session) or the file is unreadable/corrupt.
 */
function loadRecord(sessionId, dir = DEFAULT_STATE_DIR) {
  const file = stateFilePath(sessionId, dir);

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persists a session's record, creating the state directory if needed.
 */
function saveRecord(sessionId, record, dir = DEFAULT_STATE_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath(sessionId, dir), JSON.stringify(record), 'utf8');
}

module.exports = {
  DEFAULT_STATE_DIR,
  stateFilePath,
  loadRecord,
  saveRecord,
};
