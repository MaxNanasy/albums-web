## Issue

`src/app.js` still owns too many responsibilities after the earlier panel and core decomposition. It remains the composition root, but it also contains item-add validation, playlist import orchestration, auth-status evaluation, saved-title backfill logic, Spotify reference parsing, and a growing set of wrapper functions whose only purpose is to bridge other modules.

That concentration makes the file the default landing zone for unrelated changes and weakens the module boundaries established by the existing panel and core split.

## Solution

Keep `app.js` as the composition root, but reduce it to dependency construction, event wiring, bootstrap sequencing, and cross-module coordination that genuinely has no better owner.

### 1. Target `app.js` ownership after the refactor

`app.js` should keep only the following categories of code:

- storage-key, scope, and app-id constants
- DOM lookup needed to build panel instances
- dependency construction for `ToastPresenter`, `ItemStore`, `ErrorReporter`, `AuthFlow`, `SpotifyApi`, `SpotifyAppApi`, `SessionController`, and `PlayerMonitor`
- `bootstrap()` ordering and startup invocation
- event wiring between panel callbacks and extracted services/controllers
- small glue code that translates one module's output into another module's input when there is no reusable domain home for that logic

`app.js` should no longer be the primary owner of domain operations such as item parsing, item import, item-title backfill, or auth-status computation.

### 2. Extract the remaining non-composition responsibilities

Create or expand focused modules for the behaviors that are currently still embedded in `app.js`:

1. Item operations module
   - move `addItemFromInput()` and `removeItemWithUndo()` into a dedicated item-actions or item-coordinator module
   - give that module injected dependencies for item persistence, title lookup, duplicate detection, list rerender, input clearing, and toast/error reporting
   - keep user-visible copy unchanged

2. Playlist import module
   - move `importAlbumsFromPlaylist()` and `fetchPlaylistAlbums()` into a dedicated playlist-import service
   - keep URI parsing and Spotify pagination behavior unchanged
   - keep duplicate-filtering behavior and success/error toast copy unchanged

3. Saved-title backfill module
   - move `ensureStoredItemTitles()` and `withItemTitle()` into an item-metadata or item-title service
   - preserve the current startup timing: this still runs after auth validation and initial rendering
   - keep the current fallback behavior of using the URI when title lookup fails

4. Auth-status module
   - move `refreshAuthStatus()` into a small auth-status helper that receives the current token and granted scopes and returns the correct display copy
   - keep the current copy and scope rules unchanged

5. Thin wrapper cleanup
   - remove one-line wrappers in `app.js` once extracted modules can receive direct dependencies instead
   - examples include wrappers whose only job is to forward to `authFlow`, `itemStore`, or `sessionController`

### 3. Extraction order

1. Land shared parsing/type helpers from `extract-shared-item-types-and-spotify-ref-parsers.md` first so the new services do not import parsing utilities back from `app.js`.
2. Extract playlist import and title backfill next, because they are the most self-contained async workflows in the file.
3. Extract add/remove item actions once the shared item helpers exist.
4. Extract auth-status calculation.
5. Delete obsolete wrappers and leave `app.js` as wiring plus bootstrap.

### 4. Guardrails

- do not change `index.html` ids or section structure
- do not change bootstrap order or session startup behavior
- do not change user-visible copy for add/import/auth flows as part of this refactor
- do not move `SessionController`, `PlayerMonitor`, or auth token persistence logic into panel modules
- avoid creating a new "god service" that merely relocates all of `app.js` into another file

### 5. Implementation is complete when

- `app.js` reads primarily as a composition root instead of a domain module
- item add/remove, playlist import, title backfill, and auth-status evaluation each have a single obvious owner outside `app.js`
- extracted modules can be unit-tested with injected dependencies and without DOM setup
- `app.js` no longer contains Spotify reference parsing or long async workflows for item management/import

## Depends On

- `extract-shared-item-types-and-spotify-ref-parsers.md`: shared item types and Spotify reference helpers should move first so new modules do not keep importing them from `app.js`.
