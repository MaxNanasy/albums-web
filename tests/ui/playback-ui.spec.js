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
    await ui.playback.startButton.click();

    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: Discovery');
    await expect(ui.playback.queueItems.row('▶ 1. Discovery')).toBeVisible();
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
    await ui.playback.startButton.click();

    await expect(ui.playback.status).toHaveText('Now playing playlist 1 of 1: Road Trip Mix');
    await expect(ui.playback.queueItems.row('▶ 1. Road Trip Mix')).toBeVisible();
  });

  test('Start guardrails and active controls for start/skip/stop/final item', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('shuffle-by-album.token');
      localStorage.removeItem('shuffle-by-album.tokenExpiry');
      Math.random = () => 0.999;
    });

    await page.goto('/');
    await ui.playback.startButton.click();
    await expect(ui.toasts.instance('Connect Spotify first')).toBeVisible();

    await seedConnectedAuth(context);

    await page.reload();
    await ui.playback.startButton.click();
    await expect(ui.toasts.instance('Add at least one album or playlist first')).toBeVisible();

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
    await ui.playback.startButton.click();
    await expect(ui.playback.startButton).toBeDisabled();
    await expect(ui.playback.nextButton).toBeEnabled();
    await expect(ui.playback.stopButton).toBeEnabled();

    await ui.playback.nextButton.click();
    await expect(ui.playback.status).toHaveText('Now playing album 2 of 2: Two');
    await ui.playback.nextButton.click();
    await expect(ui.playback.status).toHaveText('Finished: all selected albums/playlists were played');

    await ui.playback.startButton.click();
    await ui.playback.stopButton.click();
    await expect(ui.playback.status).toHaveText('Session stopped');
  });

  test('Recoverable playback-start failure detaches the session', async ({ context, page, ui }) => {
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
    await ui.playback.startButton.click();

    await expect(ui.playback.status).toHaveText(
      'Playback detached due to a Spotify error: Spotify rate limit reached; please wait a moment and retry: rate limited',
    );
    await expect(ui.playback.reattachButton).toBeVisible();
  });
});
