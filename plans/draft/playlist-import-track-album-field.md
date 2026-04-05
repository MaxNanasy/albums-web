## Issue

The web app reads playlist import albums from `entry.item.album`, while Android reads them from `entry.track.album`. If Spotify returns data in the shape expected by the web app, Android can miss albums that the web app imports.

## Solution

Audit the Spotify playlist-items response shape used by the web implementation and align Android's parser with it. In `fetchPlaylistAlbums()`:

- inspect both candidate paths while refactoring: the current `track.album` path and the web app's `item.album` path
- choose one canonical extraction path that matches the web implementation and the actual API payload
- add a small helper that extracts the album URI and title from one playlist item object so the mapping logic is explicit and testable
- keep URI-based deduplication unchanged

The goal is for the same playlist payload to produce the same imported album set on both platforms.