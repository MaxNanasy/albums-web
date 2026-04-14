import { expect, test } from '@playwright/test';

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {import('@playwright/test').Route} Route */

/**
 * @typedef SavedItem
 * @property {'album' | 'playlist'} type
 * @property {string} uri
 * @property {string} title
 */

/**
 * @typedef RecordedSpotifyRequest
 * @property {string} method
 * @property {string} url
 * @property {string | null} postData
 */

/**
 * @typedef SpotifyRouteDefinition
 * @property {(request: Request) => boolean} match
 * @property {(route: Route, request: Request) => Promise<void>} handle
 */

const CONNECTED_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test('adds an album', async ({ context, page }) => {
  const requests = await installSpotifyRoutes(context, [
    {
      match: (request) =>
        request.method() === 'GET' && request.url() === 'https://api.spotify.com/v1/albums/album123',
      handle: (route) => route.fulfill({ status: 200, json: { name: 'Discovery' } }),
    },
  ]);

  await page.goto('/');

  await expect(page.getByText('Connected.')).toBeVisible();
  await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:album123');
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText('Discovery', { exact: true })).toBeVisible();
  await expect(page.getByText('Item added.', { exact: true })).toBeVisible();
  expect(requests).toEqual([
    {
      method: 'GET',
      url: 'https://api.spotify.com/v1/albums/album123',
      postData: null,
    },
  ]);
});

test('imports playlist albums across pages and skips saved duplicates', async ({ context, page }) => {
  await seedItems(context, [
    {
      type: 'album',
      uri: 'spotify:album:existing',
      title: 'Existing Album',
    },
  ]);

  const requests = await installSpotifyRoutes(context, [
    {
      match: (request) =>
        request.method() === 'GET'
        && hasPlaylistPageRequest(request, 0),
      handle: (route) =>
        route.fulfill({
          status: 200,
          json: {
            items: [
              { item: { album: { uri: 'spotify:album:existing', name: 'Existing Album' } } },
              { item: { album: { uri: 'spotify:album:new-one', name: 'New Album One' } } },
            ],
            next: 'https://api.spotify.com/v1/playlists/playlist123/items?offset=50',
          },
        }),
    },
    {
      match: (request) =>
        request.method() === 'GET'
        && hasPlaylistPageRequest(request, 50),
      handle: (route) =>
        route.fulfill({
          status: 200,
          json: {
            items: [
              { item: { album: { uri: 'spotify:album:new-one', name: 'New Album One' } } },
              { item: { album: { id: 'new-two', name: 'New Album Two' } } },
            ],
            next: null,
          },
        }),
    },
  ]);

  await page.goto('/');

  await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('playlist123');
  await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();

  await expect(page.getByText('Existing Album', { exact: true })).toBeVisible();
  await expect(page.getByText('New Album One', { exact: true })).toBeVisible();
  await expect(page.getByText('New Album Two', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Imported 2 album(s) from playlist (3 unique album(s) found).', { exact: true }),
  ).toBeVisible();
  expect(requests.map((request) => request.url)).toEqual([
    'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=0&additional_types=track&market=from_token',
    'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=50&additional_types=track&market=from_token',
  ]);
});

test('starts playback', async ({ context, page }) => {
  await seedItems(context, [
    {
      type: 'album',
      uri: 'spotify:album:album123',
      title: 'Discovery',
    },
  ]);

  const requests = await installSpotifyRoutes(context, [
    {
      match: (request) =>
        request.method() === 'PUT'
        && request.url() === 'https://api.spotify.com/v1/me/player/shuffle?state=false',
      handle: (route) => route.fulfill({ status: 204, body: '' }),
    },
    {
      match: (request) =>
        request.method() === 'PUT'
        && request.url() === 'https://api.spotify.com/v1/me/player/repeat?state=off',
      handle: (route) => route.fulfill({ status: 204, body: '' }),
    },
    {
      match: (request) =>
        request.method() === 'PUT'
        && request.url() === 'https://api.spotify.com/v1/me/player/play',
      handle: (route) => route.fulfill({ status: 204, body: '' }),
    },
  ]);

  await page.goto('/');

  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText('Now playing album 1 of 1: Discovery', { exact: true })).toBeVisible();
  await expect(page.getByText('▶ 1. Discovery', { exact: true })).toBeVisible();
  expect(requests).toEqual([
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/shuffle?state=false',
      postData: null,
    },
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/repeat?state=off',
      postData: null,
    },
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/play',
      postData: JSON.stringify({
        context_uri: 'spotify:album:album123',
        offset: { position: 0 },
        position_ms: 0,
      }),
    },
  ]);
});

/** @param {BrowserContext} context */
async function installStableBrowserState(context) {
  await context.addInitScript(() => {
    /**
     * @param {TimerHandler} handler
     * @param {number | undefined} timeout
     * @param {...unknown} arguments_
     * @returns {number}
     */
    function stableSetInterval(handler, timeout, ...arguments_) {
      void handler;
      void timeout;
      void arguments_;
      return 1;
    }
    // @ts-expect-error In this mixed Node+DOM typing environment, setInterval has incompatible overloads.
    window.setInterval = stableSetInterval;
    window.clearInterval = () => {};
  });
}

/** @param {BrowserContext} context */
async function seedConnectedAuth(context) {
  await context.addInitScript(({ expiry, scopes }) => {
    localStorage.setItem('shuffle-by-album.token', 'test-access-token');
    localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
    localStorage.setItem('shuffle-by-album.tokenScope', scopes);
  }, { expiry: Date.now() + 60_000, scopes: CONNECTED_SCOPES });
}

/**
 * @param {BrowserContext} context
 * @param {SavedItem[]} items
 */
async function seedItems(context, items) {
  await context.addInitScript((savedItems) => {
    localStorage.setItem('shuffle-by-album.items', JSON.stringify(savedItems));
  }, items);
}

/**
 * @param {BrowserContext} context
 * @param {SpotifyRouteDefinition[]} definitions
 * @returns {Promise<RecordedSpotifyRequest[]>}
 */
async function installSpotifyRoutes(context, definitions) {
  /** @type {RecordedSpotifyRequest[]} */
  const recordedRequests = [];

  await context.route(/^https:\/\/(api|accounts)\.spotify\.com\//, async (route) => {
    const request = route.request();
    recordedRequests.push({
      method: request.method(),
      url: request.url(),
      postData: request.postData(),
    });

    for (const definition of definitions) {
      if (definition.match(request)) {
        await definition.handle(route, request);
        return;
      }
    }

    throw new Error(`Unexpected Spotify request: ${request.method()} ${request.url()}`);
  });

  return recordedRequests;
}

/**
 * @param {Request} request
 * @param {number} expectedOffset
 */
function hasPlaylistPageRequest(request, expectedOffset) {
  const url = new URL(request.url());
  return (
    url.pathname === '/v1/playlists/playlist123/items'
    && url.searchParams.get('limit') === '50'
    && url.searchParams.get('offset') === String(expectedOffset)
    && url.searchParams.get('additional_types') === 'track'
    && url.searchParams.get('market') === 'from_token'
  );
}
