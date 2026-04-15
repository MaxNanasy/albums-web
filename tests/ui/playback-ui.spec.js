import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { CONNECTED_SCOPES } from './ui-helpers.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('playback controls', () => {
  test('starts playback', async ({ context, page }) => {
    await seedItems(context, [
      {
        type: 'album',
        uri: 'spotify:album:album123',
        title: 'Discovery',
      },
    ]);

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/shuffle?state=false',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/repeat?state=off',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/play',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();

    await expect(page.getByText('Now playing album 1 of 1: Discovery', { exact: true })).toBeVisible();
    await expect(page.getByText('▶ 1. Discovery', { exact: true })).toBeVisible();
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

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/shuffle?state=false',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/repeat?state=off',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/play',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
    ]);

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

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/shuffle?state=false',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/repeat?state=off',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/play',
        handle: (route) => route.fulfill({ status: 429, body: 'rate limited' }),
      },
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();

    await expect(page.getByText('Playback failed. Session stopped.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();
  });
});
