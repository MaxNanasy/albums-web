## Issue

Outside the data import/export section, Android still differs from the web app in several visible labels and helper strings. Examples include the subtitle text, the playlist-import button label, the missing URL/playlist-ID tip below the URI field, and the `Skip` button label.

## Solution

Update the non-data static UI copy so sections 1 through 3 match the web app.

- change the subtitle to `Randomly cycles through your saved set of Spotify albums/playlists while keeping each item's tracks in order.`
- change the playlist-import button text from `Import Albums` to `Import Albums From Playlist`
- add the helper line below the URI input: `Tip: You can paste a normal Spotify URL and it will be converted. For playlist imports, you can also paste a playlist ID.`
- change the skip button text from `Skip` to `Skip To Next`
- review the remaining visible static text in sections 1 through 3 and align any leftover wording differences with the web app where platform constraints do not require a separate Android-only phrase

This should make the visible non-import/export screen copy match the web UI more closely before any action is taken.
