import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item List', () => {
  test('Remove then undo keeps Removed Items in sync while manual add clears it', async ({ context, page, ui }) => {
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

    await ui.savedItems.removeButton('A').click();
    await expect(ui.savedItems.row('A')).toHaveCount(0);
    await expect(ui.removedItems.section).toBeVisible();
    await expect(ui.removedItems.row('A')).toBeVisible();
    await expect(ui.removedItems.count).toHaveText('1 item');

    await ui.savedItems.uriInput.fill('spotify:album:newone');
    await ui.savedItems.addButton.click();
    await ui.toasts.instance('Added “New One”.').waitFor();

    await ui.toasts.undoButton('Removed “A”.').click();
    await expect(ui.toasts.instance('Restored “A”.')).toBeVisible();
    await expect(ui.savedItems.row('A')).toBeVisible();
    await expect(ui.removedItems.section).toBeHidden();
    await expect(page.locator('#item-list > li > span')).toHaveText(['A', 'B', 'New One']);

    await ui.savedItems.removeButton('A').click();
    await expect(ui.removedItems.row('A')).toBeVisible();

    await ui.savedItems.uriInput.fill('spotify:album:a');
    await ui.savedItems.addButton.click();
    await expect(ui.toasts.instance('Added “A”.')).toBeVisible();
    await expect(ui.removedItems.section).toBeHidden();
    await expect(page.locator('#item-list > li > span')).toHaveText(['B', 'New One', 'A']);

    await ui.toasts.undoButton('Removed “A”.').click();
    await expect(ui.toasts.instance('Item is already in your list.')).toBeVisible();
    await expect(ui.removedItems.section).toBeHidden();
  });

  test('Removed Items restores items to the bottom and import albums clears restored uris', async ({ context, page, ui }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
      { type: 'album', uri: 'spotify:album:c', title: 'C' },
    ]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/playlists/importme/items'),
        handle: (route) => route.fulfill({
          status: 200,
          json: {
            items: [
              {
                item: {
                  album: {
                    uri: 'spotify:album:c',
                    name: 'C',
                  },
                },
              },
            ],
            next: null,
          },
        }),
      },
    ]);

    await page.goto('/');

    await ui.savedItems.removeButton('A').click();
    await ui.savedItems.removeButton('C').click();

    await expect(ui.savedItems.row('A')).toHaveCount(0);
    await expect(ui.savedItems.row('C')).toHaveCount(0);
    await expect(ui.removedItems.section).toBeVisible();
    await expect(ui.removedItems.count).toHaveText('2 items');
    await expect(ui.removedItems.row('A')).toBeVisible();
    await expect(ui.removedItems.row('C')).toBeVisible();

    await ui.removedItems.restoreButton('A').click();
    await expect(ui.savedItems.row('A')).toBeVisible();
    await expect(ui.toasts.instance('Restored “A”.')).toBeVisible();
    await expect(page.locator('#item-list > li > span')).toHaveText(['B', 'A']);
    await expect(ui.removedItems.count).toHaveText('1 item');

    await ui.savedItems.uriInput.fill('spotify:playlist:importme');
    await ui.savedItems.importAlbumsButton.click();
    await expect(ui.toasts.instance('Imported 1 album(s) from playlist (1 unique album(s) found).')).toBeVisible();
    await expect(ui.savedItems.row('C')).toBeVisible();
    await expect(page.locator('#item-list > li > span')).toHaveText(['B', 'A', 'C']);
    await expect(ui.removedItems.section).toBeHidden();
  });

  test('Removed Items persists across reload and purge all requires confirmation', async ({ context, page, ui }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
    ]);

    await page.goto('/');

    await ui.savedItems.removeButton('A').click();
    await expect(ui.removedItems.row('A')).toBeVisible();

    await page.reload();
    await expect(ui.removedItems.section).toBeVisible();
    await expect(ui.removedItems.count).toHaveText('1 item');
    await expect(ui.removedItems.row('A')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Permanently remove 1 item from Removed Items?');
      await dialog.dismiss();
    });
    await ui.removedItems.purgeButton.click();
    await expect(ui.removedItems.section).toBeVisible();
    await expect(ui.removedItems.row('A')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Permanently remove 1 item from Removed Items?');
      await dialog.accept();
    });
    await ui.removedItems.purgeButton.click();
    await expect(ui.toasts.instance('Purged Removed Items.')).toBeVisible();
    await expect(ui.removedItems.section).toBeHidden();

    await page.reload();
    await expect(ui.removedItems.section).toBeHidden();
  });
});
