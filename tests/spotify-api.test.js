import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { SpotifyApi, SpotifyApiHttpError } from '../src/spotify-api.js';

afterEach(() => {
  mock.restoreAll();
});

/** @typedef {{ refreshedToken: string | null }} DepState */

/** @returns {{ api: SpotifyApi; state: DepState }} */
function createApi() {
  /** @type {DepState} */
  const state = { refreshedToken: null };
  const api = new SpotifyApi({
    async getAccessToken() {
      return 'initial-token';
    },
    async refreshSpotifyAccessToken() {
      return state.refreshedToken;
    },
    handleAuthExpired() {},
  });
  return { api, state };
}

test('throws 401 and calls handleAuthExpired when no access token is available', async () => {
  const handleAuthExpired = mock.fn();
  const api = new SpotifyApi({
    async getAccessToken() {
      return null;
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired,
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
  assert.equal(handleAuthExpired.mock.callCount(), 1);
});

test('throws 401 when no access token is available even when throwOnError is false', async () => {
  const handleAuthExpired = mock.fn();
  const api = new SpotifyApi({
    async getAccessToken() {
      return null;
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired,
  });

  await assert.rejects(
    () => api.request('/me/player', { method: 'GET' }, false),
    /** @param {unknown} error */
    (error) => {
      assert.ok(error instanceof SpotifyApiHttpError);
      assert.equal(error.status, 401);
      return true;
    },
  );
  assert.equal(handleAuthExpired.mock.callCount(), 1);
});

test('retries once with refreshed token after 401 and succeeds', async () => {
  const { api, state } = createApi();
  state.refreshedToken = 'refreshed-token';

  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    if (fetchMock.mock.callCount() === 0) {
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

test('returns 401 response after failed refresh when throwOnError is false', async () => {
  const handleAuthExpired = mock.fn();
  const api = new SpotifyApi({
    async getAccessToken() {
      return 'initial-token';
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));

  const response = await api.request('/me/player', { method: 'GET' }, false);
  assert.equal(response.status, 401);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(handleAuthExpired.mock.callCount(), 1);
});

test('throws 401 after failed refresh when throwOnError is true', async () => {
  const handleAuthExpired = mock.fn();
  const api = new SpotifyApi({
    async getAccessToken() {
      return 'initial-token';
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));

  await assert.rejects(
    () => api.request('/me/player', { method: 'GET' }, true),
    /** @param {unknown} error */
    (error) => {
      assert.ok(error instanceof SpotifyApiHttpError);
      assert.equal(error.status, 401);
      return true;
    },
  );
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(handleAuthExpired.mock.callCount(), 1);
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

test(
  'TODO: cases 1 and 3 should produce the same result',
  { todo: 'Case 1 throws while case 3 returns a 401 response when throwOnError is false.' },
  async () => {
    const case1Api = new SpotifyApi({
      async getAccessToken() {
        return null;
      },
      async refreshSpotifyAccessToken() {
        return null;
      },
      handleAuthExpired() {},
    });

    const case3Api = new SpotifyApi({
      async getAccessToken() {
        return 'initial-token';
      },
      async refreshSpotifyAccessToken() {
        return null;
      },
      handleAuthExpired() {},
    });

    mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));

    const case1Result = await case1Api
      .request('/me/player', { method: 'GET' }, false)
      .then((response) => ({ kind: 'response', status: response.status }))
      .catch(
        /** @param {unknown} error */
        (error) => ({ kind: 'error', status: /** @type {SpotifyApiHttpError} */ (error).status }),
      );

    const case3Result = await case3Api
      .request('/me/player', { method: 'GET' }, false)
      .then((response) => ({ kind: 'response', status: response.status }))
      .catch(
        /** @param {unknown} error */
        (error) => ({ kind: 'error', status: /** @type {SpotifyApiHttpError} */ (error).status }),
      );

    assert.deepEqual(case1Result, case3Result);
  },
);

test('cases 2 and 4 produce the same result', async () => {
  const case2HandleAuthExpired = mock.fn();
  const case2Api = new SpotifyApi({
    async getAccessToken() {
      return null;
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired: case2HandleAuthExpired,
  });

  const case4HandleAuthExpired = mock.fn();
  const case4Api = new SpotifyApi({
    async getAccessToken() {
      return 'initial-token';
    },
    async refreshSpotifyAccessToken() {
      return null;
    },
    handleAuthExpired: case4HandleAuthExpired,
  });

  mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));

  const case2Result = await case2Api
    .request('/me/player', { method: 'GET' }, true)
    .then((response) => ({ kind: 'response', status: response.status }))
    .catch(
      /** @param {unknown} error */
      (error) => ({ kind: 'error', status: /** @type {SpotifyApiHttpError} */ (error).status }),
    );

  const case4Result = await case4Api
    .request('/me/player', { method: 'GET' }, true)
    .then((response) => ({ kind: 'response', status: response.status }))
    .catch(
      /** @param {unknown} error */
      (error) => ({ kind: 'error', status: /** @type {SpotifyApiHttpError} */ (error).status }),
    );

  assert.deepEqual(case2Result, case4Result);
  assert.equal(case2HandleAuthExpired.mock.callCount(), 1);
  assert.equal(case4HandleAuthExpired.mock.callCount(), 1);
});
