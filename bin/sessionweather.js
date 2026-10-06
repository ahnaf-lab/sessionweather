#!/usr/bin/env node
'use strict';

const path = require('path');

const { replayTranscriptFile } = require('../src/replay');
const { render } = require('../src/render');

/**
 * `sessionweather replay <transcript.jsonl>` re-derives a past session's
 * weather from a recorded transcript and prints the same per-event trace
 * and final ASCII frame every time it is given the same file, since the
 * underlying reducer (src/weather.js) is deterministic.
 */

function printUsage() {
  process.stderr.write('usage: sessionweather replay <transcript.jsonl>\n');
}

function describeFrame(frame) {
  const label = frame.event ? frame.event.hook_event_name || 'event' : 'start';
  return `${label} -> ${frame.state.sky}`;
}

function runReplay(filePath) {
  const frames = replayTranscriptFile(filePath);

  frames.slice(1).forEach((frame, index) => {
    process.stdout.write(`#${index + 1} ${describeFrame(frame)}\n`);
  });

  const finalState = frames[frames.length - 1].state;
  process.stdout.write(`${render(finalState)}\n`);
}

function main() {
  const [command, target] = process.argv.slice(2);

  if (command !== 'replay' || !target) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(process.cwd(), target);

  try {
    runReplay(filePath);
  } catch (err) {
    process.stderr.write(`sessionweather: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();
