## Issue

Android still uses different user-facing copy for several item-list and playlist-import actions. For example, add-item and playlist-import auth failures currently use Android-specific reconnect wording, and playlist import does not show the web app's `Importing albums from playlist...` progress message before it starts scanning the playlist.

## Solution

Align item-list and playlist-import action messages with the web app and the following target behavior.

- when add-item title loading cannot begin because there is no usable token, show `Connect Spotify first so the app can load item titles.`
- when playlist import cannot begin because there is no usable token, show `Connect Spotify first so the app can import albums.`
- before scanning playlist tracks, show the informational message `Importing albums from playlist...`
- keep the playlist-import success message in the web app's form: `Imported X album(s) from playlist (Y unique album(s) found).`
- format playlist-import failures with the web app's structure `Unable to import albums from that playlist (STATUS). DETAILS`, omitting `DETAILS` only when no detail text is available
- review nearby item-list and playlist-import success or failure strings and remove Android-specific reconnect wording when the target behavior above does not call for it

Implementation is complete when add-item and playlist-import flows use these exact messages and no longer depend on Android-specific wording for the cases covered here.

## Depends On

- `match-web-notification-ui-and-undo-action.md`: the item-list and playlist-import flows should use the shared in-app notification surface rather than Android native toasts once their copy is aligned with the web app
