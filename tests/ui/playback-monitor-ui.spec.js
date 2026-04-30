import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

/** @typedef {typeof globalThis & { __monitorCallbacks: Array<() => void> }} TestGlobal */

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Playback Monitor Transitions', () => {
  test('Monitor polls only when harness triggers it', async ({ context, page, ui }) => {
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

    const requests = [];
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
        handle: (route, request) => {
          requests.push(request.url());
          return route.fulfill({ status: 204, body: '' });
        },
      },
    ]);

    await page.goto('/');
    await ui.playback.startButton.click();
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: One');

    await page.waitForFunction(
      () => Array.isArray((/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks)
        && (/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks.length > 0,
    );
    expect(requests).toHaveLength(0);

    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect.poll(() => requests.length).toBe(1);

    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect.poll(() => requests.length).toBe(2);
  });

  test('Monitor advances on null context after observing current context', async ({ context, page, ui }) => {
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
            status: 200,
            json: monitorState === 'null' ? { context: null } : { context: { uri: 'spotify:album:one' } },
          }),
      },
    ]);

    await page.goto('/');
    await ui.playback.startButton.click();
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 2: One');

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
    await expect(ui.playback.status).toHaveText('Now playing album 2 of 2: Two');
  });

  test('Monitor ignores 204 playback snapshots', async ({ context, page, ui }) => {
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

    let monitorState = 'no-content';
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
          route.fulfill(
            monitorState === 'no-content'
              ? { status: 204, body: '' }
              : { status: 200, json: { context: { uri: 'spotify:album:one' } } },
          ),
      },
    ]);

    await page.goto('/');
    await ui.playback.startButton.click();
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 2: One');

    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await page.waitForTimeout(100);
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 2: One');

    monitorState = 'match-one';
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await page.waitForTimeout(100);
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 2: One');

    monitorState = 'no-content';
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 2: One');
  });

  test('Monitor mismatch detaches session with mismatch message', async ({ context, page, ui }) => {
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
    await ui.playback.startButton.click();
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: One');

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
    await expect(ui.playback.status).toHaveText(
      'Spotify is playing a different album/playlist than this app expects; reattach to resume',
    );
  });

  test('Recoverable monitor errors show status/toast and keep session active', async ({ context, page, ui }) => {
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
    await ui.playback.startButton.click();
    await page.waitForFunction(
      () => Array.isArray((/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks)
        && (/** @type {TestGlobal} */ (globalThis)).__monitorCallbacks.length > 0,
    );
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });

    await expect(ui.playback.status).toHaveText('Playback monitor encountered an error: Spotify rate limit reached; please wait a moment and retry');
    await expect(ui.toasts.instance('Playback monitor encountered an error')).toBeVisible();
    await expect(ui.playback.reattachButton).toBeHidden();
    await expect(ui.playback.nextButton).toBeEnabled();
  });
});
