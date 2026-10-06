#!/usr/bin/env node
'use strict';

const { readCurrentFrame } = require('../src/wiring');

/**
 * Entry point for the statusLine command. Claude Code invokes this on
 * every redraw and sends session context (including session_id) as JSON
 * on stdin; this script only reads the already-persisted weather state
 * and prints its current frame — it never classifies events itself, so a
 * redraw can never desync the forecast from what the hooks last recorded.
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

  let input = {};
  try {
    input = raw.trim().length > 0 ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  const sessionId = (input && input.session_id) || 'default';
  process.stdout.write(readCurrentFrame(sessionId));
}

main().catch((err) => {
  process.stderr.write(`sessionweather: ${err.message}\n`);
});
