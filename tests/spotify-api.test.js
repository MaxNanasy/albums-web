import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { SpotifyApi, SpotifyApiHttpError } from '../src/spotify-api.js';

afterEach(() => {
  mock.restoreAll();
});

/** @typedef {{ calls: number; authExpiredCalls: number; refreshedToken: string | null }} DepState */

/** @returns {{ api: SpotifyApi; state: DepState }} */
function createApi() {
  /** @type {DepState} */
  const state = { calls: 0, authExpiredCalls: 0, refreshedToken: null };
  const api = new SpotifyApi({
    async getAccessToken() {
      state.calls += 1;
      return 'initial-token';
    },
    async refreshSpotifyAccessToken() {
      return state.refreshedToken;
    },
    handleAuthExpired() {
      state.authExpiredCalls += 1;
    },
  });
  return { api, state };
}

test('throws 401 and calls handleAuthExpired when no access token is available', async () => {
  let authExpiredCalls = 0;
  const api = new SpotifyApi({
    async getAccessToken() {
      return null;
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired() {
      authExpiredCalls += 1;
    },
  });

  await assert.rejects(
    () => api.request('/me/player', { method: 'GET' }),
    /** @param {unknown} error */
    (error) => {
      assert.ok(error instanceof SpotifyApiHttpError);
      assert.equal(error.status, 401);
      assert.match(error.message, /session expired/i);
      return true;
    },
  );
  assert.equal(authExpiredCalls, 1);
});

test('retries once with refreshed token after 401 and succeeds', async () => {
  const { api, state } = createApi();
  state.refreshedToken = 'refreshed-token';

  let fetchCallCount = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    fetchCallCount += 1;
    if (fetchCallCount === 1) {
      return new Response('', { status: 401 });
    }
    return new Response('{"ok":true}', { status: 200 });
  });

  const response = await api.request('/tracks/abc', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(fetchMock.mock.callCount(), 2);

  const firstCall = fetchMock.mock.calls[0];
  const secondCall = fetchMock.mock.calls[1];
  assert.equal(String(firstCall?.arguments[0]), 'https://api.spotify.com/v1/tracks/abc');

  const firstHeaders = /** @type {Record<string, string>} */ (firstCall?.arguments[1]?.headers);
  const secondHeaders = /** @type {Record<string, string>} */ (secondCall?.arguments[1]?.headers);
  assert.equal(firstHeaders.Authorization, 'Bearer initial-token');
  assert.equal(secondHeaders.Authorization, 'Bearer refreshed-token');
});

test('throws with status text and body for non-ok responses', async () => {
  const { api } = createApi();

  mock.method(globalThis, 'fetch', async () => new Response('extra details', { status: 404 }));

  await assert.rejects(
    () => api.request('/albums/missing', { method: 'GET' }),
    /** @param {unknown} error */
    (error) => {
      assert.ok(error instanceof SpotifyApiHttpError);
      assert.equal(error.status, 404);
      assert.match(error.message, /not found/i);
      assert.match(error.message, /extra details/i);
      return true;
    },
  );
});

test('returns non-ok response when throwOnError is false', async () => {
  const { api } = createApi();

  mock.method(globalThis, 'fetch', async () => new Response('bad request', { status: 400 }));

  const response = await api.request('/me/player', { method: 'GET' }, false);
  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
});
