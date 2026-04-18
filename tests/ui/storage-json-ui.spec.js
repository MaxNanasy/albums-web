import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Storage JSON Import/Export', () => {
  test('Export/import JSON validation and valid import resets active session', async ({ context, page, ui }) => {
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

    await ui.playback.startButton.click();
    await expect(ui.playback.nextButton).toBeEnabled();

    await ui.storage.exportDataButton.click();
    await expect(ui.storage.json).toHaveValue(/"shuffle-by-album.items"/);

    await ui.storage.json.fill('');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.byText('Paste a JSON object to import.')).toBeVisible();

    await ui.storage.json.fill('{bad}');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.byText('Invalid JSON. Please provide a valid JSON object.')).toBeVisible();

    await ui.storage.json.fill('[]');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.byText('Import JSON must be an object of key/value pairs.')).toBeVisible();

    await ui.storage.json.fill('{"other":[]}');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.byText('Import JSON must include a valid shuffle-by-album.items array.')).toBeVisible();

    await ui.storage.json.fill('{"shuffle-by-album.items":[{"type":"album","uri":"spotify:album:no-title"}]}');
    await ui.storage.importDataButton.click();
    await expect(ui.savedItems.byText('spotify:album:no-title')).toBeVisible();
    await expect(ui.playback.status).toHaveText('Data imported. Session reset.');
    await expect(ui.playback.nextButton).toBeDisabled();
  });

  test('Export with invalid stored items JSON clears the textarea and shows an export error', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.items', '{bad-json');
    });

    await page.goto('/');

    await ui.storage.exportDataButton.click();
    await expect(ui.storage.json).toHaveValue('');
    await expect(
      ui.toasts.byText('Unable to export saved items because stored data is invalid JSON.'),
    ).toBeVisible();
  });
});
