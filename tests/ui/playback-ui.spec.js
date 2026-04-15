import { expect, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { CONNECTED_SCOPES } from './ui-helpers.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('saved items and playback controls', () => {
  test('remove then undo restores original row position and duplicate-undo is prevented', async ({ context, page }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:a', title: 'A' },
      { type: 'album', uri: 'spotify:album:b', title: 'B' },
    ]);

    await page.goto('/');
    await context.route(/^https:\/\/api\.spotify\.com\/v1\/albums\/(newone|a)$/, async (route) => {
      const url = route.request().url();
      if (url.endsWith('/albums/newone')) {
        await route.fulfill({ status: 200, json: { name: 'New One' } });
        return;
      }
      await route.fulfill({ status: 200, json: { name: 'A' } });
    });

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'A' })).toHaveCount(0);

    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:newone');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByText('Item added.', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Restored “A”.', { exact: true })).toBeVisible();

    await page.getByRole('listitem').filter({ hasText: 'A' }).getByRole('button', { name: 'Remove' }).click();
    await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('spotify:album:a');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect(page.getByText('Item is already in your list.', { exact: true })).toBeVisible();
  });

  test('start guardrails and active controls for start/skip/stop/final item', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
      Math.random = () => 0.999;
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Connect Spotify first.', { exact: true })).toBeVisible();

    await context.addInitScript(({ expiry, scopes }) => {
      localStorage.setItem('shuffle-by-album.token', 'test-access-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
      localStorage.setItem('shuffle-by-album.tokenScope', scopes);
    }, { expiry: Date.now() + 60 * 60 * 1000, scopes: CONNECTED_SCOPES });

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Add at least one album or playlist first.', { exact: true })).toBeVisible();

    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:one', title: 'One' },
      { type: 'album', uri: 'spotify:album:two', title: 'Two' },
    ]);

    await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player\/(shuffle|repeat|play).*$/, async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

    await page.getByRole('button', { name: 'Skip To Next' }).click();
    await expect(page.getByText('Now playing album 2 of 2: Two', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip To Next' }).click();
    await expect(page.getByText('Finished: all selected albums/playlists were played.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('Session stopped.', { exact: true })).toBeVisible();
  });

  test('recoverable playback-start failure stops session instead of detaching', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:one', title: 'One' }]);

    await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player\/(shuffle|repeat|play).*$/, async (route) => {
      if (route.request().url().includes('/me/player/play')) {
        await route.fulfill({ status: 429, body: 'rate limited' });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();

    await expect(page.getByText('Playback failed. Session stopped.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();
  });
});
