import { parentPort } from 'node:worker_threads';

import { SpotifyApi } from '../src/spotify-api.js';

/** @typedef {'refresh-success' | 'throw-404' | 'allow-400'} WorkerScenario */
const scenario = /** @type {WorkerScenario} */ (process.env.SPOTIFY_API_TEST_SCENARIO);

/** @type {Array<{url: string; init: RequestInit | undefined}>} */
const fetchCalls = [];
const fetchImpl = /** @type {(url: string | URL | Request, init?: RequestInit) => Promise<Response>} */ (
  async (url, init) => {
    fetchCalls.push({ url: String(url), init });

    if (scenario === 'refresh-success') {
      if (fetchCalls.length === 1) return new Response('', { status: 401 });
      return new Response('{"ok":true}', { status: 200 });
    }

    if (scenario === 'throw-404') {
      return new Response('extra details', { status: 404 });
    }

    return new Response('bad request', { status: 400 });
  }
);
const realmGlobal = /** @type {{fetch?: unknown}} */ (/** @type {unknown} */ (globalThis));
realmGlobal.fetch = fetchImpl;

const api = new SpotifyApi({
  async getAccessToken() {
    return 'initial-token';
  },
  async refreshSpotifyAccessToken() {
    return scenario === 'refresh-success' ? 'refreshed-token' : null;
  },
  handleAuthExpired() {},
});

try {
  if (scenario === 'allow-400') {
    const response = await api.request('/me/player', { method: 'GET' }, false);
    parentPort?.postMessage({ kind: 'ok', payload: { status: response.status, ok: response.ok, fetchCalls } });
  } else {
    const response = await api.request('/tracks/abc', { method: 'GET' });
    parentPort?.postMessage({ kind: 'ok', payload: { status: response.status, ok: response.ok, fetchCalls } });
  }
} catch (error) {
  parentPort?.postMessage({
    kind: 'error',
    payload: {
      status: /** @type {{status?: number}} */ (/** @type {unknown} */ (error)).status ?? null,
      message: error instanceof Error ? error.message : String(error),
      fetchCalls,
    },
  });
}
