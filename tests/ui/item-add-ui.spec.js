import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { isSpotifyApiRequest } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item Add', () => {
  test('Adds an album from normal Spotify URL', async ({ context, page }) => {
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

  test('Adds a playlist from Spotify playlist URL', async ({ context, page }) => {
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

  test('Duplicate and invalid input show validation toasts', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:album123', title: 'Discovery' }]);

    await page.goto('/');

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('not-valid');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Enter a valid Spotify album/playlist URI or URL.', { exact: true })).toBeVisible();

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:album123');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Item is already in your list.', { exact: true })).toBeVisible();
  });

  test('Add while disconnected and title lookup failure both show toasts', async ({ context, page }) => {
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
    await seedConnectedAuth(context);

    await page.reload();
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:missing');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Unable to load title for that item. Please try another URI.', { exact: true })).toBeVisible();
  });
});
