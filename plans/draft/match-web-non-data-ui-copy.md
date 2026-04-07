## Issue

Outside the data import/export section, Android still differs from the web app in several visible labels and helper strings. Examples include the subtitle text, the playlist-import button label, the missing URL/playlist-ID tip below the URI field, and the `Skip` button label.

## Solution

Update the non-data static UI copy so sections 1 through 3 match the web app and use the following text.

- change the subtitle to `Randomly cycles through your saved set of Spotify albums/playlists while keeping each item's tracks in order.`
- change the playlist-import button text from `Import Albums` to `Import Albums From Playlist`
- add a helper line below the URI input that says `Tip: You can paste a normal Spotify URL and it will be converted. For playlist imports, you can also paste a playlist ID.`
- change the skip button text from `Skip` to `Skip To Next`
- review the remaining visible static text in sections 1 through 3 and align any leftover wording differences with the web app unless Android has a platform requirement that makes identical wording impossible

Implementation is complete when the screen text a user sees before taking any action matches this wording for the non-data sections.
