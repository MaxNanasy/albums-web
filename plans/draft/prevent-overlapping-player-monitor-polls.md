## Issue

`PlayerMonitor` currently starts a repeating `setInterval()` whose callback launches async work. If a monitor cycle takes longer than the interval, a second cycle can begin before the first finishes.

That overlap can duplicate `/me/player` traffic, race transitions like detach or auto-advance, and make monitoring bugs harder to reproduce because multiple cycles can observe and act on stale session state concurrently.

## Solution

Keep the current polling cadence, but make the monitor loop single-flight so one poll finishes before the next begins.

### 1. Replace the overlapping interval pattern

Refactor the monitor loop to use one of these equivalent single-flight patterns:

- recursive `setTimeout()` that schedules the next poll only after the current one settles
- a retained interval plus an explicit in-flight guard that skips overlapping executions

Prefer recursive `setTimeout()` if it keeps the control flow clearer.

### 2. Preserve start and stop semantics

The refactor should keep the current external behavior:

- `start()` still resets any prior loop before beginning a new one
- `stop()` still prevents future polls from running
- monitor errors still route through `reportError`
- the nominal poll cadence remains four seconds between checks, subject to the chosen single-flight design

If recursive `setTimeout()` is used, make sure `stop()` invalidates any pending timer and prevents rescheduling after shutdown.

### 3. Guard against stale completions

Ensure a late-finishing poll cannot restart monitoring or apply transitions after the monitor has been stopped or replaced.

Possible approaches include:

- a generation token incremented on each `start()` and `stop()`
- an `isRunning` flag checked before applying post-await actions or scheduling the next cycle

The important requirement is that an old async cycle becomes a no-op once the monitor has been stopped.

### 4. Test coverage to add or update

Add focused unit coverage for:

- no overlapping `spotifyAppApi.getPlayerState()` calls when a poll is slow
- `stop()` preventing future scheduling
- restarting the monitor canceling the old loop cleanly
- error reporting still occurring exactly once for a failing cycle

Use fake timers and a controllable async stub so the tests can prove overlap is prevented.

### 5. Guardrails

- do not change the user-visible detached-session or playback-status copy
- do not combine this change with broader session-state refactors unless a tiny API adjustment is unavoidable
- keep the monitor's playback decision logic unchanged apart from the scheduling model

### 6. Implementation is complete when

- at most one monitor poll can be in flight at a time
- stopping or restarting the monitor prevents stale async work from scheduling future polls
- monitor polling still happens on the intended cadence without overlapping executions
- the existing playback decision logic continues to run through the same error and transition paths
