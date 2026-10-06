# sessionweather

A tiny deterministic weather system for a status-line pane, driven by your
session's own hook events: failed tool calls brew storms, clean test runs
clear the sky, and long idle gaps roll in fog. The same transcript always
produces the same forecast.

The **event taxonomy** maps raw session hook events to a small set of
weather-forcing inputs (`storm`, `clear`, `fog`, `calm`). The **weather state
machine** is a pure reducer that advances a sky state (`clear`, `cloudy`,
`storm`, `fog`) one forcing at a time, so the same sequence of forcings
always produces the same forecast. The **ASCII renderer** draws that state
to a fixed-width, fixed-height text frame for a status-line pane — every
sky state renders to the same dimensions, so the pane never reflows.

## Install

```
npm install
```

No external packages are required — everything is built on the Node.js
standard library (`node:test`, `node:assert`, `node:fs`).

To wire this up as a live plugin, point your hook configuration and status
line at the two CLI entry points in `bin/`:

- `hooks/hooks.json` already registers `bin/hook.js` against every session
  hook event (`SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, `SessionEnd`). Each
  invocation reads the event JSON from stdin, advances that session's
  weather, and persists it — it never prints anything the session would act
  on.
- Point your status line at `bin/statusline.js`, for example in your
  settings:

  ```json
  { "statusLine": { "type": "command", "command": "node /path/to/sessionweather/bin/statusline.js" } }
  ```

  It reads the session context JSON Claude Code sends on stdin, looks up
  that session's persisted weather, and prints the current ASCII frame —
  it never classifies events or advances state itself, so a redraw can
  never desync from what the hooks last recorded.

State is persisted per `session_id` as small JSON files under
`os.tmpdir()/sessionweather`, so hook events and status-line redraws (two
separate short-lived processes) agree on the current forecast.

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

Render any state to a fixed-width ASCII frame for a status-line pane:

```js
const { render, SKY } = require('./index.js');

console.log(render({ sky: SKY.STORM, intensity: 2, ticksInState: 0 }));
// +---------------------+
// |     (________)      |
// |         / /         |
// |      STORM x2       |
// +---------------------+
```

`render()` is pure and deterministic: every sky state produces the same
fixed `FRAME_WIDTH` x `FRAME_HEIGHT` frame, so the status-line pane never
reflows as the forecast changes. Storm frames scale their lightning line
with `intensity`.

The **plugin wiring** (`src/wiring.js`) is what connects a live, running
session to the pieces above. A hook event and a status-line redraw each run
in their own short-lived process, so the current sky state is persisted to
disk between them, keyed by `session_id`:

```js
const { processHookEvent, readCurrentFrame } = require('./index.js');

// Called from bin/hook.js for every session hook event. Classifies the
// event, applies an idle-gap forcing first if enough wall-clock time
// passed since the last one, advances that session's weather, and
// persists it.
processHookEvent(hookEventFromStdin);

// Called from bin/statusline.js on every redraw. Renders whatever was
// last persisted for that session without classifying anything itself.
readCurrentFrame(sessionId);
```

See `## Install` above for wiring these into actual hook and status-line
configuration.

### Replay mode

`sessionweather replay <transcript.jsonl>` re-derives a past session's
weather from a recorded transcript instead of live hook events, so the same
transcript always displays the same forecast:

```
sessionweather replay path/to/transcript.jsonl
```

A transcript is a JSONL file: one hook event per line, each carrying a
`timestamp` (an ISO 8601 string or epoch-millisecond number) in addition to
the usual hook event fields (`hook_event_name`, `tool_name`, `tool_input`,
`tool_response`), for example:

```
{"timestamp": 0, "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": {"command": "rm /missing"}, "tool_response": {"error": "ENOENT"}}
{"timestamp": 1000, "hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": {"command": "npm test"}, "tool_response": {"stdout": "ok"}}
```

Replay classifies each line with the same `classifyHookEvent` taxonomy used
live, classifies the idle gap between consecutive timestamps with
`classifyIdleGap`, and feeds both through the same pure `reduce()` reducer —
it shares every rule with live sessions, it just reads timestamps from the
file instead of the system clock. It prints one line per event showing the
sky transition, followed by the final ASCII frame:

```
#1 PostToolUse -> storm
#2 PostToolUse -> cloudy
#3 Notification -> cloudy
+---------------------+
|       .----.        |
|     (________)      |
|       CLOUDY        |
+---------------------+
```

The underlying pieces are also available programmatically:

```js
const { replayTranscriptFile, replayEntries, parseTranscript } = require('./index.js');

// Reads a file from disk, parses each line, and replays the whole timeline.
const frames = replayTranscriptFile('path/to/transcript.jsonl');
frames[frames.length - 1].state.sky; // the final sky state

// parseTranscript/replayEntries are exposed separately for testing or for
// replaying transcript data already held in memory.
const entries = parseTranscript(jsonlText);
const sameFrames = replayEntries(entries);
```

Malformed or blank lines are skipped rather than aborting the replay, the
same tolerance the live hook entry point (`bin/hook.js`) applies to bad
input.

## Status

Built autonomously, one milestone at a time, and gated on passing tests —
each change must build and pass `npm test` before it is kept.
