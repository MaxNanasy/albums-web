import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { AuthFlow } from '../src/core/auth-flow.js';

function installLocalStorage() {
  /** @type {Map<string, string>} */
  const store = new Map();
  globalThis.localStorage = /** @type {Storage} */ (/** @type {unknown} */ ({
    getItem: (/** @type {string} */ key) => (store.has(key) ? store.get(key) : null),
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
      store.set(key, value);
    },
    removeItem: (/** @type {string} */ key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  }));
  return store;
}

function createAuthFlow(reportError = () => {}) {
  return new AuthFlow({
    scopes: ['a'],
    spotifyAppId: 'id',
    storageKeys: {
      verifier: 'v',
      token: 't',
      refreshToken: 'r',
      tokenExpiry: 'e',
      tokenScope: 's',
    },
    reportError,
    setAuthStatus: () => {},
  });
}

test('getToken and getGrantedScopes read current auth state', () => {
  const store = installLocalStorage();
  const authFlow = createAuthFlow();

  store.set('t', 'abc');
  store.set('e', String(Date.now() + 10_000));
  store.set('s', 'playlist-read-private playlist-read-collaborative');

  assert.equal(authFlow.getToken(), 'abc');
  assert.equal(authFlow.getGrantedScopes().has('playlist-read-private'), true);
});

test('refreshSpotifyAccessToken captures a validation failure status for non-ok responses', async () => {
  const store = installLocalStorage();
  store.set('r', 'refresh-token');

  const authFlow = createAuthFlow();

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('bad refresh', { status: 400 }));

  const token = await authFlow.refreshSpotifyAccessToken();

  assert.equal(token, null);
  assert.equal(authFlow.consumePendingRefreshFailureStatus(), 'Unable to validate Spotify session. Please reconnect.');
  assert.equal(authFlow.consumePendingRefreshFailureStatus(), null);
  fetchMock.mock.restore();
});

test('refreshSpotifyAccessToken reports network failures and returns null', async () => {
  const store = installLocalStorage();
  store.set('r', 'refresh-token');

  let reported = false;
  const authFlow = createAuthFlow(() => {
    reported = true;
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down');
  });

  const token = await authFlow.refreshSpotifyAccessToken();

  assert.equal(token, null);
  assert.equal(reported, true);
  fetchMock.mock.restore();
});
