## Issue

The web repo has several user-visible strings that should be aligned with the new cross-platform wording.

## Solution

Add the following text updates in production code and the affected UI tests.

| Context | Current text | Change to |
| --- | --- | --- |
| Add-item success toast after a valid album or playlist is added | `Item added.` | `Added “<title>”.` |
| Playback status after an unrecoverable Spotify playback-start error detaches the session | `Playback detached due to a Spotify error. Reattach when ready.` | `Playback detached due to a Spotify error: <error>.` |
| Playback status after a recoverable reattach failure | `Unable to reattach right now. Please try again.` | `Failed to reattach: <error>.` |
| Toast after a recoverable reattach failure | `Failed to reattach Spotify playback.` | `Failed to reattach.` |
| Next-item session control label | `Skip To Next` | `Next` |
| Playlist import button label in the item-management panel | `Import Albums From Playlist` | `Import Albums` |
| Playlist import failure toast after Spotify returns an error | `Unable to import albums from that playlist (<status>). <details>` | `Error importing albums: <error>.` |

Implementation notes:

- Update production strings in `src/app.js`, `src/core/session-controller.js`, and `index.html`.
- Update the affected UI assertions in `tests/ui/item-add-ui.spec.js`, `tests/ui/detached-runtime-ui.spec.js`, `tests/ui/playback-ui.spec.js`, and `tests/ui/playlist-import-ui.spec.js`.
- Keep the existing contextual error details, but format them so they fit the new `<error>` placeholders.
