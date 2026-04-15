## Issue

`tests/ui/storage-monitor-ui.spec.js` currently combines three separate UI concerns in one file: storage JSON import/export, startup item-title refresh, and playback monitor transitions. That mix makes the file harder to scan, harder to extend, and harder to use as the destination for future UI tests that only touch one of those subsystems.

The current file should be split before additional follow-up tests land so each test lives next to the subsystem it exercises.

## Solution

Split `tests/ui/storage-monitor-ui.spec.js` into the three files below, preserving the current test logic while regrouping it by responsibility.

### 1. `tests/ui/storage-json-ui.spec.js`

Use suite name `storage JSON import/export`.

Move these tests into this file:

1. `export/import JSON validation and valid import resets active session`

This file should own the textarea-based storage tooling and any new JSON export/import validation coverage.

### 2. `tests/ui/startup-item-refresh-ui.spec.js`

Use suite name `startup item title refresh`.

Move these tests into this file:

1. `startup title refresh updates missing title and tolerates failures`

This file should own bootstrap-time item-title hydration behavior and remain focused on startup refresh logic only.

### 3. `tests/ui/playback-monitor-ui.spec.js`

Use suite name `playback monitor transitions`.

Move these tests into this file:

1. `monitor advances on null context after observing current context`
2. `monitor mismatch detaches session with mismatch message`
3. `recoverable monitor errors show status/toast and keep session active`

This file should own interval-driven playback-monitor behavior and any future monitor-specific transition tests.

### 4. Source file handling

After the split, remove `tests/ui/storage-monitor-ui.spec.js` instead of leaving it behind as a mixed-purpose catch-all file.

### 5. Follow-up test placement

Once the split is complete, any new export/import-related coverage that was previously planned for `tests/ui/storage-monitor-ui.spec.js` should instead be added to `tests/ui/storage-json-ui.spec.js`.

### 6. Implementation is complete when

- `tests/ui/storage-monitor-ui.spec.js` no longer exists
- `tests/ui/storage-json-ui.spec.js` exists with suite name `storage JSON import/export`
- `tests/ui/startup-item-refresh-ui.spec.js` exists with suite name `startup item title refresh`
- `tests/ui/playback-monitor-ui.spec.js` exists with suite name `playback monitor transitions`
- the existing tests from `tests/ui/storage-monitor-ui.spec.js` are redistributed into those three files without changing their covered behaviors
- future storage JSON tests have a clear destination in `tests/ui/storage-json-ui.spec.js`
