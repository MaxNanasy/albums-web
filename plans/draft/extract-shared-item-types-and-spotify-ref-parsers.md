## Issue

Shared item concepts and Spotify reference parsing logic are still duplicated or stranded in the wrong place. `ItemType` and `ShuffleItem` typedefs are repeated across multiple files, while `parseSpotifyUri()`, `parseSpotifyPlaylistRef()`, and `spotifyIdFromUri()` still live in `src/app.js` even though they are domain helpers rather than composition-root logic.

That duplication makes future refactors more error-prone and encourages new modules to keep importing app-specific helpers or re-declaring the same item shapes.

## Solution

Extract shared item types and Spotify reference helpers into focused modules that can be imported across the app without pulling in `app.js`.

### 1. Create a shared item-types module

Add a small module for shared item JSDoc typedefs, for example `src/core/shuffle-item.js`.

It should provide the canonical definitions for at least:

- `ItemType`
- `ShuffleItem`
- any small supporting shapes that are currently repeated verbatim across files

Update existing modules to import these typedefs through JSDoc imports instead of re-declaring them locally where practical.

### 2. Create a Spotify reference helper module

Add a helper module such as `src/core/spotify-ref.js` that owns:

- `parseSpotifyUri()`
- `parseSpotifyPlaylistRef()`
- `spotifyIdFromUri()`
- any shared regex constants or small helper functions needed by those parsers

This module should keep the currently accepted inputs unchanged:

- Spotify album and playlist URIs
- Spotify album and playlist URLs
- raw playlist IDs for playlist import where currently supported

### 3. Preserve current return shapes and validation behavior

The extracted helpers should keep the current behavior unless there is a clearly intentional cleanup that can be adopted without broad downstream churn.

That includes:

- returning `null` for invalid values
- preserving the current item shape returned by URI parsing
- preserving playlist-ID-only support in playlist import parsing
- preserving current title fallback behavior in callers

### 4. Update current consumers

At minimum, update these current consumers to use the shared modules instead of local copies:

- `src/app.js`
- `src/core/item-store.js` typedef imports where helpful
- `src/core/session-controller.js` typedef imports where helpful
- `src/spotify-app-api.js` item-type typedef imports where helpful
- any tests that directly rely on the old helper location or repeated typedef comments

### 5. Test coverage to add or update

Add focused unit coverage for the extracted parsing helpers covering:

- valid album URI
- valid playlist URI
- valid Spotify album URL
- valid Spotify playlist URL
- raw playlist ID handling for playlist import parsing
- invalid hostname, invalid path, and malformed identifier cases

### 6. Guardrails

- do not broaden accepted identifier formats unless there is a deliberate feature change
- do not make the shared type module depend on browser APIs or application wiring
- keep the helper module domain-focused rather than mixing in API calls or storage logic

### 7. Implementation is complete when

- `app.js` no longer owns Spotify reference parsing helpers
- shared item typedefs have one canonical home instead of repeated local declarations
- parsing behavior remains compatible with the current add-item and playlist-import flows
- new modules can use shared item/reference helpers without depending on the composition root
