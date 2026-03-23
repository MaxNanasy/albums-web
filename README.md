# Spotify Album & Playlist Shuffler

A static web app that:

- Connects to Spotify using Authorization Code + PKCE (no backend).
- Lets you choose from your saved albums and playlists.
- Persists your selected items in `localStorage`.
- Shuffles selected albums/playlists as groups.
- Plays tracks in order within each selected album/playlist before moving to the next shuffled group.

## Run locally

Because this app uses Spotify auth redirects, run it from a local web server (not `file://`).

```bash
python3 -m http.server 4173
```

Then open: <http://localhost:4173>

## Spotify setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app and copy its Client ID.
3. Add your app URL (for example `http://localhost:4173/`) as a Redirect URI.
4. Paste the Client ID in the app and click **Connect**.

## Type-checking

This app uses JavaScript + JSDoc with the TypeScript compiler for checks:

```bash
npx tsc -p jsconfig.json
```

No build step is required to deploy; serve these files as static assets.
