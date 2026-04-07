## Issue

Android still relies on native `Toast` notifications plus a separate undo banner container for item removal. The target behavior, matching the web app's approach, is a single in-app notification surface that shows transient success, info, and error messages and can embed an `Undo` action in the same notification.

## Solution

Replace the current notification and undo UI with one shared in-app notification system modeled on the web app's transient notification behavior.

- add an in-app notification stack to the main screen instead of relying on `Toast.makeText(...)`
- support success, info, and error variants so playback, auth, item-list, and playlist-import messages can share one presentation model
- support an optional action button so removal notifications can offer `Undo` in the notification itself instead of using a separate banner area
- support explicit dismissal and timed auto-dismiss behavior for notifications
- route item removal through this notification surface using `Removed “title”.` with an `Undo` action, and show `Restored “title”.` after a successful undo
- preserve the duplicate-restore guard that reports `Item is already in your list.` if the removed item was already re-added before undo runs
- remove the dedicated undo banner layout/container and the banner-specific bookkeeping once item undo uses the shared notification UI
- expose notification helpers that other plans can reuse for web-matching copy and cooldown behavior

This should eliminate the remaining banner-vs-toast divergence and make Android's transient feedback model match the web app much more closely.
