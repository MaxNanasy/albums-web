import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems, toastMessage } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item List', () => {
  test('Remove then undo restores original row position and duplicate-undo is prevented', async ({ context, page }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
    ]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/newone'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'New One' } }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/a'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'A' } }),
      },
    ]);

    await page.goto('/');

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'A' })).toHaveCount(0);

    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('spotify:album:newone');
    await page.getByRole('button', { name: 'Add' }).click();
    await toastMessage(page, 'Added “New One”.').waitFor();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(toastMessage(page, 'Restored “A”.')).toBeVisible();

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...').fill('spotify:album:a');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(toastMessage(page, 'Item is already in your list.')).toBeVisible();
  });
});
