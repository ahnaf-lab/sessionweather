'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { stateFilePath, loadRecord, saveRecord } = require('../src/store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sessionweather-test-'));
}

test('loadRecord returns null when no record has been saved yet', () => {
  const dir = tmpDir();

  assert.equal(loadRecord('some-session', dir), null);
});

test('saveRecord then loadRecord round-trips the same record', () => {
  const dir = tmpDir();
  const record = { sky: { sky: 'storm', intensity: 2, ticksInState: 0 }, lastEventAt: 12345 };

  saveRecord('session-a', record, dir);
  const loaded = loadRecord('session-a', dir);

  assert.deepEqual(loaded, record);
});

test('different session ids are stored in separate files', () => {
  const dir = tmpDir();

  saveRecord('session-a', { sky: { sky: 'clear' }, lastEventAt: 1 }, dir);
  saveRecord('session-b', { sky: { sky: 'fog' }, lastEventAt: 2 }, dir);

  assert.equal(loadRecord('session-a', dir).sky.sky, 'clear');
  assert.equal(loadRecord('session-b', dir).sky.sky, 'fog');
  assert.notEqual(stateFilePath('session-a', dir), stateFilePath('session-b', dir));
});

test('a session id with path-unsafe characters is sanitized to a plain filename', () => {
  const dir = tmpDir();

  saveRecord('../../etc/passwd', { sky: { sky: 'clear' }, lastEventAt: 1 }, dir);

  const file = stateFilePath('../../etc/passwd', dir);
  assert.equal(path.dirname(file), dir);
  assert.ok(fs.existsSync(file));
});

test('loadRecord returns null for a corrupt state file instead of throwing', () => {
  const dir = tmpDir();
  fs.writeFileSync(stateFilePath('broken', dir), 'not json', 'utf8');

  assert.equal(loadRecord('broken', dir), null);
});
