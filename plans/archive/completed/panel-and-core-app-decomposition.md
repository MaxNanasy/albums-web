## Issue

`src/app.js` is still the main owner of DOM wiring, auth flow, saved items, session orchestration, playback controls, import/export, and toast/error presentation. `PlayerMonitor`, `SpotifyApi`, and `SpotifyAppApi` are already separate modules, so the next refactor step is no longer "split anything possible" but "define stable module boundaries for the rest of the app."

Refactoring purely by UI panel would be too shallow because auth, saved items, session state, runtime persistence, and playback behavior all cross panel boundaries.

## Solution

Refactor the app toward a hybrid structure:

- panel modules own DOM queries, rendering, and event binding for the existing top-level sections in `index.html`
- shared modules own state, persistence, parsing, and Spotify/browser side effects that are reused across sections
- `app.js` becomes a composition root that builds dependencies, wires modules together, runs bootstrap, and owns only cross-module orchestration that has no better home

### 1. Target module boundaries

#### Panel modules

- `src/panels/auth-panel.js`: connect/disconnect controls and auth-status rendering
- `src/panels/items-panel.js`: add-item form, saved-item list render/remove/undo, playlist-import trigger, and URI-input interactions
- `src/panels/session-panel.js`: start/skip/stop/reattach controls, playback-status rendering, and queue rendering
- `src/panels/storage-panel.js`: export/import buttons and data-JSON textarea interactions

Panel modules should:

- receive either their own element refs or a small root element to query within
- expose explicit render and bind entry points rather than running hidden startup work
- never read or write Spotify APIs, `localStorage`, or timers directly except through injected dependencies
- avoid directly calling into other panels; cross-panel effects should flow through shared services or callbacks supplied by `app.js`

#### Shared/browser modules

- `src/ui/toast-presenter.js`: current toast DOM creation, action button wiring, and dismiss lifecycle
- `src/core/error-reporter.js`: `reportError()`, monitor-specific reporting, cooldown bookkeeping, and auth/playback status fanout hooks
- `src/core/item-store.js`: item loading/saving, normalization, and remove/restore helpers
- `src/core/storage-transfer.js`: import/export JSON validation and external data-shape handling
- `src/core/auth-flow.js`: token lookup, refresh, callback handling, and scope-aware auth-status helper
- `src/core/session-controller.js`: session state transitions, runtime persistence, shuffle queue setup, play/reattach/advance orchestration, and the `PlayerMonitor` bridge
- keep `src/player-monitor.js`, `src/spotify-api.js`, and `src/spotify-app-api.js` as shared modules rather than panel code

Exact filenames can change during implementation, but the ownership rules should stay the same.

### 2. Extraction order

1. Freeze contracts first.
   - Keep current `SessionState`, storage keys, user-visible copy, and HTML ids stable during the refactor.
   - Identify the smallest public contracts each extracted module needs, then move code behind those contracts without behavior changes.
2. Extract shared helpers before panels.
   - Move toast rendering and keyed error cooldown/reporting out of `app.js`.
   - Move item persistence and import/export parsing helpers out of `app.js`.
   - Move runtime/session persistence helpers out of `app.js`.
   - Move auth token and callback helpers out of `app.js`.
   This reduces the amount of business logic panel modules would otherwise duplicate.
3. Extract panel modules around the existing HTML sections.
   - Move render/bind code for auth, items, session, and storage into dedicated panel modules.
   - Keep panel modules thin: they should translate UI events into callback invocations and render state passed in from outside.
   - Avoid letting panel modules become mini-controllers with hidden copies of app state.
4. Shrink `app.js` into a composition root.
   - Construct APIs and shared controllers.
   - Create panel instances.
   - Wire callbacks between panels and shared services.
   - Run bootstrap in the current order.
   - Trigger rerenders when shared state changes.
5. Backfill tests around extracted units.
   - Preserve existing `player-monitor` coverage.
   - Add tests for pure parsing and normalization helpers plus any extracted session-state helpers.
   - Prefer narrow unit tests over large DOM integration tests unless behavior cannot be exercised otherwise.

### 3. Guardrails

- do not change the visible section structure or element ids in `index.html` as part of this plan
- do not change storage formats, toast copy, auth copy, or playback semantics as part of this refactor
- do not move `PlayerMonitor` back into a panel module
- do not let multiple modules independently own the same `localStorage` key or session transition
- keep bootstrap order equivalent to the current implementation: hook events, restore runtime state, process auth redirect, validate or refresh auth, render current state, then backfill missing titles
- keep panel boundaries UI-focused; any code that is reused across panels should default to a shared module

### 4. Implementation is complete when

- `app.js` no longer contains raw DOM-manipulation code for every section
- each top-level panel in `index.html` has a matching panel module or clearly equivalent view module
- `localStorage`, Spotify auth, playlist-import parsing, session persistence, and toast/error behavior each have a single obvious owner outside panel code
- shared modules can be read without needing to inspect unrelated DOM sections
- rerender paths remain behaviorally equivalent to the current app, including startup restore, removal undo, playlist import, reattach, and monitor-driven auto-advance
