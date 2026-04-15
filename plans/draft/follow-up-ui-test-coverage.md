## Issue

The current Playwright suite still leaves several user-visible branches untested after the earlier UI coverage expansion. The remaining gaps are concentrated around successful auth flows, silent token refresh behavior, playlist-import reference parsing, corrupted export data, recoverable reattach failures, and playlist-specific playback copy.

These gaps already sit next to related coverage in the existing spec files, except for the storage JSON coverage that should move with the `storage-monitor-ui.spec.js` split.

## Solution

Add the remaining UI coverage to the existing or newly split spec files below. Insert each new test at the stated position so related behaviors stay grouped and the suite remains easy to scan.

### 1. `tests/ui/auth-ui.spec.js`

Insert the following tests in this order:

1. Immediately after `cold start without token shows disconnected and disconnect clears auth`:
   `connect button stores a PKCE verifier and redirects to Spotify authorize`
   - clear auth state before load
   - click `Connect`
   - assert `shuffle-by-album.pkceVerifier` is written
   - assert the authorize URL contains `response_type=code`, the current page as `redirect_uri`, all four scopes, `code_challenge_method=S256`, a non-empty `code_challenge`, and `show_dialog=true`

2. Immediately after the new connect test and before `missing playlist scopes shows reconnect warning`:
   `expired access token with refresh token silently refreshes during bootstrap`
   - seed an expired `shuffle-by-album.token`, a refresh token, and missing or stale scope data
   - mock `POST https://accounts.spotify.com/api/token` with a successful refresh payload
   - assert startup ends at `Connected.`
   - assert the stored access token and expiry are replaced
   - assert refreshed scope data is persisted when the response includes `scope`

3. Immediately after the refresh-success test and before `missing playlist scopes shows reconnect warning`:
   `expired access token with unsuccessful refresh falls back to disconnected startup state`
   - seed an expired access token plus refresh token
   - mock a non-OK refresh response
   - assert the page renders `Not connected.` instead of treating the expired token as usable

4. Immediately after `auth redirect with code and missing verifier keeps code and leaves session disconnected` and before `failed code exchange attempts token request and keeps code in URL`:
   `successful code exchange stores tokens, clears verifier, and removes code from the URL`
   - seed `shuffle-by-album.pkceVerifier`
   - mock a successful token exchange with `access_token`, `refresh_token`, `expires_in`, and full scope text
   - assert the final URL is `/`
   - assert `Connected.` is visible
   - assert the verifier key is removed
   - assert stored auth fields match the response

### 2. `tests/ui/add-import-ui.spec.js`

Insert the following tests in this order:

1. Immediately after `imports playlist albums across pages and skips saved duplicates`:
   `imports playlist albums from a Spotify playlist URL`
   - fill the input with `https://open.spotify.com/playlist/playlist123`
   - mock a one-page playlist-items response
   - assert import succeeds and requests `/v1/playlists/playlist123/items...`, proving URL parsing works for playlist import and not only for raw playlist IDs

2. Immediately after the new URL-import test and before `playlist import unhappy paths and no-op imports`:
   `imports playlist albums from a Spotify playlist URI`
   - fill the input with `spotify:playlist:playlist123`
   - mock a one-page playlist-items response
   - assert the same import success path works for URI input

### 3. `tests/ui/storage-json-ui.spec.js`

Insert the following test immediately after `export/import JSON validation and valid import resets active session`:

- `export with invalid stored items JSON clears the textarea and shows an export error`
  - seed `shuffle-by-album.items` directly to malformed JSON via init script
  - click `Export Data JSON`
  - assert `#storage-json` is emptied
  - assert the toast reads `Unable to export saved items because stored data is invalid JSON.`

### 4. `tests/ui/detached-runtime-ui.spec.js`

Insert the following test immediately after `reattach with matched context resumes without restarting playback` and before `reattach with mismatched context restarts expected item`:

- `recoverable reattach player-state failure shows retry UI and keeps the session detached`
  - seed a detached runtime with one queued item
  - mock `GET /v1/me/player` to return a recoverable status such as `429` or `500`
  - click `Reattach`
  - assert playback status becomes `Unable to reattach right now. Please try again.`
  - assert the error toast uses `Failed to reattach Spotify playback.`
  - assert the `Reattach` button remains visible so the session stays detached

### 5. `tests/ui/playback-ui.spec.js`

Insert the following test immediately after `starts playback` and before `start guardrails and active controls for start/skip/stop/final item`:

- `starts playback for a saved playlist item`
  - seed one saved `playlist` item such as `spotify:playlist:playlist123`
  - reuse the existing shuffle, repeat, and play route stubs
  - assert the playback status reads `Now playing playlist 1 of 1: ...`
  - assert the queue row shows the playlist title rather than album-specific copy

### 6. Scope notes

- No new follow-up test is needed in `tests/ui/item-list-ui.spec.js`; the remaining gaps do not add new remove/undo behavior beyond the current coverage.
- Keep this plan scoped to new UI tests only. Do not change app behavior or visible copy as part of implementing the tests.
- Prefer one behavior-focused test per branch above instead of folding multiple new branches into an existing broad test.

### 7. Implementation is complete when

- each new test above exists in the stated spec file and at the stated position relative to the current surrounding tests
- `tests/ui/auth-ui.spec.js` covers connect-start PKCE redirect, refresh-success bootstrap, refresh-failure bootstrap, and successful code exchange
- `tests/ui/add-import-ui.spec.js` covers playlist import parsing for both Spotify playlist URLs and Spotify playlist URIs
- `tests/ui/storage-json-ui.spec.js` covers the corrupted-export-data error branch
- `tests/ui/detached-runtime-ui.spec.js` covers recoverable reattach player-state failures
- `tests/ui/playback-ui.spec.js` covers playlist-item playback copy

## Depends On

- `split-storage-monitor-ui-spec.md`: splits `tests/ui/storage-monitor-ui.spec.js` into focused files so the new storage export test lands in the correct long-term home.
