import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { isSpotifyApiRequest } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('storage JSON import/export', () => {
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
});
