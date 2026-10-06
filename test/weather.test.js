'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FORCING } = require('../src/taxonomy');
const { SKY, MAX_INTENSITY, DECAY_TICKS, INITIAL_STATE, reduce, run } = require('../src/weather');

function forcing(name, magnitude = 1) {
  return { forcing: name, magnitude };
}

test('the initial state is a clear sky with no intensity', () => {
  assert.equal(INITIAL_STATE.sky, SKY.CLEAR);
  assert.equal(INITIAL_STATE.intensity, 0);
});

test('a storm forcing brews a storm from a clear sky', () => {
  const next = reduce(INITIAL_STATE, forcing(FORCING.STORM));

  assert.equal(next.sky, SKY.STORM);
  assert.equal(next.intensity, 1);
});

test('repeated storm forcings raise intensity but cap it', () => {
  let state = INITIAL_STATE;
  for (let i = 0; i < MAX_INTENSITY + 5; i += 1) {
    state = reduce(state, forcing(FORCING.STORM));
  }

  assert.equal(state.sky, SKY.STORM);
  assert.equal(state.intensity, MAX_INTENSITY);
});

test('reduce does not mutate the state or input it is given', () => {
  const state = Object.freeze({ sky: SKY.CLEAR, intensity: 0, ticksInState: 0 });
  const input = Object.freeze(forcing(FORCING.STORM));

  const next = reduce(state, input);

  assert.notEqual(next, state);
  assert.equal(state.sky, SKY.CLEAR);
});

test('a passing test run clears a storm faster than calm decay', () => {
  let state = reduce(INITIAL_STATE, forcing(FORCING.STORM, 2));
  assert.equal(state.intensity, 2);

  state = reduce(state, forcing(FORCING.CLEAR));
  assert.equal(state.sky, SKY.STORM);
  assert.equal(state.intensity, 1);

  state = reduce(state, forcing(FORCING.CLEAR));
  assert.equal(state.sky, SKY.CLOUDY);
});

test('a storm only decays to cloudy after enough consecutive calm ticks', () => {
  let state = reduce(INITIAL_STATE, forcing(FORCING.STORM));

  for (let i = 0; i < DECAY_TICKS - 1; i += 1) {
    state = reduce(state, forcing(FORCING.CALM));
    assert.equal(state.sky, SKY.STORM, `still storming after ${i + 1} calm tick(s)`);
  }

  state = reduce(state, forcing(FORCING.CALM));
  assert.equal(state.sky, SKY.CLOUDY);
});

test('a fog forcing rolls in fog from a clear sky', () => {
  const next = reduce(INITIAL_STATE, forcing(FORCING.FOG));

  assert.equal(next.sky, SKY.FOG);
});

test('fog does not interrupt an active storm', () => {
  const storming = reduce(INITIAL_STATE, forcing(FORCING.STORM));
  const next = reduce(storming, forcing(FORCING.FOG));

  assert.equal(next.sky, SKY.STORM);
  assert.equal(next.intensity, storming.intensity);
});

test('a passing test run burns off fog immediately', () => {
  const foggy = reduce(INITIAL_STATE, forcing(FORCING.FOG));
  const next = reduce(foggy, forcing(FORCING.CLEAR));

  assert.equal(next.sky, SKY.CLEAR);
});

test('fog settles back to clear skies after enough calm ticks', () => {
  let state = reduce(INITIAL_STATE, forcing(FORCING.FOG));

  for (let i = 0; i < DECAY_TICKS; i += 1) {
    state = reduce(state, forcing(FORCING.CALM));
  }

  assert.equal(state.sky, SKY.CLEAR);
});

test('run() advances a full event queue frame by frame', () => {
  const forcings = [
    forcing(FORCING.STORM),
    forcing(FORCING.CALM),
    forcing(FORCING.CALM),
    forcing(FORCING.CALM),
  ];

  const frames = run(forcings);

  assert.equal(frames.length, forcings.length + 1);
  assert.equal(frames[0].sky, SKY.CLEAR);
  assert.equal(frames[1].sky, SKY.STORM);
  assert.equal(frames[frames.length - 1].sky, SKY.CLOUDY);
});

test('an unknown or missing forcing is treated as calm', () => {
  const next = reduce(INITIAL_STATE, { forcing: 'not_a_real_forcing' });

  assert.equal(next.sky, SKY.CLEAR);
  assert.equal(next.intensity, 0);
});
