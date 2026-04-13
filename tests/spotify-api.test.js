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

/** @typedef {{ kind: 'response' | 'error'; status: number }} AuthScenarioOutcome */
/**
 * @typedef {{
 * caseId: 1 | 2 | 3 | 4;
 * accessToken: string | null;
 * refreshedToken: string | null;
 * throwOnError: boolean;
 * expectedKind: AuthScenarioOutcome['kind'];
 * expectedFetchCalls: number;
 * }} AuthScenarioCase
 */

/**
 * @param {AuthScenarioCase} scenario
 * @returns {Promise<{ outcome: AuthScenarioOutcome; handleAuthExpiredCalls: number; fetchCalls: number }>}
 */
async function runAuth401Scenario(scenario) {
  const handleAuthExpired = mock.fn();
  const api = new SpotifyApi({
    async getAccessToken() {
      return scenario.accessToken;
    },
    async refreshSpotifyAccessToken() {
      return scenario.refreshedToken;
    },
    handleAuthExpired,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  /** @type {AuthScenarioOutcome} */
  let outcome;
  try {
    const response = await api.request('/me/player', { method: 'GET' }, scenario.throwOnError);
    outcome = { kind: 'response', status: response.status };
  } catch (error) {
    outcome = {
      kind: 'error',
      status: error instanceof SpotifyApiHttpError ? error.status : 500,
    };
  }

  return {
    outcome,
    handleAuthExpiredCalls: handleAuthExpired.mock.callCount(),
    fetchCalls: fetchMock.mock.callCount(),
  };
}

/** @type {AuthScenarioCase[]} */
const auth401Scenarios = [
  { caseId: 1, accessToken: null, refreshedToken: null, throwOnError: false, expectedKind: 'error', expectedFetchCalls: 0 },
  { caseId: 2, accessToken: null, refreshedToken: null, throwOnError: true, expectedKind: 'error', expectedFetchCalls: 0 },
  {
    caseId: 3,
    accessToken: 'initial-token',
    refreshedToken: null,
    throwOnError: false,
    expectedKind: 'response',
    expectedFetchCalls: 1,
  },
  {
    caseId: 4,
    accessToken: 'initial-token',
    refreshedToken: null,
    throwOnError: true,
    expectedKind: 'error',
    expectedFetchCalls: 1,
  },
];

for (const scenario of auth401Scenarios) {
  test(`case ${scenario.caseId}: expected auth behavior`, async () => {
    const result = await runAuth401Scenario(scenario);

    assert.deepEqual(result.outcome, { kind: scenario.expectedKind, status: 401 });
    assert.equal(result.handleAuthExpiredCalls, 1);
    assert.equal(result.fetchCalls, scenario.expectedFetchCalls);
  });
}

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
    const case1Result = await runAuth401Scenario(auth401Scenarios[0]);
    const case3Result = await runAuth401Scenario(auth401Scenarios[2]);
    assert.deepEqual(case1Result.outcome, case3Result.outcome);
  },
);

test('cases 2 and 4 produce the same result', async () => {
  const case2Result = await runAuth401Scenario(auth401Scenarios[1]);
  const case4Result = await runAuth401Scenario(auth401Scenarios[3]);
  assert.deepEqual(case2Result.outcome, case4Result.outcome);
  assert.equal(case2Result.handleAuthExpiredCalls, case4Result.handleAuthExpiredCalls);
});
