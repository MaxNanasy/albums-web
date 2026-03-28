# Shuffle By Album (Android)

This repository now contains a native Android project that replaces the previous web app.

## Where are the equivalents to `index.html` and `app.js`?

- `index.html` equivalent: `app/src/main/res/layout/activity_main.xml` (all primary screen structure and controls).
- `app.js` equivalent: `app/src/main/java/com/example/shufflebyalbum/MainActivity.kt` (state management, URI parsing, shuffle session flow, storage import/export).

## Project layout

- `app/`: Android application module.
- `build.gradle.kts`: Root Gradle build configuration.
- `settings.gradle.kts`: Gradle settings and module declarations.

## Open in Android Studio

1. Open Android Studio.
2. Choose **Open** and select this repository root.
3. Let Gradle sync.
4. Run the `app` configuration on an emulator or Android device.

## Implemented Android behavior

- Add/remove Spotify album or playlist references.
- Parse either Spotify URI format or open.spotify.com URLs.
- Build and step through a shuffled queue.
- Export/import persisted item storage as JSON.
