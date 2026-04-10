## Issue

The playback monitor currently advances only when Spotify stops reporting the expected context, but recent `/me/player` responses show a different terminal state for completed albums/playlists: playback is paused at the beginning of the first track in the same context. The web app needs a replacement detector that treats that reset state as completion.

## Solution

- Add a persisted runtime boolean `observedPastFirstTrack`, initialized to `false` whenever a session starts a new item, detaches, stops, or otherwise resets playback state.
- Add a helper `isFirstTrack(playerResponse)` that returns `true` only when `playerResponse.actions.disallows.skipping_prev` is truthy.
- Update the playback monitor so that, when Spotify reports the expected context:
  - it continues to set `observedCurrentContext = true`;
  - it sets `observedPastFirstTrack = true` once `isFirstTrack(player response)` is false;
  - it triggers `goToNextItem()` immediately when all of the following are true on a single poll: `observedCurrentContext`, `observedPastFirstTrack`, `isFirstTrack(playerResponse)`, `playerResponse.progress_ms === 0` and `playerResponse.is_playing === false`;
  - it resets `observedPastFirstTrack = false` when the expected context returns to the first track in any case that does not trigger the next album/playlist, so a manual restart does not stay armed.
- Keep the existing no-debounce behavior: a single qualifying monitor response advances immediately.
- Preserve the existing detached-session behavior when Spotify reports a different non-null context than the one the app expects.
