## Issue

Android still reports many auth and playback errors with Android-specific wording and an 8-second notification cooldown, while the web app uses a shared reporting path, more consistent `Please reconnect.` and `Unable to ...` wording, and a 45-second cooldown for repeated error notifications.

## Solution

Align Android's non-import/export error reporting behavior with the web app.

- introduce or extend a shared error-reporting helper so auth, playback, skip, monitor, and startup failures all go through one path that can update status text and emit notifications
- change repeated error-notification suppression to use a 45-second cooldown so Android does not resurface the same error far more often than the web app
- align common auth and playback wording with web phrasing, including `Spotify session expired. Please reconnect.` and the `Unable to ... Please try again.` family used for start, reattach, skip, and validation failures
- use the generic web network message `Network error while contacting Spotify. Please try again.` when the failure is a transport or connectivity problem
- align playback-monitor recoverable failure copy with the web app's more generic status updates instead of Android-specific `temporary error` wording
- keep truly Android-only platform failures only where unavoidable, but route them through the same reporting helper so their presentation remains consistent with the rest of the app

This should make Android's auth and playback error reporting read and behave like the web app instead of surfacing a separate Android-specific message set and cooldown policy.

## Depends On

- `match-web-notification-ui-and-undo-action.md`: matching the web app's cooldown and error-reporting behavior depends on having a reusable in-app notification surface instead of native Android toasts
