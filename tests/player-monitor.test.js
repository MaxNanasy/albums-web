import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerMonitor, PlayerMonitorStatusError } from '../src/player-monitor.js';

/** @typedef {import('../src/player-monitor.js').PlayerMonitorDeps} PlayerMonitorDeps */

/**
 * @param {{
 *   activationState?: 'inactive' | 'active' | 'detached';
 *   currentUri?: string | null;
 *   observedCurrentContext?: boolean;
 *   token?: string | null;
 *   playerState?: {ok: true; contextUri: string | null} | {ok: false; status: number; errorText: string};
 *   playerStateError?: Error;
 *   isUnrecoverable?: (status: number) => boolean;
 * }} [options]
 */
function createMonitor(options = {}) {
  const session = {
    activationState: options.activationState ?? 'active',
    currentUri: options.currentUri ?? 'spotify:album:current',
    observedCurrentContext: options.observedCurrentContext ?? false,
  };

  const detachedMessages = /** @type {string[]} */ ([]);
  const reportedErrors = /** @type {unknown[]} */ ([]);

  const persistRuntimeState = mock.fn();
  const transitionToDetached = mock.fn((/** @type {string} */ message) => {
    detachedMessages.push(message);
  });
  const goToNextItem = mock.fn(async () => {});
  const reportError = mock.fn((/** @type {unknown} */ error) => {
    reportedErrors.push(error);
  });
  const getUsableAccessToken = mock.fn(async () => (options.token === undefined ? 'token' : options.token));
  const getPlayerState = mock.fn(async () => {
    if (options.playerStateError) {
      throw options.playerStateError;
    }
    return options.playerState ?? { ok: true, contextUri: session.currentUri };
  });

  const deps = /** @type {PlayerMonitorDeps} */ ({
    getSession: () => session,
    getUsableAccessToken,
    spotifyAppApi: /** @type {import('../src/spotify-app-api.js').SpotifyAppApi} */ (
      /** @type {unknown} */ ({ getPlayerState })
    ),
    persistRuntimeState,
    transitionToDetached,
    goToNextItem,
    reportError,
    isUnrecoverableSpotifyStatus: options.isUnrecoverable ?? ((status) => status === 401),
  });

  return {
    session,
    monitor: new PlayerMonitor(deps),
    detachedMessages,
    reportedErrors,
    spies: {
      persistRuntimeState,
      transitionToDetached,
      goToNextItem,
      reportError,
      getUsableAccessToken,
      getPlayerState,
    },
  };
}

test('monitorPlayback marks context as observed and persists when player context matches current uri', async () => {
  const { session, monitor, spies } = createMonitor();

  await monitor.monitorPlayback();

  assert.equal(session.observedCurrentContext, true);
  assert.equal(spies.persistRuntimeState.mock.callCount(), 1);
  assert.equal(spies.transitionToDetached.mock.callCount(), 0);
});

test('monitorPlayback detaches when token is unavailable', async () => {
  const { monitor, detachedMessages, spies } = createMonitor({ token: null });

  await monitor.monitorPlayback();

  assert.deepEqual(detachedMessages, ['Spotify session expired. Please reconnect.']);
  assert.equal(spies.getPlayerState.mock.callCount(), 0);
});

test('monitorPlayback reports recoverable player-state status errors', async () => {
  const { monitor, reportedErrors } = createMonitor({
    playerState: { ok: false, status: 429, errorText: 'slow down' },
    isUnrecoverable: () => false,
  });

  await monitor.monitorPlayback();

  assert.equal(reportedErrors.length, 1);
  assert.ok(reportedErrors[0] instanceof PlayerMonitorStatusError);
  const playerMonitorError = /** @type {PlayerMonitorStatusError} */ (reportedErrors[0]);
  assert.equal(playerMonitorError.status, 429);
  assert.equal(playerMonitorError.errorText, 'slow down');
});

test('monitorPlayback advances when observed context becomes null', async () => {
  const { monitor, spies } = createMonitor({
    observedCurrentContext: true,
    playerState: { ok: true, contextUri: null },
  });

  await monitor.monitorPlayback();

  assert.equal(spies.goToNextItem.mock.callCount(), 1);
  assert.equal(spies.transitionToDetached.mock.callCount(), 0);
});

test('start catches monitor loop errors and forwards them to reportError', async () => {
  /** @type {() => void} */
  let intervalCallback = () => {};

  const setIntervalMock = mock.method(
    globalThis,
    'setInterval',
    /** @param {() => void} callback */
    (callback) => {
      intervalCallback = callback;
      return /** @type {ReturnType<typeof setInterval>} */ (/** @type {unknown} */ (17));
    },
  );

  const { monitor, reportedErrors } = createMonitor({ playerStateError: new Error('boom') });

  monitor.start();
  assert.equal(setIntervalMock.mock.callCount(), 1);
  intervalCallback();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(reportedErrors.length, 1);
  assert.ok(reportedErrors[0] instanceof Error);
  assert.match((/** @type {Error} */ (reportedErrors[0])).message, /boom/);
});
