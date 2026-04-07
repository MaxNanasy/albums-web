## Issue

Android still uses different user-facing copy for several item-list and playlist-import actions. For example, add-item and playlist-import auth failures currently use Android-specific reconnect wording, and playlist import does not show the web app's `Importing albums from playlist...` progress message before it starts scanning the playlist.

## Solution

Align item-list and playlist-import action messages with the web app.

- when add-item title loading cannot begin because there is no usable token, show `Connect Spotify first so the app can load item titles.`
- when playlist import cannot begin because there is no usable token, show `Connect Spotify first so the app can import albums.`
- before scanning playlist tracks, show the informational message `Importing albums from playlist...`
- keep the playlist-import success message in the web app's form: `Imported X album(s) from playlist (Y unique album(s) found).`
- align playlist-import failure formatting with the web app's structure `Unable to import albums from that playlist (STATUS). DETAILS`
- review nearby item-list and playlist-import success/failure strings so they use web wording rather than Android-specific reconnect phrasing when the web app does not mention reconnect

This should make the item-list and playlist-import actions read the same way on Android as they do on the web app.

## Depends On

- `match-web-notification-ui-and-undo-action.md`: the item-list and playlist-import flows should use the shared in-app notification surface rather than Android native toasts once their copy is aligned with the web app
