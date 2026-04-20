import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { AuthFlow } from '#src/core/auth-flow.js';

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

function installBrowserState(href = 'http://127.0.0.1:4173/') {
  const locationRef = {
    origin: 'http://127.0.0.1:4173',
    pathname: '/',
    href,
  };
  Object.defineProperty(globalThis, 'location', {
    value: locationRef,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'history', {
    value: {
      replaceState: (/** @type {unknown} */ _data, /** @type {string} */ _unused, /** @type {string} */ url) => {
        locationRef.href = url;
      },
    },
    configurable: true,
    writable: true,
  });
  return locationRef;
}

/**
 * @param {{
 *   reportError?: (error: unknown, options: { context: string; fallbackMessage: string; authStatusMessage?: string; toastMode?: 'always'|'cooldown'; toastKey?: string; }) => void;
 *   setAuthStatus?: (message: string) => void;
 * }} [options]
 */
function createAuthFlow({ reportError = () => {}, setAuthStatus = () => {} } = {}) {
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
    setAuthStatus,
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
  assert.equal(authFlow.consumePendingRefreshFailureStatus(), 'Unable to restore Spotify session. Please reconnect.');
  assert.equal(authFlow.consumePendingRefreshFailureStatus(), null);
  fetchMock.mock.restore();
});

test('refreshSpotifyAccessToken reports network failures and returns null', async () => {
  const store = installLocalStorage();
  store.set('r', 'refresh-token');

  let reported = false;
  const authFlow = createAuthFlow({
    reportError: () => {
      reported = true;
    },
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down');
  });

  const token = await authFlow.refreshSpotifyAccessToken();

  assert.equal(token, null);
  assert.equal(reported, true);
  fetchMock.mock.restore();
});


test('handleAuthRedirect records an authorization error, clears the verifier, and removes the query', async () => {
  const store = installLocalStorage();
  store.set('v', 'verifier');
  installBrowserState('http://127.0.0.1:4173/?error=access_denied');

  /** @type {string[]} */
  const statuses = [];
  const authFlow = createAuthFlow({
    setAuthStatus: (message) => {
      statuses.push(message);
    },
  });

  await authFlow.handleAuthRedirect();

  assert.deepEqual(statuses, ['Spotify authorization denied.']);
  assert.equal(globalThis.localStorage.getItem('v'), null);
  assert.equal(globalThis.location.href, 'http://127.0.0.1:4173/');
});

test('handleAuthRedirect reports a missing verifier and clears the handled code from the URL', async () => {
  installLocalStorage();
  installBrowserState('http://127.0.0.1:4173/?code=abc123');

  /** @type {string[]} */
  const statuses = [];
  const authFlow = createAuthFlow({
    setAuthStatus: (message) => {
      statuses.push(message);
    },
  });

  await authFlow.handleAuthRedirect();

  assert.deepEqual(statuses, ['Missing PKCE verifier. Try connecting again.']);
  assert.equal(globalThis.location.href, 'http://127.0.0.1:4173/');
});

test('handleAuthRedirect reports exchange failures, clears the verifier, and removes the handled code', async () => {
  const store = installLocalStorage();
  store.set('v', 'verifier');
  installBrowserState('http://127.0.0.1:4173/?code=abc123');

  /** @type {string[]} */
  const statuses = [];
  const authFlow = createAuthFlow({
    setAuthStatus: (message) => {
      statuses.push(message);
    },
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('bad code', { status: 400 }));

  await authFlow.handleAuthRedirect();

  assert.deepEqual(statuses, ['Spotify token exchange failed: Network error while contacting Spotify. Please try again.']);
  assert.equal(globalThis.localStorage.getItem('v'), null);
  assert.equal(globalThis.location.href, 'http://127.0.0.1:4173/');
  fetchMock.mock.restore();
});

test('handleAuthRedirect reports invalid token responses after a successful exchange HTTP response', async () => {
  const store = installLocalStorage();
  store.set('v', 'verifier');
  installBrowserState('http://127.0.0.1:4173/?code=abc123');

  /** @type {string[]} */
  const statuses = [];
  const authFlow = createAuthFlow({
    setAuthStatus: (message) => {
      statuses.push(message);
    },
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 }));

  await authFlow.handleAuthRedirect();

  assert.deepEqual(statuses, ['Spotify token exchange failed: invalid token response.']);
  assert.equal(globalThis.localStorage.getItem('v'), null);
  assert.equal(globalThis.location.href, 'http://127.0.0.1:4173/');
  fetchMock.mock.restore();
});
