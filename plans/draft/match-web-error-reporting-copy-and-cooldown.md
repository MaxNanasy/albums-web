## Issue

Android still reports many auth and playback errors with Android-specific wording and an 8-second notification cooldown. The target behavior, matching the web app, is a shared reporting path, consistent `Please reconnect.` and `Unable to ...` wording, a generic network-error message, and a 45-second cooldown for repeated error notifications.

## Solution

Align Android's non-import/export error reporting behavior with the web app and the following rules.

- introduce or extend a shared error-reporting helper so auth, playback, skip, monitor, and startup failures all go through one path that can update status text and emit notifications
- change repeated error-notification suppression to use a 45-second cooldown so Android does not resurface the same error far more often than the web app
- use `Spotify session expired. Please reconnect.` for expired-auth cases rather than shorter Android-only reconnect wording
- use the `Unable to ... Please try again.` family for start, reattach, skip, and validation failures where a more specific target message is not required
- use the generic web network message `Network error while contacting Spotify. Please try again.` when the failure is a transport or connectivity problem
- align playback-monitor recoverable failure copy with the web app's more generic status updates instead of Android-specific `temporary error` phrasing
- keep truly Android-only platform failures only where unavoidable, but route them through the same reporting helper so their presentation remains consistent with the rest of the app

Implementation is complete when repeated auth and playback errors use the same wording family and cooldown policy described here instead of the current Android-specific variants, and read and behave like the web app.

## Depends On

- `match-web-notification-ui-and-undo-action.md`: matching the web app's cooldown and error-reporting behavior depends on having a reusable in-app notification surface instead of native Android toasts
