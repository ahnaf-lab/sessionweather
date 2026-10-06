# sessionweather

A tiny deterministic weather system for a status-line pane, driven by your
session's own hook events: failed tool calls brew storms, clean test runs
clear the sky, and long idle gaps roll in fog. The same transcript always
produces the same forecast.

The **event taxonomy** maps raw session hook events to a small set of
weather-forcing inputs (`storm`, `clear`, `fog`, `calm`). The **weather state
machine** is a pure reducer that advances a sky state (`clear`, `cloudy`,
`storm`, `fog`) one forcing at a time, so the same sequence of forcings
always produces the same forecast. A later milestone renders this state into
an actual status-line pane.

## Install

```
npm install
```

No external packages are required — everything is built on the Node.js
standard library (`node:test`, `node:assert`).

## Usage

```js
const { classifyHookEvent, classifyIdleGap, FORCING } = require('./index.js');

// A hook event is the JSON object a session hook receives for a tool call.
const event = {
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  tool_response: { stdout: 'All tests passed' },
};

classifyHookEvent(event);
// => { forcing: 'clear', magnitude: 1, reason: 'test_run_passed', event_name: 'PostToolUse' }

// Idle gaps are classified separately, from the elapsed time between events.
classifyIdleGap(6 * 60 * 1000);
// => { forcing: 'fog', magnitude: 1, reason: 'idle_gap', event_name: null }
```

The taxonomy recognizes:

- **storm** — a tool call's response reports an error.
- **clear** — a Bash tool call ran a recognized test command (`npm test`,
  `pytest`, `jest`, `go test`, etc.) without error.
- **fog** — the gap since the previous event exceeded the idle threshold
  (5 minutes by default, configurable per call).
- **calm** — everything else; the event carries no weather signal.

Feed a sequence of forcings into the state machine to advance the sky one
frame at a time:

```js
const { reduce, run, INITIAL_STATE } = require('./index.js');

// reduce() is a pure function: same (state, forcing) in, same state out.
const afterStorm = reduce(INITIAL_STATE, { forcing: 'storm', magnitude: 1 });
// => { sky: 'storm', intensity: 1, ticksInState: 0 }

// run() walks an entire event queue and returns every intermediate frame.
const frames = run([
  { forcing: 'storm', magnitude: 1 },
  { forcing: 'calm', magnitude: 0 },
  { forcing: 'calm', magnitude: 0 },
  { forcing: 'calm', magnitude: 0 },
]);
// frames[frames.length - 1].sky === 'cloudy'
```

The state machine's rules:

- **storm** forcings raise intensity (capped) and put the sky in `storm`.
- A **clear** forcing (a passing test run) clears a storm by one intensity
  step immediately, or resolves `cloudy`/`fog` straight to `clear`.
- A **fog** forcing rolls in fog, unless a storm is already active — storms
  are a stronger signal than an idle gap and are not interrupted by one.
- A **calm** forcing (anything weather-neutral) is the only thing that decays
  a state on its own: after enough consecutive calm ticks, `storm` steps
  down to `cloudy`, and `cloudy`/`fog` settle back to `clear`.

## Status

Built autonomously, one milestone at a time, and gated on passing tests —
each change must build and pass `npm test` before it is kept.
