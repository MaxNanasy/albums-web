import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Playback Controls', () => {
  test('Starts playback', async ({ context, page, ui }) => {
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

    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: Discovery');
    await expect(ui.playback.queueItem('▶ 1. Discovery')).toBeVisible();
  });

  test('Starts playback for a saved playlist item', async ({ context, page, ui }) => {
    await seedItems(context, [{ type: 'playlist', uri: 'spotify:playlist:playlist123', title: 'Road Trip Mix' }]);

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

    await expect(ui.playback.status).toHaveText('Now playing playlist 1 of 1: Road Trip Mix');
    await expect(ui.playback.queueItem('▶ 1. Road Trip Mix')).toBeVisible();
  });

  test('Start guardrails and active controls for start/skip/stop/final item', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
      Math.random = () => 0.999;
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(ui.toast.message('Connect Spotify first.')).toBeVisible();

    await seedConnectedAuth(context);

    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(ui.toast.message('Add at least one album or playlist first.')).toBeVisible();

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
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(ui.playback.status).toHaveText('Now playing album 2 of 2: Two');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(ui.playback.status).toHaveText('Finished: all selected albums/playlists were played.');

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(ui.playback.status).toHaveText('Session stopped.');
  });

  test('Recoverable playback-start failure stops session instead of detaching', async ({ context, page, ui }) => {
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

    await expect(ui.playback.status).toHaveText('Playback failed. Session stopped.');
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeHidden();
  });
});
