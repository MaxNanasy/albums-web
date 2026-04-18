import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, itemTitle, playbackStatus, seedConnectedAuth, seedItems, toastMessage } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Storage JSON Import/Export', () => {
  test('Export/import JSON validation and valid import resets active session', async ({ context, page }) => {
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
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();

    await page.getByRole('button', { name: 'Export Data' }).click();
    await expect(page.locator('#storage-json')).toHaveValue(/"shuffle-by-album.items"/);

    await page.locator('#storage-json').fill('');
    await page.getByRole('button', { name: 'Import Data' }).click();
    await expect(toastMessage(page, 'Paste a JSON object to import.')).toBeVisible();

    await page.locator('#storage-json').fill('{bad}');
    await page.getByRole('button', { name: 'Import Data' }).click();
    await expect(toastMessage(page, 'Invalid JSON. Please provide a valid JSON object.')).toBeVisible();

    await page.locator('#storage-json').fill('[]');
    await page.getByRole('button', { name: 'Import Data' }).click();
    await expect(toastMessage(page, 'Import JSON must be an object of key/value pairs.')).toBeVisible();

    await page.locator('#storage-json').fill('{"other":[]}');
    await page.getByRole('button', { name: 'Import Data' }).click();
    await expect(toastMessage(page, 'Import JSON must include a valid shuffle-by-album.items array.')).toBeVisible();

    await page.locator('#storage-json').fill('{"shuffle-by-album.items":[{"type":"album","uri":"spotify:album:no-title"}]}');
    await page.getByRole('button', { name: 'Import Data' }).click();
    await expect(itemTitle(page, 'spotify:album:no-title')).toBeVisible();
    await expect(playbackStatus(page)).toHaveText('Data imported. Session reset.');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('Export with invalid stored items JSON clears the textarea and shows an export error', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.items', '{bad-json');
    });

    await page.goto('/');

    await page.getByRole('button', { name: 'Export Data' }).click();
    await expect(page.locator('#storage-json')).toHaveValue('');
    await expect(
      toastMessage(page, 'Unable to export saved items because stored data is invalid JSON.'),
    ).toBeVisible();
  });
});
