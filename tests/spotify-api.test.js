import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { SpotifyApi, SpotifyApiHttpError } from '../src/spotify-api.js';

afterEach(() => {
  mock.restoreAll();
});

/** @typedef {{ kind: 'response' | 'error'; status: number }} RequestOutcome */
/**
 * @typedef {{
 * name: string;
 * accessToken: string | null;
 * refreshedToken: string | null;
 * throwOnError: boolean;
 * fetchStatuses: number[];
 * expectedOutcome: RequestOutcome;
 * expectedHandleAuthExpiredCalls: number;
 * expectedFetchCalls: number;
 * }} AuthCase
 */

/**
 * @param {{ accessToken: string | null; refreshedToken: string | null; handleAuthExpired: () => void }} deps
 * @returns {SpotifyApi}
 */
function createApi(deps) {
  return new SpotifyApi({
    async getAccessToken() {
      return deps.accessToken;
    },
    async refreshSpotifyAccessToken() {
      return deps.refreshedToken;
    },
    handleAuthExpired: deps.handleAuthExpired,
  });
}

/**
 * @param {AuthCase} authCase
 * @returns {Promise<{ outcome: RequestOutcome; handleAuthExpiredCalls: number; fetchCalls: number }>}
 */
async function runAuthCase(authCase) {
  const handleAuthExpired = mock.fn();
  const api = createApi({
    accessToken: authCase.accessToken,
    refreshedToken: authCase.refreshedToken,
    handleAuthExpired,
  });

  let fetchCallIndex = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    const status = authCase.fetchStatuses[fetchCallIndex] ?? 500;
    fetchCallIndex += 1;
    return new Response('', { status });
  });

  /** @type {RequestOutcome} */
  let outcome;
  try {
    const response = await api.request('/me/player', { method: 'GET' }, authCase.throwOnError);
    outcome = { kind: 'response', status: response.status };
  } catch (error) {
    if (!(error instanceof SpotifyApiHttpError)) {
      assert.fail('Expected SpotifyApiHttpError');
    }
    outcome = { kind: 'error', status: error.status };
  }

  return {
    outcome,
    handleAuthExpiredCalls: handleAuthExpired.mock.callCount(),
    fetchCalls: fetchMock.mock.callCount(),
  };
}

/** @type {AuthCase[]} */
const authCases = [
  {
    name: 'no access token with throwOnError false',
    accessToken: null,
    refreshedToken: null,
    throwOnError: false,
    fetchStatuses: [],
    expectedOutcome: { kind: 'error', status: 401 },
    expectedHandleAuthExpiredCalls: 1,
    expectedFetchCalls: 0,
  },
  {
    name: 'no access token with throwOnError true',
    accessToken: null,
    refreshedToken: null,
    throwOnError: true,
    fetchStatuses: [],
    expectedOutcome: { kind: 'error', status: 401 },
    expectedHandleAuthExpiredCalls: 1,
    expectedFetchCalls: 0,
  },
  {
    name: 'refresh returns null after 401 with throwOnError false',
    accessToken: 'initial-token',
    refreshedToken: null,
    throwOnError: false,
    fetchStatuses: [401],
    expectedOutcome: { kind: 'response', status: 401 },
    expectedHandleAuthExpiredCalls: 1,
    expectedFetchCalls: 1,
  },
  {
    name: 'refresh returns null after 401 with throwOnError true',
    accessToken: 'initial-token',
    refreshedToken: null,
    throwOnError: true,
    fetchStatuses: [401],
    expectedOutcome: { kind: 'error', status: 401 },
    expectedHandleAuthExpiredCalls: 1,
    expectedFetchCalls: 1,
  },
  {
    name: '401 response after refresh returns non-null with throwOnError false',
    accessToken: 'initial-token',
    refreshedToken: 'refreshed-token',
    throwOnError: false,
    fetchStatuses: [401, 401],
    expectedOutcome: { kind: 'response', status: 401 },
    expectedHandleAuthExpiredCalls: 1,
    expectedFetchCalls: 2,
  },
];

/**
 * @typedef {{
 * name: string;
 * todo?: string;
 * run: () => Promise<void>;
 * }} TableTest
 */

/** @type {TableTest[]} */
const tableTests = [
  ...authCases.map((authCase) => ({
    name: `auth case: ${authCase.name}`,
    run: async () => {
      const result = await runAuthCase(authCase);
      assert.deepEqual(result.outcome, authCase.expectedOutcome);
      assert.equal(result.handleAuthExpiredCalls, authCase.expectedHandleAuthExpiredCalls);
      assert.equal(result.fetchCalls, authCase.expectedFetchCalls);
    },
  })),
  {
    name: 'retries once with refreshed token after 401 and succeeds',
    run: async () => {
      const api = createApi({
        accessToken: 'initial-token',
        refreshedToken: 'refreshed-token',
        handleAuthExpired() {},
      });

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
    },
  },
  {
    name: 'throws with status text and body for non-ok responses',
    run: async () => {
      const api = createApi({
        accessToken: 'initial-token',
        refreshedToken: null,
        handleAuthExpired() {},
      });

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
    },
  },
  {
    name: 'returns non-ok response when throwOnError is false',
    run: async () => {
      const api = createApi({
        accessToken: 'initial-token',
        refreshedToken: null,
        handleAuthExpired() {},
      });

      mock.method(globalThis, 'fetch', async () => new Response('bad request', { status: 400 }));

      const response = await api.request('/me/player', { method: 'GET' }, false);
      assert.equal(response.ok, false);
      assert.equal(response.status, 400);
    },
  },
  {
    name: 'cases no access token with throwOnError false and refresh returns null after 401 with throwOnError false produce the same result',
    todo: 'No-token path throws while refresh-null path returns response when throwOnError is false.',
    run: async () => {
      const noTokenFalse = await runAuthCase(authCases[0]);
      const refreshNullFalse = await runAuthCase(authCases[2]);
      assert.deepEqual(noTokenFalse.outcome, refreshNullFalse.outcome);
    },
  },
  {
    name: 'cases no access token with throwOnError true and refresh returns null after 401 with throwOnError true produce the same result',
    run: async () => {
      const noTokenTrue = await runAuthCase(authCases[1]);
      const refreshNullTrue = await runAuthCase(authCases[3]);
      assert.deepEqual(noTokenTrue.outcome, refreshNullTrue.outcome);
      assert.equal(noTokenTrue.handleAuthExpiredCalls, refreshNullTrue.handleAuthExpiredCalls);
    },
  },
];

for (const tableTest of tableTests) {
  if (tableTest.todo) {
    test(tableTest.name, { todo: tableTest.todo }, tableTest.run);
  } else {
    test(tableTest.name, tableTest.run);
  }
}
