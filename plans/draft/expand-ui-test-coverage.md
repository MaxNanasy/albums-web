## Issue

`tests/ui/app-ui.spec.js` currently covers only three happy-path browser flows: adding an album, importing playlist albums across multiple pages with deduping, and starting playback.

That leaves most user-visible UI state transitions untested, including auth states, validation errors, list mutation, session stop/skip behavior, detached-session recovery, runtime restore, storage import/export, startup title refresh, and monitor-driven playback transitions.

## Solution

Add Playwright coverage for the remaining user-visible flows, grouped by behavior area so the suite stays readable and failures point to a narrow area of the app.

### 1. Auth and connection states

Add cases for:

- cold start with no token shows `Not connected.`
- disconnect clears auth state and shows the disconnect toast
- connected token missing playlist scopes shows the reconnect warning
- auth redirect with `?error=...` shows the authorization error state
- auth redirect with `?code=...` but no PKCE verifier shows the missing-verifier state
- failed code exchange shows the token-exchange failure state

### 2. Add-item parsing and validation

Add cases for:

- adding an album from a normal Spotify album URL
- adding a playlist from a Spotify playlist URL or URI
- invalid input shows the validation toast
- duplicate input shows `Item is already in your list.` and does not add a duplicate row
- add-item attempts while disconnected show the connect-first toast when title lookup is required
- title lookup failure shows the load-title failure toast

### 3. Playlist import unhappy paths and edge cases

Add cases for:

- import while disconnected shows the connect-first toast
- invalid playlist reference shows the playlist-validation toast
- Spotify error responses during import surface the formatted import failure message
- importing a playlist whose albums are already saved keeps the list unchanged and reports `Imported 0 album(s)...`
- importing a playlist with no album entries keeps the list unchanged and reports `0 unique album(s) found`

### 4. Saved-item removal and undo

Add cases for:

- removing an item deletes it from the rendered list and storage-backed UI
- clicking `Undo` restores the item at its original position
- undo after the same item was already re-added shows `Item is already in your list.` and does not duplicate it

### 5. Playback start guardrails

Add cases for:

- starting while disconnected shows `Connect Spotify first.`
- starting with an empty list shows `Add at least one album or playlist first.`
- playback start failures from Spotify stop or detach the session according to the app's current rules

### 6. Active-session controls

Add cases for:

- `Skip To Next` advances to the next queued item and updates queue rendering
- skipping from the final queued item finishes the session and clears active controls
- `Stop` ends the session, clears queue UI, and shows the stopped playback status
- active, inactive, and detached states each expose the expected enabled/disabled button states

### 7. Detached session and reattach flows

Add cases for:

- unrecoverable playback start errors (`401`, `403`, `404`) transition to detached state and reveal `Reattach`
- reattach with no queued item falls back to inactive state
- reattach with no usable token stays detached with the reconnect message
- reattach when Spotify is already on the expected context resumes without restarting playback
- reattach when Spotify is on a different context restarts the expected item
- reattach failures from recoverable Spotify errors surface the retry message without silently succeeding

### 8. Runtime restore on reload

Add cases for:

- an active persisted session restores queue, playback status, and active controls on page load
- a detached persisted session restores queue, playback status, and the `Reattach` control on page load
- invalid persisted runtime JSON is discarded without breaking the page
- an empty restored queue forces the session back to inactive state

### 9. Import/export JSON flows

Add cases for:

- export writes the expected JSON payload into the textarea
- valid import replaces saved items and resets any active session
- blank import input shows the paste-JSON validation toast
- invalid JSON shows the invalid-JSON toast
- non-object JSON shows the object-required toast
- missing `shuffle-by-album.items` shows the missing-items-array toast
- imported items with missing titles fall back to displaying their URI text

### 10. Startup item-title refresh

Add cases for:

- stored items missing titles are refreshed from Spotify on startup
- failed title refresh falls back to URI text for the affected row
- refresh errors do not prevent the rest of the page from rendering

### 11. Monitor-driven playback transitions

Add browser-level cases for:

- once the current context has been observed, a later `null` context advances to the next queued item
- once the current context has been observed, a different non-null context detaches the session with the mismatch message
- recoverable monitor errors surface playback-status and toast behavior without destroying the session

### 12. Implementation approach

- keep using the existing Playwright fixtures and Spotify route-recording helpers
- prefer one assertion-focused test per behavior branch rather than one oversized end-to-end spec
- keep deterministic control over queue order, timers, and persisted browser state so tests stay stable
- add helper utilities only when at least two tests need the same setup
- preserve the existing user-visible copy in assertions unless there is a deliberate copy change in a separate plan

### 13. Implementation is complete when

- each behavior group above has direct browser coverage for both its main success path and its main failure or edge path
- the Playwright suite covers auth, saved-items management, playlist import, session control, detached-session recovery, persistence restore, and storage transfer behavior end to end
- the suite remains readable enough that a failing test name identifies the broken behavior area without opening the implementation first
