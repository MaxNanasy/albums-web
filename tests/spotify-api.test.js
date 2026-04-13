import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

import { SpotifyApi, SpotifyApiHttpError } from '../src/spotify-api.js';

/** @typedef {'refresh-success' | 'throw-404' | 'allow-400'} WorkerScenario */
/** @typedef {{url: string; init: RequestInit | undefined}} FetchCall */
/** @typedef {{kind: 'ok'; payload: {status: number; ok: boolean; fetchCalls: FetchCall[]}} | {kind: 'error'; payload: {status: number | null; message: string; fetchCalls: FetchCall[]}}} WorkerResult */

/**
 * Executes SpotifyApi.request in an isolated worker realm with a worker-local fetch.
 * This avoids mutating the main realm's globalThis.fetch.
 *
 * @param {WorkerScenario} scenario
 * @returns {Promise<WorkerResult>}
 */
function runRequestInShadowRealm(scenario) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spotify-api.worker.js', import.meta.url), {
      env: { ...process.env, SPOTIFY_API_TEST_SCENARIO: scenario },
    });

    worker.once('message', /** @param {WorkerResult} value */ (value) => resolve(value));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
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
  const result = await runRequestInShadowRealm('refresh-success');
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') throw new Error('Expected success result');

  assert.equal(result.payload.status, 200);
  assert.equal(result.payload.fetchCalls.length, 2);

  const firstHeaders = /** @type {Record<string, string>} */ (result.payload.fetchCalls[0]?.init?.headers);
  const secondHeaders = /** @type {Record<string, string>} */ (result.payload.fetchCalls[1]?.init?.headers);
  assert.equal(firstHeaders.Authorization, 'Bearer initial-token');
  assert.equal(secondHeaders.Authorization, 'Bearer refreshed-token');
});

test('throws with status text and body for non-ok responses', async () => {
  const result = await runRequestInShadowRealm('throw-404');
  assert.equal(result.kind, 'error');
  if (result.kind !== 'error') throw new Error('Expected error result');

  assert.equal(result.payload.status, 404);
  assert.match(result.payload.message, /not found/i);
  assert.match(result.payload.message, /extra details/i);
});

test('returns non-ok response when throwOnError is false', async () => {
  const result = await runRequestInShadowRealm('allow-400');
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') throw new Error('Expected success result');

  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.status, 400);
});
