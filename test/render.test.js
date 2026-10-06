'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SKY } = require('../src/weather');
const { render, FRAME_WIDTH, FRAME_HEIGHT } = require('../src/render');

/**
 * Golden frames: exact expected output for each sky state. Captured from a
 * known-good render and pinned here so any change to the renderer's output
 * must be a deliberate, reviewed edit to this file.
 */
const GOLDEN = {
  clear:
    '+---------------------+\n' +
    '|      \\   |   /      |\n' +
    '|    -- (     ) --    |\n' +
    '|        CLEAR        |\n' +
    '+---------------------+',
  cloudy:
    '+---------------------+\n' +
    '|       .----.        |\n' +
    '|     (________)      |\n' +
    '|       CLOUDY        |\n' +
    '+---------------------+',
  fog:
    '+---------------------+\n' +
    '|   ~ ~ ~ ~ ~ ~ ~ ~   |\n' +
    '|    ~ ~ ~ ~ ~ ~ ~    |\n' +
    '|         FOG         |\n' +
    '+---------------------+',
  storm1:
    '+---------------------+\n' +
    '|     (________)      |\n' +
    '|          /          |\n' +
    '|      STORM x1       |\n' +
    '+---------------------+',
  storm2:
    '+---------------------+\n' +
    '|     (________)      |\n' +
    '|         / /         |\n' +
    '|      STORM x2       |\n' +
    '+---------------------+',
  storm3:
    '+---------------------+\n' +
    '|     (________)      |\n' +
    '|        / / /        |\n' +
    '|      STORM x3       |\n' +
    '+---------------------+',
};

function assertFixedFrame(output) {
  const lines = output.split('\n');
  assert.equal(lines.length, FRAME_HEIGHT);
  for (const line of lines) {
    assert.equal(line.length, FRAME_WIDTH);
  }
}

test('renders a clear sky to its golden frame', () => {
  const output = render({ sky: SKY.CLEAR, intensity: 0, ticksInState: 0 });
  assert.equal(output, GOLDEN.clear);
  assertFixedFrame(output);
});

test('renders a cloudy sky to its golden frame', () => {
  const output = render({ sky: SKY.CLOUDY, intensity: 0, ticksInState: 0 });
  assert.equal(output, GOLDEN.cloudy);
  assertFixedFrame(output);
});

test('renders fog to its golden frame', () => {
  const output = render({ sky: SKY.FOG, intensity: 0, ticksInState: 2 });
  assert.equal(output, GOLDEN.fog);
  assertFixedFrame(output);
});

test('renders a storm at intensity 1 to its golden frame', () => {
  const output = render({ sky: SKY.STORM, intensity: 1, ticksInState: 0 });
  assert.equal(output, GOLDEN.storm1);
  assertFixedFrame(output);
});

test('renders a storm at intensity 2 to its golden frame', () => {
  const output = render({ sky: SKY.STORM, intensity: 2, ticksInState: 0 });
  assert.equal(output, GOLDEN.storm2);
  assertFixedFrame(output);
});

test('renders a storm at intensity 3 to its golden frame', () => {
  const output = render({ sky: SKY.STORM, intensity: 3, ticksInState: 0 });
  assert.equal(output, GOLDEN.storm3);
  assertFixedFrame(output);
});

test('every sky state renders to the same fixed width and height', () => {
  const states = [
    { sky: SKY.CLEAR, intensity: 0, ticksInState: 0 },
    { sky: SKY.CLOUDY, intensity: 0, ticksInState: 0 },
    { sky: SKY.FOG, intensity: 0, ticksInState: 0 },
    { sky: SKY.STORM, intensity: 1, ticksInState: 0 },
    { sky: SKY.STORM, intensity: 3, ticksInState: 0 },
  ];

  for (const state of states) {
    assertFixedFrame(render(state));
  }
});

test('render does not mutate the state it is given', () => {
  const state = Object.freeze({ sky: SKY.STORM, intensity: 2, ticksInState: 0 });

  assert.doesNotThrow(() => render(state));
});

test('rendering is deterministic: the same state always renders identically', () => {
  const state = { sky: SKY.STORM, intensity: 2, ticksInState: 1 };

  assert.equal(render(state), render(state));
});
