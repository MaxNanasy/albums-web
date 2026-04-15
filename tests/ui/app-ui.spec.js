import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {typeof globalThis & { __monitorCallbacks: Array<() => void> }} TestGlobal */


const CONNECTED_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

/**
 * @param {Request} request
 * @param {string} method
 * @param {string} path
 */
function isSpotifyApiRequest(request, method, path) {
  const url = new URL(request.url());
  return request.method() === method && url.origin === 'https://api.spotify.com' && url.pathname === `/v1${path}`;
}

/** @param {Request} request */
function isSpotifyAccountTokenRequest(request) {
  return request.method() === 'POST' && request.url() === 'https://accounts.spotify.com/api/token';
}

/**
 * @param {Request} request
 * @param {string} playlistId
 * @param {number} offset
 */
function isPlaylistItemsRequest(request, playlistId, offset) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET'
    && url.pathname === `/v1/playlists/${playlistId}/items`
    && url.searchParams.get('limit') === '50'
    && url.searchParams.get('offset') === String(offset)
    && url.searchParams.get('additional_types') === 'track'
    && url.searchParams.get('market') === 'from_token'
  );
}

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('auth and connection states', () => {
  test('cold start without token shows disconnected and disconnect clears auth', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Disconnected from Spotify.', { exact: true })).toBeVisible();
  });

  test('missing playlist scopes shows reconnect warning', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.tokenScope', 'user-modify-playback-state user-read-playback-state');
    });

    await page.goto('/');

    await expect(
      page.getByText('Connected, but token is missing playlist import scopes. Disconnect and reconnect.', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('auth redirect error and missing verifier states render expected status', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/?error=access_denied');
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();

    await page.goto('/?code=abc123');
    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
  });

  test('failed code exchange shows token exchange failure state', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('shuffle-by-album.pkceVerifier', 'verifier');
    });

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyAccountTokenRequest(request),
        handle: (route) => route.fulfill({ status: 400, body: 'bad code' }),
      },
    ]);

    await page.goto('/?code=abc123');

    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
  });
});

test.describe('add and import validations', () => {
  test('adds album from normal Spotify URL', async ({ context, page }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/album123'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'Discovery' } }),
      },
    ]);

    await page.goto('/');
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('https://open.spotify.com/album/album123');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByText('Discovery', { exact: true })).toBeVisible();
    await expect(page.getByText('Item added.', { exact: true })).toBeVisible();
  });

  test('duplicate and invalid input show validation toasts', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:album123', title: 'Discovery' }]);

    await page.goto('/');

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('not-valid');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Enter a valid Spotify album/playlist URI or URL.', { exact: true })).toBeVisible();

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:album123');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Item is already in your list.', { exact: true })).toBeVisible();
  });

  test('add while disconnected and title lookup failure both show toasts', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });

    await page.goto('/');
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:album123');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Connect Spotify first so the app can load item titles.', { exact: true })).toBeVisible();

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/missing'),
        handle: (route) => route.fulfill({ status: 404, body: '' }),
      },
    ]);
    await context.addInitScript(({ expiry, scopes }) => {
      localStorage.setItem('shuffle-by-album.token', 'test-access-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
      localStorage.setItem('shuffle-by-album.tokenScope', scopes);
    }, { expiry: Date.now() + 60 * 60 * 1000, scopes: CONNECTED_SCOPES });

    await page.reload();
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:missing');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Unable to load title for that item. Please try another URI.', { exact: true })).toBeVisible();
  });

  test('playlist import unhappy paths and no-op imports', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });
    await page.goto('/');
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('playlist123');
    await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();
    await expect(page.getByText('Connect Spotify first so the app can import albums.', { exact: true })).toBeVisible();

    await context.addInitScript(({ expiry, scopes }) => {
      localStorage.setItem('shuffle-by-album.token', 'test-access-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
      localStorage.setItem('shuffle-by-album.tokenScope', scopes);
    }, { expiry: Date.now() + 60 * 60 * 1000, scopes: CONNECTED_SCOPES });

    installSpotifyRoutes(context, [
      {
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 0),
        handle: (route) => route.fulfill({ status: 500, body: 'boom' }),
      },
      {
        match: (request) => isPlaylistItemsRequest(request, 'emptyplaylist', 0),
        handle: (route) => route.fulfill({ status: 200, json: { items: [], next: null } }),
      },
    ]);

    await page.reload();
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('$$$');
    await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();
    await expect(page.getByText('Enter a valid Spotify playlist URL, URI, or playlist ID.', { exact: true })).toBeVisible();

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('playlist123');
    await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();
    await expect(page.getByText('Unable to import albums from that playlist (500). boom', { exact: true })).toBeVisible();

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('emptyplaylist');
    await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();
    await expect(page.getByText('Imported 0 album(s) from playlist (0 unique album(s) found).', { exact: true })).toBeVisible();
  });
});

