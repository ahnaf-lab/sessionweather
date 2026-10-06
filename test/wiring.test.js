'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { processHookEvent, readCurrentFrame } = require('../src/wiring');
const { loadRecord } = require('../src/store');
const { SKY } = require('../src/weather');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sessionweather-test-'));
}

function failedToolEvent(sessionId) {
  return {
    session_id: sessionId,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm /does/not/exist' },
    tool_response: { error: 'ENOENT' },
  };
}

function passingTestEvent(sessionId) {
  return {
    session_id: sessionId,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'ok' },
  };
}

test('processHookEvent advances and persists a session\'s weather from a live event', () => {
  const dir = tmpDir();

  const { state, frame } = processHookEvent(failedToolEvent('s1'), { dir, now: 1000 });

  assert.equal(state.sky, SKY.STORM);
  assert.ok(frame.includes('STORM'));
  assert.equal(loadRecord('s1', dir).sky.sky, SKY.STORM);
});

test('readCurrentFrame renders whatever was last persisted, without advancing it', () => {
  const dir = tmpDir();

  processHookEvent(failedToolEvent('s2'), { dir, now: 1000 });
  const frameBefore = readCurrentFrame('s2', { dir });
  const frameAfter = readCurrentFrame('s2', { dir });

  assert.equal(frameBefore, frameAfter);
  assert.ok(frameBefore.includes('STORM'));
});

test('readCurrentFrame on a session with no prior events renders a clear sky', () => {
  const dir = tmpDir();

  const frame = readCurrentFrame('never-seen', { dir });

  assert.ok(frame.includes('CLEAR'));
});

test('a long idle gap before the next event rolls in fog, unless a storm is active', () => {
  const dir = tmpDir();

  processHookEvent(passingTestEvent('s3'), { dir, now: 0 });
  const tenMinutesLater = processHookEvent(
    { session_id: 's3', hook_event_name: 'Notification' },
    { dir, now: 10 * 60 * 1000, idleThresholdMs: 5 * 60 * 1000 },
  );

  assert.equal(tenMinutesLater.state.sky, SKY.FOG);
});

test('separate sessions keep independent weather', () => {
  const dir = tmpDir();

  processHookEvent(failedToolEvent('storm-session'), { dir, now: 1000 });
  const clearSession = processHookEvent(
    { session_id: 'clear-session', hook_event_name: 'Notification' },
    { dir, now: 1000 },
  );

  assert.equal(loadRecord('storm-session', dir).sky.sky, SKY.STORM);
  assert.equal(clearSession.state.sky, SKY.CLEAR);
});
