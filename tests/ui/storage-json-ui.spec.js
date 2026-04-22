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
    await expect(ui.toasts.instance('Paste a JSON object to import.')).toBeVisible();

    await ui.storage.json.fill('{bad}');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.instance('Invalid JSON. Please provide a valid JSON object.')).toBeVisible();

    await ui.storage.json.fill('[]');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.instance('Import JSON must be an object of key/value pairs.')).toBeVisible();

    await ui.storage.json.fill('{"other":[]}');
    await ui.storage.importDataButton.click();
    await expect(ui.toasts.instance('Import JSON must include a valid shuffle-by-album.items array.')).toBeVisible();

    await ui.storage.json.fill('{"shuffle-by-album.items":[{"type":"album","uri":"spotify:album:no-title"}]}');
    await ui.storage.importDataButton.click();
    await expect(ui.savedItems.row('spotify:album:no-title')).toBeVisible();
    await expect(ui.playback.status).toHaveText('Data imported. Session reset.');
    await expect(ui.playback.nextButton).toBeDisabled();
  });

  test('Export includes Removed Items and import restores it with flattened items', async ({ context, page, ui }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);

    await page.goto('/');

    await ui.savedItems.removeButton('One').click();
    await expect(ui.removedItems.row('One')).toBeVisible();

    await ui.storage.exportDataButton.click();
    const exported = JSON.parse(await ui.storage.json.inputValue());
    await expect(exported['shuffle-by-album.items']).toEqual([
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);
    await expect(exported['shuffle-by-album.removedItems']).toEqual([
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
    ]);

    await ui.storage.json.fill(JSON.stringify({
      'shuffle-by-album.items': [
        { type: 'album', uri: 'spotify:album:two', title: 'Two' },
      ],
      'shuffle-by-album.removedItems': [
        { type: 'album', uri: 'spotify:album:restorable', title: 'Restorable' },
      ],
    }));
    await ui.storage.importDataButton.click();

    await expect(ui.savedItems.row('Two')).toBeVisible();
    await expect(ui.savedItems.row('One')).toHaveCount(0);
    await expect(ui.removedItems.section).toBeVisible();
    await expect(ui.removedItems.row('Restorable')).toBeVisible();
    await expect(ui.removedItems.row('One')).toHaveCount(0);

    await ui.removedItems.restoreButton('Restorable').click();
    await expect(ui.savedItems.row('Restorable')).toBeVisible();
    await expect(page.locator('#item-list > li > span')).toHaveText(['Two', 'Restorable']);
    await expect(ui.removedItems.section).toBeHidden();
  });

  test('Export with invalid stored items JSON clears the textarea and shows an export error', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.items', '{bad-json');
    });

    await page.goto('/');

    await ui.storage.exportDataButton.click();
    await expect(ui.storage.json).toHaveValue('');
    await expect(
      ui.toasts.instance('Unable to export saved items because stored data is invalid JSON.'),
    ).toBeVisible();
  });
});
