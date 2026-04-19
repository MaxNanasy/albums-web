import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item Add', () => {
  test('Adds an album from normal Spotify URL', async ({ context, page, ui }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/album123'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'Discovery' } }),
      },
    ]);

    await page.goto('/');
    await ui.savedItems.uriInput.fill('https://open.spotify.com/album/album123');
    await ui.savedItems.addButton.click();

    await expect(ui.savedItems.row('Discovery')).toBeVisible();
  });

  test('Adds a playlist from Spotify playlist URL', async ({ context, page, ui }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/playlists/playlist123'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'Road Trip Mix' } }),
      },
    ]);

    await page.goto('/');
    await ui.savedItems.uriInput.fill('https://open.spotify.com/playlist/playlist123');
    await ui.savedItems.addButton.click();

    await expect(ui.savedItems.row('Road Trip Mix')).toBeVisible();
    await expect(ui.toasts.instance('Added “Road Trip Mix”.')).toBeVisible();
  });

  test('Duplicate and invalid input show validation toasts', async ({ context, page, ui }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:album123', title: 'Discovery' }]);

    await page.goto('/');

    await ui.savedItems.uriInput.fill('not-valid');
    await ui.savedItems.addButton.click();
    await expect(ui.toasts.instance('Enter a valid Spotify album/playlist URI or URL.')).toBeVisible();

    await ui.savedItems.uriInput.fill('spotify:album:album123');
    await ui.savedItems.addButton.click();
    await expect(ui.toasts.instance('Item is already in your list.')).toBeVisible();
  });

  test('Add while disconnected and title lookup failure both show toasts', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });

    await page.goto('/');
    await ui.savedItems.uriInput.fill('spotify:album:album123');
    await ui.savedItems.addButton.click();
    await expect(ui.toasts.instance('Connect Spotify first so the app can load item titles.')).toBeVisible();

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/missing'),
        handle: (route) => route.fulfill({ status: 404, body: '' }),
      },
    ]);
    await seedConnectedAuth(context);

    await page.reload();
    await ui.savedItems.uriInput.fill('spotify:album:missing');
    await ui.savedItems.addButton.click();
    await expect(ui.toasts.instance('Unable to load title for that item. Please try another URI.')).toBeVisible();
  });
});
