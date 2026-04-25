import test from 'node:test';
import assert from 'node:assert/strict';

import { SpotifyAppApi } from '#src/spotify-app-api.js';

/** @typedef {import('#src/spotify-api.js').SpotifyApi} SpotifyApi */

/**
 * @param {(path: string, requestInit: RequestInit, throwOnError?: boolean) => Promise<Response>} handler
 */
function createAppApi(handler) {
  /** @type {Array<{path: string; requestInit: RequestInit; throwOnError: boolean}>} */
  const calls = [];
  const spotifyApi = /** @type {SpotifyApi} */ (
    /** @type {unknown} */ ({
      /** @param {string} path @param {RequestInit} requestInit @param {boolean} [throwOnError=true] */
      request(path, requestInit, throwOnError = true) {
        calls.push({ path, requestInit, throwOnError });
        return handler(path, requestInit, throwOnError);
      },
    })
  );

  const appApi = new SpotifyAppApi(spotifyApi);
  return { appApi, calls };
}

test('getPlayerState returns a no-content type for 204 responses', async () => {
  const { appApi, calls } = createAppApi(async () => new Response(null, { status: 204 }));

  const state = await appApi.getPlayerState();

  assert.deepEqual(state, { ok: true, status: 204, type: 'no-content' });
  assert.deepEqual(calls[0], { path: '/me/player', requestInit: { method: 'GET' }, throwOnError: false });
});

test('getPlayerState returns error payload for non-ok responses', async () => {
  const { appApi } = createAppApi(async () => new Response('device unavailable', { status: 404 }));

  const state = await appApi.getPlayerState();
  assert.deepEqual(state, { ok: false, status: 404, errorText: 'device unavailable' });
});

test('getPlayerState returns a snapshot type with context uri from response body', async () => {
  const { appApi } = createAppApi(
    async () => new Response('{"context":{"uri":"spotify:playlist:abc"}}', { status: 200 }),
  );

  const state = await appApi.getPlayerState();
  assert.deepEqual(state, { ok: true, status: 200, type: 'snapshot', contextUri: 'spotify:playlist:abc' });
});

test('getPlayerState returns a snapshot type with null context from response body', async () => {
  const { appApi } = createAppApi(async () => new Response('{"context":null}', { status: 200 }));

  const state = await appApi.getPlayerState();
  assert.deepEqual(state, { ok: true, status: 200, type: 'snapshot', contextUri: null });
});

test('disableShuffle and disableRepeat call expected endpoints', async () => {
  const { appApi, calls } = createAppApi(async () => new Response(null, { status: 204 }));

  await appApi.disableShuffle();
  await appApi.disableRepeat();

  assert.equal(calls[0]?.path, '/me/player/shuffle?state=false');
  assert.equal(calls[1]?.path, '/me/player/repeat?state=off');
  assert.deepEqual(calls[0]?.requestInit, { method: 'PUT' });
  assert.deepEqual(calls[1]?.requestInit, { method: 'PUT' });
});

test('playContext sends expected payload', async () => {
  const { appApi, calls } = createAppApi(async () => new Response(null, { status: 204 }));

  await appApi.playContext('spotify:album:xyz');

  assert.equal(calls[0]?.path, '/me/player/play');
  assert.equal(calls[0]?.requestInit.method, 'PUT');
  assert.equal(
    calls[0]?.requestInit.body,
    JSON.stringify({
      context_uri: 'spotify:album:xyz',
      offset: { position: 0 },
      position_ms: 0,
    }),
  );
});

test('getPlaylistAlbumsPage maps album ids and uri values and sets hasNext', async () => {
  const payload = {
    items: [
      { item: { album: { uri: 'spotify:album:first', name: ' First ' } } },
      { item: { album: { id: 'second', name: 'Second' } } },
      { item: { album: { name: 'Missing identifiers' } } },
      { item: null },
    ],
    next: 'https://next-page',
  };

  const { appApi, calls } = createAppApi(async () => new Response(JSON.stringify(payload), { status: 200 }));

  const result = await appApi.getPlaylistAlbumsPage('playlist123', 10, 25);

  assert.equal(calls[0]?.throwOnError, false);
  assert.match(calls[0]?.path ?? '', /^\/playlists\/playlist123\/items\?/);
  assert.ok((calls[0]?.path ?? '').includes('limit=25'));
  assert.ok((calls[0]?.path ?? '').includes('offset=10'));
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    albums: [
      { uri: 'spotify:album:first', title: 'First' },
      { uri: 'spotify:album:second', title: 'Second' },
    ],
    hasNext: true,
  });
});

test('getPlaylistAlbumsPage returns failure shape when request fails', async () => {
  const { appApi } = createAppApi(async () => new Response('forbidden', { status: 403 }));

  const result = await appApi.getPlaylistAlbumsPage('playlist123', 0, 50);
  assert.deepEqual(result, { ok: false, status: 403, errorText: 'forbidden' });
});

test('getItemTitle resolves album and playlist names and trims values', async () => {
  const responses = new Map([
    ['/albums/album1', new Response('{"name":" Album Title "}', { status: 200 })],
    ['/playlists/pl1', new Response('{"name":" Playlist Title "}', { status: 200 })],
    ['/playlists/empty', new Response('{"name":"  "}', { status: 200 })],
    ['/albums/missing', new Response('', { status: 404 })],
  ]);

  const { appApi } = createAppApi(async (path) => responses.get(path) ?? new Response('', { status: 500 }));

  assert.equal(await appApi.getItemTitle('album', 'album1'), 'Album Title');
  assert.equal(await appApi.getItemTitle('playlist', 'pl1'), 'Playlist Title');
  assert.equal(await appApi.getItemTitle('playlist', 'empty'), null);
  assert.equal(await appApi.getItemTitle('album', 'missing'), null);
});
