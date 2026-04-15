## Issue

`tests/ui/storage-monitor-ui.spec.js` and `tests/ui/add-import-ui.spec.js` each combine multiple UI concerns in a single file. `tests/ui/storage-monitor-ui.spec.js` mixes storage JSON import/export, startup item-title refresh, and playback monitor transitions. `tests/ui/add-import-ui.spec.js` mixes manual single-item add behavior with playlist album import behavior. Those mixed-purpose files are harder to scan, harder to extend, and harder to use as the destination for future UI tests that only touch one subsystem.

These files should be split before additional follow-up tests land so each test lives next to the subsystem it exercises.

## Solution

Split the existing mixed-purpose UI specs into focused files, preserving current test logic while regrouping tests by responsibility.

### 1. Split `tests/ui/storage-monitor-ui.spec.js`

#### 1.1 `tests/ui/storage-json-ui.spec.js`

Use suite name `storage JSON import/export`.

Move these tests into this file:

1. `export/import JSON validation and valid import resets active session`

This file should own the textarea-based storage tooling and any new JSON export/import validation coverage.

#### 1.2 `tests/ui/startup-item-refresh-ui.spec.js`

Use suite name `startup item title refresh`.

Move these tests into this file:

1. `startup title refresh updates missing title and tolerates failures`

This file should own bootstrap-time item-title hydration behavior and remain focused on startup refresh logic only.

#### 1.3 `tests/ui/playback-monitor-ui.spec.js`

Use suite name `playback monitor transitions`.

Move these tests into this file:

1. `monitor advances on null context after observing current context`
2. `monitor mismatch detaches session with mismatch message`
3. `recoverable monitor errors show status/toast and keep session active`

This file should own interval-driven playback-monitor behavior and any future monitor-specific transition tests.

#### 1.4 Source file handling

After the split, remove `tests/ui/storage-monitor-ui.spec.js` instead of leaving it behind as a mixed-purpose catch-all file.

### 2. Split `tests/ui/add-import-ui.spec.js`

#### 2.1 `tests/ui/item-add-ui.spec.js`

Use suite name `item add`.

Move these tests into this file:

1. `adds an album from normal Spotify URL`
2. `adds a playlist from Spotify playlist URL`
3. `duplicate and invalid input show validation toasts`
4. `add while disconnected and title lookup failure both show toasts`

This file should own manual single-item add behavior, validation, duplicate handling, and title lookup failures for the add form.

#### 2.2 `tests/ui/playlist-import-ui.spec.js`

Use suite name `playlist album import`.

Move these tests into this file:

1. `imports playlist albums across pages and skips saved duplicates`
2. `playlist import unhappy paths and no-op imports`
3. `importing playlist with all albums already saved keeps list unchanged`

This file should own playlist album import flows, playlist reference parsing, pagination, duplicate skipping, and import-specific error handling.

#### 2.3 Source file handling

After the split, remove `tests/ui/add-import-ui.spec.js` instead of leaving it behind as a mixed-purpose catch-all file.

### 3. Follow-up test placement

Once the split is complete:

- new export/import-related coverage that was previously planned for `tests/ui/storage-monitor-ui.spec.js` should be added to `tests/ui/storage-json-ui.spec.js`
- new playlist-import-related coverage that was previously planned for `tests/ui/add-import-ui.spec.js` should be added to `tests/ui/playlist-import-ui.spec.js`
- future add-form coverage should be added to `tests/ui/item-add-ui.spec.js`

### 4. Implementation is complete when

- `tests/ui/storage-monitor-ui.spec.js` no longer exists
- `tests/ui/add-import-ui.spec.js` no longer exists
- `tests/ui/storage-json-ui.spec.js` exists with suite name `storage JSON import/export`
- `tests/ui/startup-item-refresh-ui.spec.js` exists with suite name `startup item title refresh`
- `tests/ui/playback-monitor-ui.spec.js` exists with suite name `playback monitor transitions`
- `tests/ui/item-add-ui.spec.js` exists with suite name `item add`
- `tests/ui/playlist-import-ui.spec.js` exists with suite name `playlist album import`
- the existing tests from `tests/ui/storage-monitor-ui.spec.js` are redistributed into those three files without changing their covered behaviors
- the existing tests from `tests/ui/add-import-ui.spec.js` are redistributed into those two files without changing their covered behaviors
- future storage JSON tests have a clear destination in `tests/ui/storage-json-ui.spec.js`
- future playlist import tests have a clear destination in `tests/ui/playlist-import-ui.spec.js`
