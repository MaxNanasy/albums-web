## Issue

After a successful session start, Android currently replaces the playback status set by `playCurrentItem()` with the generic text `Monitoring playback.`. The web app briefly shows `Session started with N item(s).` before playback begins and then leaves the final success state as `Now playing ...`.

## Solution

Make Android's start-session status flow match the web app.

- after shuffling the queue, persisting runtime state, and rendering the queue/controls, set the transient status text `Session started with N item(s).`
- keep `playCurrentItem()` as the code path that decides the final success status text for the current queue item
- when playback start succeeds, start monitor polling without overwriting the `Now playing ...` status produced by `playCurrentItem()`
- preserve the detached and stopped outcomes returned by the playback-start flow instead of forcing a generic active-monitoring message
- if a shared helper is introduced for entering the active state, make sure it can start monitoring and persist/render state without replacing an already-correct playback status string

This should make Android show the same success status progression as the web app: a brief session-start message followed by the current `Now playing ...` line.
