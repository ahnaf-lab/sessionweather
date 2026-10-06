'use strict';

const { SKY, MAX_INTENSITY } = require('./weather');

/**
 * ASCII renderer: turns a weather state (the shape produced by
 * src/weather.js) into a fixed-width, fixed-height text frame suitable for
 * a status-line pane. Every sky state renders to the same frame dimensions
 * so the pane never reflows as the forecast changes.
 */

/** Total width of every rendered line, borders included. */
const FRAME_WIDTH = 23;

/** Total number of lines in every rendered frame. */
const FRAME_HEIGHT = 5;

/** Width of the content area between the left and right border columns. */
const INNER_WIDTH = FRAME_WIDTH - 2;

function center(text, width) {
  const clipped = text.length > width ? text.slice(0, width) : text;
  const totalPad = width - clipped.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + clipped + ' '.repeat(right);
}

function border() {
  return `+${'-'.repeat(INNER_WIDTH)}+`;
}

function contentLine(text) {
  return `|${center(text, INNER_WIDTH)}|`;
}

/** Two icon lines per sky state. Storm's second line scales with intensity. */
function iconLines(state) {
  switch (state.sky) {
    case SKY.CLEAR:
      return ['  \\   |   /  ', '-- (     ) --'];
    case SKY.CLOUDY:
      return ['    .----.    ', '  (________)  '];
    case SKY.STORM: {
      const bolts = Array(state.intensity).fill('/').join(' ');
      return ['  (________)  ', bolts];
    }
    case SKY.FOG:
      return ['~ ~ ~ ~ ~ ~ ~ ~', ' ~ ~ ~ ~ ~ ~ ~ '];
    default:
      return ['', ''];
  }
}

function labelLine(state) {
  const name = state.sky.toUpperCase();
  if (state.sky === SKY.STORM && state.intensity > 0) {
    return `${name} x${state.intensity}`;
  }
  return name;
}

/**
 * Renders a weather state to a fixed-width, fixed-height ASCII frame.
 * Pure function: never mutates its argument, and the same state always
 * renders to the exact same string.
 *
 * @param {{sky: string, intensity: number, ticksInState: number}} state
 * @returns {string} a frame of FRAME_HEIGHT lines, each FRAME_WIDTH chars.
 */
function render(state) {
  const [icon1, icon2] = iconLines(state);

  const lines = [
    border(),
    contentLine(icon1),
    contentLine(icon2),
    contentLine(labelLine(state)),
    border(),
  ];

  return lines.join('\n');
}

module.exports = {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  MAX_INTENSITY,
  render,
};
