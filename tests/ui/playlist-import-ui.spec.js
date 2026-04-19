import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

/** @typedef {import('@playwright/test').Request} Request */

/**
 * @param {Request} request
 * @param {string} playlistId
 * @param {number} expectedOffset
 */
function isPlaylistItemsRequest(request, playlistId, expectedOffset) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET'
    && url.pathname === `/v1/playlists/${playlistId}/items`
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

test.describe('Playlist Album Import', () => {
  test('Imports playlist albums across pages and skips saved duplicates', async ({ context, page, ui }) => {
    await seedItems(context, [
      {
        type: 'album',
        uri: 'spotify:album:existing',
        title: 'Existing Album',
      },
    ]);

    const requests = installSpotifyRoutes(context, [
      {
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 0),
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
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 50),
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

    await ui.savedItems.uriInput.fill('playlist123');
    await ui.savedItems.importAlbumsButton.click();

    await expect(ui.savedItems.row('Existing Album')).toBeVisible();
    await expect(ui.savedItems.row('New Album One')).toBeVisible();
    await expect(ui.savedItems.row('New Album Two')).toBeVisible();
    await expect(ui.toasts.instance('Imported 2 album(s) from playlist (3 unique album(s) found).')).toBeVisible();
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=0&additional_types=track&market=from_token',
      'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=50&additional_types=track&market=from_token',
    ]);
  });

  test('Imports playlist albums from a Spotify playlist URL', async ({ context, page, ui }) => {
    const requests = installSpotifyRoutes(context, [
      {
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 0),
        handle: (route) =>
          route.fulfill({
            status: 200,
            json: {
              items: [{ item: { album: { uri: 'spotify:album:new-one', name: 'New Album One' } } }],
              next: null,
            },
          }),
      },
    ]);

    await page.goto('/');

    await ui.savedItems.uriInput.fill('https://open.spotify.com/playlist/playlist123');
    await ui.savedItems.importAlbumsButton.click();

    await expect(ui.savedItems.row('New Album One')).toBeVisible();
    await expect(ui.toasts.instance('Imported 1 album(s) from playlist (1 unique album(s) found).')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=0&additional_types=track&market=from_token',
    );
  });

  test('Imports playlist albums from a Spotify playlist URI', async ({ context, page, ui }) => {
    const requests = installSpotifyRoutes(context, [
      {
        match: (request) => isPlaylistItemsRequest(request, 'playlist123', 0),
        handle: (route) =>
          route.fulfill({
            status: 200,
            json: {
              items: [{ item: { album: { uri: 'spotify:album:new-two', name: 'New Album Two' } } }],
              next: null,
            },
          }),
      },
    ]);

    await page.goto('/');

    await ui.savedItems.uriInput.fill('spotify:playlist:playlist123');
    await ui.savedItems.importAlbumsButton.click();

    await expect(ui.savedItems.row('New Album Two')).toBeVisible();
    await expect(ui.toasts.instance('Imported 1 album(s) from playlist (1 unique album(s) found).')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=0&additional_types=track&market=from_token',
    );
  });

  test('Playlist import unhappy paths and no-op imports', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });
    await page.goto('/');
    await ui.savedItems.uriInput.fill('playlist123');
    await ui.savedItems.importAlbumsButton.click();
    await expect(ui.toasts.instance('Connect Spotify first so the app can import albums.')).toBeVisible();

    await seedConnectedAuth(context);

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
    await ui.savedItems.uriInput.fill('$$$');
    await ui.savedItems.importAlbumsButton.click();
    await expect(ui.toasts.instance('Enter a valid Spotify playlist URL, URI, or playlist ID.')).toBeVisible();

    await ui.savedItems.uriInput.fill('playlist123');
    await ui.savedItems.importAlbumsButton.click();
    await expect(ui.toasts.instance('Error importing albums: 500 boom.')).toBeVisible();

    await ui.savedItems.uriInput.fill('emptyplaylist');
    await ui.savedItems.importAlbumsButton.click();
    await expect(ui.toasts.instance('Imported 0 album(s) from playlist (0 unique album(s) found).')).toBeVisible();
  });

  test('Importing playlist with all albums already saved keeps list unchanged', async ({ context, page, ui }) => {
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
    await ui.savedItems.uriInput.fill('playlist123');
    await ui.savedItems.importAlbumsButton.click();

    await expect(ui.toasts.instance('Imported 0 album(s) from playlist (1 unique album(s) found).')).toBeVisible();
    await expect(ui.savedItems.row('Existing Album')).toHaveCount(1);
  });
});
