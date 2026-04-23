import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionController } from '#src/core/session-controller.js';

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

function createController() {
  /** @type {string[]} */
  const playbackStatuses = [];
  /** @type {{message: string; type: 'success' | 'info' | 'error' | undefined}[]} */
  const toasts = [];
  /** @type {string[]} */
  const renders = [];

  const controller = new SessionController({
    runtimeStorageKey: 'runtime',
    getUsableAccessToken: async () => 'token',
    spotifyAppApi: /** @type {import('#src/spotify-app-api.js').SpotifyAppApi} */ (/** @type {unknown} */ ({
      disableShuffle: async () => {},
      disableRepeat: async () => {},
      playContext: async () => {},
      getPlayerState: async () => ({ ok: true, status: 200, contextUri: null }),
    })),
    showToast: (message, type) => toasts.push({ message, type }),
    setPlaybackStatus: (message) => playbackStatuses.push(message),
    renderPlaybackControls: (activationState) => renders.push(`controls:${activationState}`),
    renderSessionQueue: (session) => renders.push(`queue:${session.index}`),
    reportError: () => {},
    isUnrecoverableSpotifyError: () => false,
    isUnrecoverableSpotifyStatus: () => false,
    spotifyStatusMessage: () => 'status',
    getItems: () => [{ type: 'album', uri: 'spotify:album:1', title: 'Album 1' }],
    shuffledCopy: (items) => items,
  });

  controller.setPlayerMonitor(/** @type {{start: () => void; stop: () => void}} */ ({ start: () => {}, stop: () => {} }));

  return { controller, playbackStatuses, toasts, renders };
}

test('startShuffleSession builds queue and marks active', async () => {
  installLocalStorage();
  const { controller, playbackStatuses } = createController();

  await controller.startShuffleSession();

  assert.equal(controller.getSession().activationState, 'active');
  assert.match(playbackStatuses.at(-1) ?? '', /Now playing album 1 of 1/i);
});

test('goToNextItem stops session when queue is exhausted', async () => {
  installLocalStorage();
  const { controller, playbackStatuses } = createController();

  await controller.startShuffleSession();
  await controller.goToNextItem();

  assert.equal(controller.getSession().activationState, 'inactive');
  assert.equal(playbackStatuses.at(-1), 'Finished: all selected albums/playlists were played');
});

test('restoreRuntimeState clears invalid runtime payload', () => {
  const store = installLocalStorage();
  store.set('runtime', '{bad json');

  const { controller } = createController();
  controller.restoreRuntimeState();

  assert.equal(store.has('runtime'), false);
});
