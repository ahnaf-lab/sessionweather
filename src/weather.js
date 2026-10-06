'use strict';

const { FORCING } = require('./taxonomy');

/** The set of sky states the reducer can be in. */
const SKY = Object.freeze({
  CLEAR: 'clear',
  CLOUDY: 'cloudy',
  STORM: 'storm',
  FOG: 'fog',
});

/** Storm intensity accumulates with each failure but is capped here. */
const MAX_INTENSITY = 3;

/** Consecutive calm ticks a non-clear state must absorb before decaying one step. */
const DECAY_TICKS = 3;

/** The state the reducer starts from when no prior frame exists. */
const INITIAL_STATE = Object.freeze({
  sky: SKY.CLEAR,
  intensity: 0,
  ticksInState: 0,
});

function withState(sky, intensity, ticksInState) {
  return { sky, intensity, ticksInState };
}

function applyStorm(state, magnitude) {
  const nextIntensity = Math.min(state.intensity + Math.max(magnitude, 1), MAX_INTENSITY);
  const ticksInState = state.sky === SKY.STORM ? state.ticksInState + 1 : 0;
  return withState(SKY.STORM, nextIntensity, ticksInState);
}

function applyClear(state) {
  if (state.sky === SKY.STORM) {
    // A passing test run clears a storm faster than calm decay does.
    const nextIntensity = state.intensity - 1;
    return nextIntensity > 0
      ? withState(SKY.STORM, nextIntensity, 0)
      : withState(SKY.CLOUDY, 0, 0);
  }

  if (state.sky === SKY.CLOUDY || state.sky === SKY.FOG) {
    return withState(SKY.CLEAR, 0, 0);
  }

  return withState(SKY.CLEAR, 0, state.ticksInState);
}

function applyFog(state) {
  if (state.sky === SKY.STORM) {
    // A storm is a stronger signal than an idle gap; fog does not interrupt it.
    return withState(state.sky, state.intensity, state.ticksInState);
  }

  const ticksInState = state.sky === SKY.FOG ? state.ticksInState + 1 : 0;
  return withState(SKY.FOG, 0, ticksInState);
}

function applyCalm(state) {
  if (state.sky === SKY.CLEAR) {
    return withState(SKY.CLEAR, 0, 0);
  }

  const ticksInState = state.ticksInState + 1;
  if (ticksInState < DECAY_TICKS) {
    return withState(state.sky, state.intensity, ticksInState);
  }

  if (state.sky === SKY.STORM) {
    const nextIntensity = state.intensity - 1;
    return nextIntensity > 0
      ? withState(SKY.STORM, nextIntensity, 0)
      : withState(SKY.CLOUDY, 0, 0);
  }

  // CLOUDY and FOG both settle back to clear skies once calm persists.
  return withState(SKY.CLEAR, 0, 0);
}

/**
 * Pure reducer: given the current sky state and a single weather-forcing
 * input (the shape produced by src/taxonomy.js), returns the next state.
 * Never mutates either argument.
 *
 * @param {{sky: string, intensity: number, ticksInState: number}} state
 * @param {{forcing: string, magnitude: number}} input
 * @returns {{sky: string, intensity: number, ticksInState: number}}
 */
function reduce(state, input) {
  const current = state || INITIAL_STATE;
  const forcing = input && input.forcing;
  const magnitude = (input && input.magnitude) || 0;

  switch (forcing) {
    case FORCING.STORM:
      return applyStorm(current, magnitude);
    case FORCING.CLEAR:
      return applyClear(current);
    case FORCING.FOG:
      return applyFog(current);
    default:
      return applyCalm(current);
  }
}

/**
 * Advances the state machine across an entire event queue, frame by frame.
 * Returns every intermediate state, including the initial one at index 0,
 * so callers can render a timeline rather than just the final forecast.
 *
 * @param {Array<{forcing: string, magnitude: number}>} forcings
 * @param {{sky: string, intensity: number, ticksInState: number}} [initialState]
 * @returns {Array<{sky: string, intensity: number, ticksInState: number}>}
 */
function run(forcings, initialState = INITIAL_STATE) {
  const frames = [initialState];
  let state = initialState;

  for (const input of forcings) {
    state = reduce(state, input);
    frames.push(state);
  }

  return frames;
}

module.exports = {
  SKY,
  MAX_INTENSITY,
  DECAY_TICKS,
  INITIAL_STATE,
  reduce,
  run,
};
