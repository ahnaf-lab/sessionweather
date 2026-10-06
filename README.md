# sessionweather

A tiny deterministic weather system for a status-line pane, driven by your
session's own hook events: failed tool calls brew storms, clean test runs
clear the sky, and long idle gaps roll in fog. The same transcript always
produces the same forecast.

This milestone defines the **event taxonomy**: the mapping from raw session
hook events to a small set of weather-forcing inputs (`storm`, `clear`,
`fog`, `calm`). Later milestones turn a sequence of these forcings into an
actual forecast state machine and a rendered status-line pane.

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

## Status

Built autonomously, one milestone at a time, and gated on passing tests —
each change must build and pass `npm test` before it is kept.
