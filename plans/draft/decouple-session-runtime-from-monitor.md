## Issue

`SessionController` currently owns both the session state machine and the runtime persistence format, while `PlayerMonitor` receives the live session object, mutates `observedCurrentContext` directly, and then asks `SessionController` to persist the mutation.

That coupling makes it harder to reason about who owns session transitions, who is allowed to mutate runtime state, and which fields are part of the durable runtime format. It also leaves redundant serialized state behind, such as the stored `active` field that duplicates `activationState`.

## Solution

Make `SessionController` the only module allowed to mutate session runtime state, and treat `PlayerMonitor` as a reporter of playback observations rather than a direct state editor.

### 1. Tighten the runtime ownership boundary

Change the `PlayerMonitor` to operate on explicit `SessionController` APIs instead of a mutable session object.

Replace the current dependency shape with a smaller contract such as:

- `getPlaybackExpectation()` returning an immutable snapshot containing only the fields the monitor needs
- `markExpectedContextObserved()` for the current-context success path
- `advanceWhenPlaybackEnded()` or `goToNextItem()` only after the controller validates the session is still active
- `detachForUnexpectedContext(message)` for non-null context mismatches
- existing detached/error transitions where they still make sense

The important rule is that `PlayerMonitor` should stop mutating `session.observedCurrentContext` itself.

### 2. Isolate runtime serialization

Move runtime serialization and restoration into a dedicated helper or runtime-storage module that `SessionController` owns.

That helper should:

- validate the runtime JSON shape
- normalize queue items and index bounds
- derive inactive state when the queue is empty
- remove obsolete or invalid runtime data
- stop serializing the redundant `active` boolean once restore no longer depends on it

Keep the storage key and user-visible runtime behavior unchanged.

### 3. Clarify state transitions

Document and enforce which methods are allowed to change each runtime field:

- session start initializes queue, index, `currentUri`, and observed flags
- play-current-item resets the observed flags for the newly active item
- reattach marks the current context as observed only through controller-owned logic
- inactive and detached transitions stop monitoring and persist or clear runtime state consistently

This should leave one obvious place to inspect when debugging runtime persistence or detached-session behavior.

### 4. Test coverage to add or update

Add or update unit tests to cover:

- monitor success path without direct session mutation
- runtime restore when stored data is malformed or partially missing
- omission of the redundant serialized `active` field
- controller-owned transitions for observed-context changes
- reattach and auto-advance behavior remaining equivalent after the boundary change

### 5. Guardrails

- keep current user-visible playback and detached-session copy unchanged
- do not change the queue format or stored runtime key name
- do not let `PlayerMonitor` gain more persistence knowledge during the refactor
- do not broaden monitor responsibilities beyond playback observation and error routing

### 6. Implementation is complete when

- `PlayerMonitor` no longer mutates the live session object returned by `SessionController`
- `SessionController` is the only owner of runtime-state mutations and persistence writes
- runtime serialization no longer stores redundant fields that restore logic does not use
- the runtime state machine is easier to inspect because mutations happen through explicit controller methods
