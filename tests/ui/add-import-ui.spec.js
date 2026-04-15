import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { CONNECTED_SCOPES, isPlaylistItemsRequest, isSpotifyApiRequest } from './ui-helpers.js';

/** @typedef {import('@playwright/test').Request} Request */

/**
 * @param {Request} request
 * @param {number} expectedOffset
 */
function hasPlaylistPageRequest(request, expectedOffset) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET'
    && url.pathname === '/v1/playlists/playlist123/items'
    && url.searchParams.get('limit') === '50'
    && url.searchParams.get('offset') === String(expectedOffset)
    && url.searchParams.get('additional_types') === 'track'
    && url.searchParams.get('market') === 'from_token'
  );
}

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('add and import', () => {
  test('adds an album from normal Spotify URL', async ({ context, page }) => {
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
  });

  test('adds a playlist from Spotify playlist URL', async ({ context, page }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/playlists/playlist123'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'Road Trip Mix' } }),
      },
    ]);

    await page.goto('/');
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('https://open.spotify.com/playlist/playlist123');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByText('Road Trip Mix', { exact: true })).toBeVisible();
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

  test('imports playlist albums across pages and skips saved duplicates', async ({ context, page }) => {
    await seedItems(context, [
      {
        type: 'album',
        uri: 'spotify:album:existing',
        title: 'Existing Album',
      },
    ]);

    const requests = installSpotifyRoutes(context, [
      {
        match: (request) => hasPlaylistPageRequest(request, 0),
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
        match: (request) => hasPlaylistPageRequest(request, 50),
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

  test('importing playlist with all albums already saved keeps list unchanged', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:existing', title: 'Existing Album' }]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 0),
        handle: (route) => route.fulfill({
          status: 200,
          json: {
            items: [{ item: { album: { uri: 'spotify:album:existing', name: 'Existing Album' } } }],
            next: null,
          },
        }),
      },
    ]);

    await page.goto('/');
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('playlist123');
    await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();

    await expect(page.getByText('Imported 0 album(s) from playlist (1 unique album(s) found).', { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Existing Album' })).toHaveCount(1);
  });
});
