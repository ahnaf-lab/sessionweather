'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseTranscript, replayEntries, replayTranscriptFile } = require('../src/replay');
const { SKY } = require('../src/weather');

function tmpFile(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionweather-replay-test-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join('\n'));
  return file;
}

test('parseTranscript skips blank lines and malformed JSON', () => {
  const text = [
    JSON.stringify({ hook_event_name: 'Notification', timestamp: 0 }),
    '',
    '   ',
    'not json at all {{{',
    JSON.stringify({ hook_event_name: 'Stop', timestamp: 1000 }),
  ].join('\n');

  const entries = parseTranscript(text);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].event.hook_event_name, 'Notification');
  assert.equal(entries[1].event.hook_event_name, 'Stop');
});

test('parseTranscript accepts both numeric and ISO 8601 timestamps', () => {
  const entries = parseTranscript(
    [
      JSON.stringify({ hook_event_name: 'Notification', timestamp: 1700000000000 }),
      JSON.stringify({ hook_event_name: 'Notification', timestamp: '2023-11-14T22:13:20.000Z' }),
    ].join('\n'),
  );

  assert.equal(entries[0].timestamp, 1700000000000);
  assert.equal(entries[1].timestamp, 1700000000000);
});

test('replayEntries reproduces a storm from a failed tool call', () => {
  const entries = [
    {
      timestamp: 0,
      event: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm /does/not/exist' },
        tool_response: { error: 'ENOENT' },
      },
    },
  ];

  const frames = replayEntries(entries);

  assert.equal(frames.length, 2);
  assert.equal(frames[0].state.sky, SKY.CLEAR);
  assert.equal(frames[1].state.sky, SKY.STORM);
});

test('replayEntries rolls in fog across a long gap between timestamps', () => {
  const entries = [
    {
      timestamp: 0,
      event: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { stdout: 'ok' },
      },
    },
    {
      timestamp: 10 * 60 * 1000,
      event: { hook_event_name: 'Notification' },
    },
  ];

  const frames = replayEntries(entries, { idleThresholdMs: 5 * 60 * 1000 });

  assert.equal(frames[1].state.sky, SKY.CLEAR);
  assert.equal(frames[2].state.sky, SKY.FOG);
});

test('replayEntries is deterministic: identical entries always produce identical frames', () => {
  const entries = [
    {
      timestamp: 0,
      event: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm /missing' },
        tool_response: { error: 'ENOENT' },
      },
    },
    { timestamp: 1000, event: { hook_event_name: 'Notification' } },
    { timestamp: 2000, event: { hook_event_name: 'Notification' } },
  ];

  const first = replayEntries(entries);
  const second = replayEntries(entries);

  assert.deepEqual(first, second);
});

test('replayTranscriptFile reads a JSONL file from disk and replays it', () => {
  const file = tmpFile([
    {
      timestamp: 0,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm /missing' },
      tool_response: { error: 'ENOENT' },
    },
    { timestamp: 1000, hook_event_name: 'Notification' },
  ]);

  const frames = replayTranscriptFile(file);

  assert.equal(frames[frames.length - 1].state.sky, SKY.STORM);
});

test('replayTranscriptFile throws a clear error for a missing file', () => {
  assert.throws(() => replayTranscriptFile('/no/such/transcript.jsonl'));
});

test('CLI: sessionweather replay prints a per-event trace and the final frame', () => {
  const file = tmpFile([
    {
      timestamp: 0,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm /missing' },
      tool_response: { error: 'ENOENT' },
    },
    { timestamp: 1000, hook_event_name: 'Notification' },
  ]);

  const output = execFileSync('node', [path.join(__dirname, '..', 'bin', 'sessionweather.js'), 'replay', file], {
    encoding: 'utf8',
  });

  assert.match(output, /#1 PostToolUse -> storm/);
  assert.match(output, /STORM/);
});

test('CLI: replaying the same transcript twice prints identical output', () => {
  const file = tmpFile([
    { timestamp: 0, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: 'ok' } },
  ]);
  const script = path.join(__dirname, '..', 'bin', 'sessionweather.js');

  const first = execFileSync('node', [script, 'replay', file], { encoding: 'utf8' });
  const second = execFileSync('node', [script, 'replay', file], { encoding: 'utf8' });

  assert.equal(first, second);
});
