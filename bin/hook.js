#!/usr/bin/env node
'use strict';

const { processHookEvent } = require('../src/wiring');

/**
 * Entry point registered in hooks/hooks.json for every hook event this
 * plugin cares about. Claude Code sends the event as a JSON object on
 * stdin and ignores stdout for these events, so this process's only job is
 * the side effect: advance the persisted weather state so the next
 * status-line redraw picks it up.
 *
 * A hook that exits non-zero can block the session, so any failure here
 * (malformed input, a disk error) is swallowed rather than propagated.
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();

  let event = {};
  try {
    event = raw.trim().length > 0 ? JSON.parse(raw) : {};
  } catch {
    event = {};
  }

  processHookEvent(event);
}

main().catch((err) => {
  process.stderr.write(`sessionweather: ${err.message}\n`);
});
