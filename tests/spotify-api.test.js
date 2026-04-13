import test from 'node:test';
import assert from 'node:assert/strict';

import { SpotifyApi, SpotifyApiHttpError } from '../src/spotify-api.js';

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
  const api = new SpotifyApi({
    async getAccessToken() {
      return null;
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired() {},
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
});

test('retries once with refreshed token after 401 and succeeds', async () => {
  const { api, state } = createApi();
  state.refreshedToken = 'refreshed-token';

  /** @type {Array<{url: string; init: RequestInit | undefined}>} */
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = /** @type {typeof fetch} */ (async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    if (fetchCalls.length === 1) {
      return new Response('', { status: 401 });
    }
    return new Response('{"ok":true}', { status: 200 });
  });

  try {
    const response = await api.request('/tracks/abc', { method: 'GET' });
    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0]?.url, 'https://api.spotify.com/v1/tracks/abc');

    const firstHeaders = /** @type {Record<string, string>} */ (fetchCalls[0]?.init?.headers);
    const secondHeaders = /** @type {Record<string, string>} */ (fetchCalls[1]?.init?.headers);
    assert.equal(firstHeaders.Authorization, 'Bearer initial-token');
    assert.equal(secondHeaders.Authorization, 'Bearer refreshed-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('throws with status text and body for non-ok responses', async () => {
  const { api } = createApi();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = /** @type {typeof fetch} */ (async () => new Response('extra details', { status: 404 }));

  try {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns non-ok response when throwOnError is false', async () => {
  const { api } = createApi();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = /** @type {typeof fetch} */ (async () => new Response('bad request', { status: 400 }));

  try {
    const response = await api.request('/me/player', { method: 'GET' }, false);
    assert.equal(response.ok, false);
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
