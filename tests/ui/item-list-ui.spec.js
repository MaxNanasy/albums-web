import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Item List', () => {
  test('Remove then undo keeps Recently Removed in sync and duplicate-undo is prevented', async ({ context, page, ui }) => {
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
    await expect(ui.recentlyRemoved.section).toBeVisible();
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();
    await expect(ui.recentlyRemoved.count).toHaveText('1 item');

    await ui.savedItems.uriInput.fill('spotify:album:newone');
    await ui.savedItems.addButton.click();
    await ui.toasts.instance('Added “New One”.').waitFor();

    await ui.toasts.undoButton('Removed “A”.').click();
    await expect(ui.toasts.instance('Restored “A”.')).toBeVisible();
    await expect(ui.savedItems.row('A')).toBeVisible();
    await expect(ui.recentlyRemoved.section).toBeHidden();

    await ui.savedItems.removeButton('A').click();
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();
    await ui.savedItems.uriInput.fill('spotify:album:a');
    await ui.savedItems.addButton.click();
    await ui.toasts.undoButton('Removed “A”.').click();
    await expect(ui.toasts.instance('Item is already in your list.')).toBeVisible();
    await expect(ui.recentlyRemoved.section).toBeHidden();
  });

  test('Recently Removed tracks multiple removals and restores each item independently', async ({ context, page, ui }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
      { type: 'album', uri: 'spotify:album:c', title: 'C' },
    ]);

    await page.goto('/');

    await ui.savedItems.removeButton('A').click();
    await ui.savedItems.removeButton('C').click();

    await expect(ui.savedItems.row('A')).toHaveCount(0);
    await expect(ui.savedItems.row('C')).toHaveCount(0);
    await expect(ui.recentlyRemoved.section).toBeVisible();
    await expect(ui.recentlyRemoved.count).toHaveText('2 items');
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();
    await expect(ui.recentlyRemoved.row('C')).toBeVisible();

    await ui.recentlyRemoved.restoreButton('A').click();
    await expect(ui.savedItems.row('A')).toBeVisible();
    await expect(ui.toasts.instance('Restored “A”.')).toBeVisible();
    await expect(ui.recentlyRemoved.count).toHaveText('1 item');
    await expect(ui.recentlyRemoved.row('C')).toBeVisible();

    await ui.recentlyRemoved.restoreButton('C').click();
    await expect(ui.savedItems.row('C')).toBeVisible();
    await expect(ui.toasts.instance('Restored “C”.')).toBeVisible();
    await expect(ui.recentlyRemoved.section).toBeHidden();
  });

  test('Recently Removed persists across reload and purge all requires confirmation', async ({ context, page, ui }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
    ]);

    await page.goto('/');

    await ui.savedItems.removeButton('A').click();
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();

    await page.reload();
    await expect(ui.recentlyRemoved.section).toBeVisible();
    await expect(ui.recentlyRemoved.count).toHaveText('1 item');
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Permanently remove 1 item from Recently Removed?');
      await dialog.dismiss();
    });
    await ui.recentlyRemoved.purgeAllButton.click();
    await expect(ui.recentlyRemoved.section).toBeVisible();
    await expect(ui.recentlyRemoved.row('A')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Permanently remove 1 item from Recently Removed?');
      await dialog.accept();
    });
    await ui.recentlyRemoved.purgeAllButton.click();
    await expect(ui.toasts.instance('Purged Recently Removed.')).toBeVisible();
    await expect(ui.recentlyRemoved.section).toBeHidden();

    await page.reload();
    await expect(ui.recentlyRemoved.section).toBeHidden();
  });
});
