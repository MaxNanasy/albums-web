import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { isSpotifyApiRequest } from './common.js';

/** @typedef {typeof globalThis & { __monitorCallbacks: Array<() => void> }} TestGlobal */

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('import/export, startup refresh and monitor transitions', () => {
  test('export/import JSON validation and valid import resets active session', async ({ context, page }) => {
    await context.addInitScript(() => {
      Math.random = () => 0.999;
    });
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);

    await page.goto('/');

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
    ]);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeEnabled();

    await page.getByRole('button', { name: 'Export Data JSON' }).click();
    await expect(page.locator('#storage-json')).toHaveValue(/"shuffle-by-album.items"/);

    await page.locator('#storage-json').fill('');
    await page.getByRole('button', { name: 'Import Data JSON' }).click();
    await expect(page.getByText('Paste a JSON object to import.', { exact: true })).toBeVisible();

    await page.locator('#storage-json').fill('{bad}');
    await page.getByRole('button', { name: 'Import Data JSON' }).click();
    await expect(page.getByText('Invalid JSON. Please provide a valid JSON object.', { exact: true })).toBeVisible();

    await page.locator('#storage-json').fill('[]');
    await page.getByRole('button', { name: 'Import Data JSON' }).click();
    await expect(page.getByText('Import JSON must be an object of key/value pairs.', { exact: true })).toBeVisible();

    await page.locator('#storage-json').fill('{"other":[]}');
    await page.getByRole('button', { name: 'Import Data JSON' }).click();
    await expect(page.getByText('Import JSON must include a valid shuffle-by-album.items array.', { exact: true })).toBeVisible();

    await page.locator('#storage-json').fill('{"shuffle-by-album.items":[{"type":"album","uri":"spotify:album:no-title"}]}');
    await page.getByRole('button', { name: 'Import Data JSON' }).click();
    await expect(page.getByText('spotify:album:no-title', { exact: true })).toBeVisible();
    await expect(page.getByText('Data imported. Session reset.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeDisabled();
  });

  test('startup title refresh updates missing title and tolerates failures', async ({ context, page }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:ok', title: '' },
      { type: 'album', uri: 'spotify:album:fail', title: '' },
    ]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/ok'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'OK Title' } }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/fail'),
        handle: (route) => route.fulfill({ status: 404, body: '' }),
      },
    ]);

    await page.goto('/');

    await expect(page.getByText('OK Title', { exact: true })).toBeVisible();
    await expect(page.getByText('spotify:album:fail', { exact: true })).toBeVisible();
  });

  test('monitor advances on null context after observing current context', async ({ context, page }) => {
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
    await expect(page.getByText('Now playing album 1 of 2: One', { exact: true })).toBeVisible();

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
    await expect(page.getByText('Now playing album 2 of 2: Two', { exact: true })).toBeVisible();
  });

  test('monitor mismatch detaches session with mismatch message', async ({ context, page }) => {
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
    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();

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
    await expect(
      page.getByText('Spotify is playing a different album/playlist than this app expects. Reattach to resume.', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('recoverable monitor errors show status/toast and keep session active', async ({ context, page }) => {
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

    await expect(page.getByText('Unable to check playback state right now.', { exact: true })).toBeVisible();
    await expect(page.getByText('Spotify rate limit reached. Please wait a moment and retry.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeEnabled();
  });
});
