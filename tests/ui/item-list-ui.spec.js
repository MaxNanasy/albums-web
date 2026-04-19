import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item List', () => {
  test('Remove then undo restores original row position and duplicate-undo is prevented', async ({ context, page, ui }) => {
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

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'A' })).toHaveCount(0);

    await ui.savedItems.uriInput.fill('spotify:album:newone');
    await ui.savedItems.addButton.click();
    await ui.toasts.instance('Added “New One”.').waitFor();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(ui.toasts.instance('Restored “A”.')).toBeVisible();

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove', exact: true }).click();
    await ui.savedItems.uriInput.fill('spotify:album:a');
    await ui.savedItems.addButton.click();
    await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
    await expect(ui.toasts.instance('Item is already in your list.')).toBeVisible();
  });
});
