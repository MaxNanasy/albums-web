import { expect, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('detached session and runtime restore', () => {
  test('unrecoverable start error detaches and reattach handles empty queue + missing token', async ({ context, page }) => {
    await seedItems(context, [{ type: 'album', uri: 'spotify:album:one', title: 'One' }]);

    await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player\/(shuffle|repeat|play).*$/, async (route) => {
      const url = route.request().url();
      if (url.includes('/me/player/play')) {
        await route.fulfill({ status: 404, body: 'device missing' });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Playback detached due to a Spotify error. Reattach when ready.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeVisible();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({ activationState: 'detached', queue: [], index: 0 }));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
    });
    await page.reload();
    await page.getByRole('button', { name: 'Reattach' }).click();
    await expect(page.getByText('Spotify session expired. Please reconnect.', { exact: true })).toBeVisible();
  });

  test('reattach with matched context resumes without restarting playback', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    let playCalls = 0;
    await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player.*$/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, json: { context: { uri: 'spotify:album:one' } } });
        return;
      }
      if (request.url().includes('/me/player/play')) {
        playCalls += 1;
      }
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Reattach' }).click();

    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();
    expect(playCalls).toBe(0);
  });

  test('reattach with mismatched context restarts expected item', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player.*$/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, json: { context: { uri: 'spotify:album:other' } } });
        return;
      }
      if (request.url().includes('/me/player/play')) {
        await route.fulfill({ status: 500, body: 'play failed' });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Reattach' }).click();

    await expect(page.getByText('Playback failed. Session stopped.', { exact: true })).toBeVisible();
  });

  test('restores active runtime state and ignores invalid runtime JSON', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'active',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
        currentUri: 'spotify:album:one',
        observedCurrentContext: false,
      }));
    });

    await page.goto('/');
    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip To Next' })).toBeEnabled();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', '{bad json');
    });
    await page.reload();
    await expect(page.getByText('Connected.', { exact: true })).toBeVisible();
    const runtimeValue = await page.evaluate(() => localStorage.getItem('shuffle-by-album.runtime'));
    expect(runtimeValue).toBeNull();
  });
});