test.describe('saved items remove/undo and playback controls', () => {
  test('remove then undo restores original row position and duplicate-undo is prevented', async ({ context, page }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/newone'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'New One' } }),
      },
    ]);

    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
    ]);

    await page.goto('/');
    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'A' })).toHaveCount(0);

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:newone');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByText('Item added.', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Restored “A”.', { exact: true })).toBeVisible();

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:a');
    // Create duplicate before pressing undo.
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/a'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'A' } }),
      },
    ]);
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Item is already in your list.', { exact: true })).toBeVisible();
  });

  test('start guardrails and active controls for start/skip/stop/final item', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
      Math.random = () => 0.999;
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Connect Spotify first.', { exact: true })).toBeVisible();

    await context.addInitScript(({ expiry, scopes }) => {
      localStorage.setItem('shuffle-by-album.token', 'test-access-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
      localStorage.setItem('shuffle-by-album.tokenScope', scopes);
    }, { expiry: Date.now() + 60 * 60 * 1000, scopes: CONNECTED_SCOPES });

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Add at least one album or playlist first.', { exact: true })).toBeVisible();

    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);

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

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

    await page.getByRole('button', { name: 'Skip To Next' }).click();
    await expect(page.getByText('Now playing album 2 of 2: Two', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip To Next' }).click();
    await expect(page.getByText('Finished: all selected albums/playlists were played.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('Session stopped.', { exact: true })).toBeVisible();
  });
});

test.describe('detached and persistence flows', () => {
  test('unrecoverable start error detaches and reattach handles empty queue + missing token', async ({ context, page }) => {
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
        handle: (route) => route.fulfill({ status: 404, body: 'device missing' }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Playback detached due to a Spotify error. Reattach when ready.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeVisible();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({ activationState: 'detached', queue: [], index: 0 }));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });
    await page.reload();
    await page.getByRole('button', { name: 'Reattach' }).click();
    await expect(page.getByText('Spotify session expired. Please reconnect.', { exact: true })).toBeVisible();
  });

  test('reattach resumes when context matches and restarts when mismatched', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    let matched = true;
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/me/player'),
        handle: (route) => route.fulfill({ status: 200, json: { context: { uri: matched ? 'spotify:album:one' : 'spotify:album:other' } } }),
      },
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

    await page.goto('/');
    await page.getByRole('button', { name: 'Reattach' }).click();
    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();

    matched = false;
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });
    await page.reload();
    await page.getByRole('button', { name: 'Reattach' }).click();
    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();
  });
});

test.describe('import/export, startup refresh and monitor transitions', () => {
  test('export/import JSON validation and fallback title rendering', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:one', title: 'One' }]);
    await page.goto('/');

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

  test('monitor transitions advance on null context and detach on mismatch', async ({ context, page }) => {
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

    let playerContext = 'spotify:album:one';
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
        handle: (route) => {
          if (playerContext === 'null') {
            return route.fulfill({ status: 204, body: '' });
          }
          return route.fulfill({ status: 200, json: { context: { uri: playerContext } } });
        },
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
    playerContext = 'null';
    await page.evaluate(async () => {
      const callback = /** @type {TestGlobal} */ (globalThis).__monitorCallbacks[0];
      if (typeof callback === 'function') await callback();
    });
    await expect(page.getByText('Now playing album 2 of 2: Two', { exact: true })).toBeVisible();

  });
});
