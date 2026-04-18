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
    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('https://open.spotify.com/album/album123');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(ui.savedItems.byText('Discovery')).toBeVisible();
  });

  test('Adds a playlist from Spotify playlist URL', async ({ context, page, ui }) => {
    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/playlists/playlist123'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'Road Trip Mix' } }),
      },
    ]);

    await page.goto('/');
    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('https://open.spotify.com/playlist/playlist123');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(ui.savedItems.byText('Road Trip Mix')).toBeVisible();
    await expect(ui.toasts.byText('Added “Road Trip Mix”.')).toBeVisible();
  });

  test('Duplicate and invalid input show validation toasts', async ({ context, page, ui }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:album123', title: 'Discovery' }]);

    await page.goto('/');

    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('not-valid');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(ui.toasts.byText('Enter a valid Spotify album/playlist URI or URL.')).toBeVisible();

    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('spotify:album:album123');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(ui.toasts.byText('Item is already in your list.')).toBeVisible();
  });

  test('Add while disconnected and title lookup failure both show toasts', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });

    await page.goto('/');
    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('spotify:album:album123');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(ui.toasts.byText('Connect Spotify first so the app can load item titles.')).toBeVisible();

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/missing'),
        handle: (route) => route.fulfill({ status: 404, body: '' }),
      },
    ]);
    await seedConnectedAuth(context);

    await page.reload();
    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('spotify:album:missing');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(ui.toasts.byText('Unable to load title for that item. Please try another URI.')).toBeVisible();
  });
});
