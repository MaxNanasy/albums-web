## Issue

The Spotify client layer is split sensibly between `SpotifyApi` for authenticated transport and `SpotifyAppApi` for app-specific endpoints, but the higher-level client still repeats the same response-handling patterns: request, inspect `ok`, parse text or JSON, and map the result into local success or failure shapes.

That repetition increases the chance of drift across endpoints and makes new Spotify operations more likely to copy slightly different response handling, error text extraction, or JSON parsing conventions.

## Solution

Keep the current two-layer client structure, but normalize endpoint response handling so new Spotify operations use shared helpers instead of open-coded request parsing.

### 1. Preserve the current transport boundary

Keep `SpotifyApi` responsible for:

- adding authorization headers
- retrying after token refresh on `401`
- triggering auth-expired handling when no usable token remains
- throwing `SpotifyApiHttpError` when `throwOnError` is enabled

Do not move endpoint-specific JSON mapping into `SpotifyApi`.

### 2. Add reusable helpers for app-level endpoints

Refactor `SpotifyAppApi` to use a small set of internal helpers for common patterns such as:

- request returning `{ ok: false, status, errorText }`
- request returning JSON on success and structured failure on error
- request returning `void` for success-only playback commands
- response-text extraction with consistent fallback behavior when error bodies are empty

These helpers can be private methods on `SpotifyAppApi`; they do not need to become shared public utilities unless another module actually needs them.

### 3. Apply the helpers to existing endpoints

Update the current methods to share the same parsing approach:

- `getPlayerState()`
- `disableShuffle()`
- `disableRepeat()`
- `playContext()`
- `getPlaylistAlbumsPage()`
- `getItemTitle()`

Keep their external return shapes and playback semantics unchanged unless there is a clear simplification that does not require broad downstream updates.

### 4. Add a consistent endpoint-result vocabulary

Where endpoint methods return structured results instead of throwing, make their success and failure shapes read consistently across the file.

Examples:

- same naming for `status` and `errorText`
- same success/failure ordering in type definitions
- same conventions for empty-body fallbacks

This should make the file easier to scan and reduce one-off parsing branches.

### 5. Guardrails

- do not change Spotify endpoint paths or request payload semantics
- do not weaken the current `401` refresh behavior in `SpotifyApi`
- do not convert every endpoint to throwing behavior if the current callers rely on structured `ok` results
- keep public method names stable unless there is a compelling cleanup reason

### 6. Implementation is complete when

- `SpotifyAppApi` no longer repeats raw response parsing patterns in every method
- endpoint methods share a small, consistent set of internal request helpers
- structured success/failure results use the same vocabulary and fallback behavior throughout the file
- callers can add new Spotify operations without copy-pasting response-handling boilerplate
