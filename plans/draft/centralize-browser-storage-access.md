## Issue

Browser storage access is currently spread across `AuthFlow`, `ItemStore`, and `SessionController`, each of which reads and writes `localStorage` directly. That duplicates JSON parsing and cleanup logic, spreads storage-key usage across multiple modules, and makes it harder to test those modules without patching the global browser storage implementation.

The current split also makes future refactors of `app.js` and session persistence harder because storage concerns remain embedded inside otherwise focused domain modules.

## Solution

Introduce a small storage boundary that centralizes browser persistence mechanics while keeping current keys and serialized payloads unchanged.

### 1. Add a shared storage adapter

Create a small adapter such as `src/core/browser-storage.js` that wraps the raw browser API.

It should provide only the primitives the app needs, for example:

- `getItem(key)`
- `setItem(key, value)`
- `removeItem(key)`

Optionally add JSON-focused helpers if they simplify repeated parse/stringify behavior, but avoid building a large generic abstraction.

The adapter should default to `globalThis.localStorage` in production and accept a fake implementation in tests.

### 2. Move key-specific logic into focused storage modules

Create focused modules for the three current persistence domains:

- auth storage: token, refresh token, expiry, scope, and verifier keys
- item storage: saved items import/export, normalization, remove/restore persistence
- runtime storage: persisted session runtime load/save/clear behavior

These modules should own key names and JSON shape validation for their domain while depending on the shared storage adapter for actual reads and writes.

### 3. Inject storage into existing domain classes

Update `AuthFlow`, `ItemStore`, and `SessionController` so they depend on injected storage helpers instead of directly referencing `localStorage`.

This should:

- keep their public behavior unchanged
- reduce hidden global dependencies
- make tests use simple in-memory fakes instead of mutating global browser state

### 4. Migration constraints

- keep all current storage keys unchanged
- keep the current item export/import JSON payload shape unchanged
- keep the current runtime JSON payload shape unchanged unless `decouple-session-runtime-from-monitor.md` intentionally removes redundant fields
- avoid combining auth, items, and runtime into one large repository object

### 5. Test coverage to add or update

Add or update unit tests so each storage module covers:

- missing keys
- invalid JSON cleanup or fallback behavior
- valid round trips
- domain-specific normalization rules

The higher-level domain classes should then be tested against injected fakes rather than direct `localStorage` patching wherever practical.

### 6. Implementation is complete when

- only the shared storage adapter touches raw `localStorage`
- auth, item, and runtime persistence each have a single obvious owner
- key usage is localized instead of scattered across unrelated modules
- tests for auth, item, and runtime persistence can run without patching browser globals directly
