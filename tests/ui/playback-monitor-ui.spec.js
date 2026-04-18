import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, playbackStatus, seedConnectedAuth, seedItems, toastMessage } from './common.js';

/** @typedef {typeof globalThis & { __monitorCallbacks: Array<() => void> }} TestGlobal */

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Playback Monitor Transitions', () => {
  test('Monitor advances on null context after observing current context', async ({ context, page }) => {
    await context.addInitScript(() => {
      /** @type {Array<() => void>} */
      const callbacks = [];
      /** @type {TestGlobal} */ (globalThis).__monitorCallbacks = callbacks;
      window.setInterval =
        /** @type {typeof window.setInterval} */
        ((/** @type {TimerHandler} */ handler) => {
          if (typeof handler === 'function') {
            callbacks.push(() => handler());
          }
          return /** @type {unknown} */ (callbacks.length);
        });
      window.clearInterval = () => {};
      Math.random = () => 0.999;
    });

    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);

    let monitorState = 'match-one';
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/shuffle'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/repeat'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/play'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/me/player'),
        handle: (route) =>
          route.fulfill({
            status: monitorState === 'null' ? 204 : 200,
            ...(monitorState === 'null' ? { body: '' } : { json: { context: { uri: 'spotify:album:one' } } }),
          }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(playbackStatus(page)).toHaveText('Now playing album 1 of 2: One');

    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await page.waitForTimeout(100);

    monitorState = 'null';
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect(playbackStatus(page)).toHaveText('Now playing album 2 of 2: Two');
  });

  test('Monitor mismatch detaches session with mismatch message', async ({ context, page }) => {
    await context.addInitScript(() => {
      /** @type {Array<() => void>} */
      const callbacks = [];
      /** @type {TestGlobal} */ (globalThis).__monitorCallbacks = callbacks;
      window.setInterval =
        /** @type {typeof window.setInterval} */
        ((/** @type {TimerHandler} */ handler) => {
          if (typeof handler === 'function') {
            callbacks.push(() => handler());
          }
          return /** @type {unknown} */ (callbacks.length);
        });
      window.clearInterval = () => {};
      Math.random = () => 0.999;
    });

    await seedItems(context, [{ type: 'album', uri: 'spotify:album:one', title: 'One' }]);

    let monitorState = 'match';
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/shuffle'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/repeat'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/play'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/me/player'),
        handle: (route) =>
          route.fulfill({
            status: 200,
            json: { context: { uri: monitorState === 'match' ? 'spotify:album:one' : 'spotify:album:other' } },
          }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(playbackStatus(page)).toHaveText('Now playing album 1 of 1: One');

    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await page.waitForTimeout(100);
    monitorState = 'mismatch';
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect(playbackStatus(page)).toHaveText(
      'Spotify is playing a different album/playlist than this app expects. Reattach to resume.',
    );
  });

  test('Recoverable monitor errors show status/toast and keep session active', async ({ context, page }) => {
    await context.addInitScript(() => {
      /** @type {Array<() => void>} */
      const callbacks = [];
      /** @type {TestGlobal} */ (globalThis).__monitorCallbacks = callbacks;
      window.setInterval =
        /** @type {typeof window.setInterval} */
        ((/** @type {TimerHandler} */ handler) => {
          if (typeof handler === 'function') {
            callbacks.push(() => handler());
          }
          return /** @type {unknown} */ (callbacks.length);
        });
      window.clearInterval = () => {};
      Math.random = () => 0.999;
    });

    await seedItems(context, [{ type: 'album', uri: 'spotify:album:one', title: 'One' }]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/shuffle'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/repeat'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'PUT', '/me/player/play'),
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/me/player'),
        handle: (route) => route.fulfill({ status: 429, body: 'too many requests' }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.waitForFunction(
      () => Array.isArray((/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks)
        && (/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks.length > 0,
    );
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });

    await expect(playbackStatus(page)).toHaveText('Unable to check playback state right now.');
    await expect(toastMessage(page, 'Spotify rate limit reached. Please wait a moment and retry.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
