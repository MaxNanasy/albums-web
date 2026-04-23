import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Detached Session and Runtime Restore', () => {
  test('Unrecoverable start error detaches and reattach handles empty queue + missing token', async ({ context, page, ui }) => {
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
        handle: (route) => route.fulfill({ status: 404, body: 'device missing' }),
      },
    ]);

    await page.goto('/');
    await ui.playback.startButton.click();
    await expect(ui.playback.status).toHaveText(
      'Playback detached due to a Spotify error: Requested Spotify item or playback device was not found: device missing',
    );
    await expect(ui.playback.reattachButton).toBeVisible();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({ activationState: 'detached', queue: [], index: 0 }));
    });
    await page.reload();
    await expect(ui.playback.reattachButton).toBeHidden();

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
    await ui.playback.reattachButton.click();
    await expect(ui.playback.status).toHaveText('Spotify session expired; please reconnect');
  });

  test('Reattach with matched context resumes without restarting playback', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    const requests = installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'GET' && request.url() === 'https://api.spotify.com/v1/me/player',
        handle: (route) => route.fulfill({ status: 200, json: { context: { uri: 'spotify:album:one' } } }),
      },
      {
        match: (request) =>
          request.method() === 'PUT'
          && request.url() === 'https://api.spotify.com/v1/me/player/play',
        handle: (route) => route.fulfill({ status: 204, body: '' }),
      },
    ]);

    await page.goto('/');
    await ui.playback.reattachButton.click();

    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: One');
    expect(requests.some((request) => request.url.endsWith('/v1/me/player/play'))).toBe(false);
  });

  test('Recoverable reattach player-state failure shows retry UI and keeps the session detached', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'GET' && request.url() === 'https://api.spotify.com/v1/me/player',
        handle: (route) => route.fulfill({ status: 500, body: 'server busy' }),
      },
    ]);

    await page.goto('/');
    await ui.playback.reattachButton.click();

    await expect(ui.playback.status).toHaveText(
      'Failed to reattach: Spotify is temporarily unavailable; please try again shortly',
    );
    await expect(ui.toasts.instance('Failed to reattach')).toBeVisible();
    await expect(ui.playback.reattachButton).toBeVisible();
  });

  test('Reattach with mismatched context restarts expected item', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', JSON.stringify({
        activationState: 'detached',
        queue: [{ type: 'album', uri: 'spotify:album:one', title: 'One' }],
        index: 0,
      }));
    });

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'GET' && request.url() === 'https://api.spotify.com/v1/me/player',
        handle: (route) => route.fulfill({ status: 200, json: { context: { uri: 'spotify:album:other' } } }),
      },
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
        handle: (route) => route.fulfill({ status: 500, body: 'play failed' }),
      },
    ]);

    await page.goto('/');
    await ui.playback.reattachButton.click();

    await expect(ui.playback.status).toHaveText('Playback failed; session stopped');
  });

  test('Restores active runtime state and ignores invalid runtime JSON', async ({ context, page, ui }) => {
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
    await expect(ui.playback.status).toHaveText('Now playing album 1 of 1: One');
    await expect(ui.playback.nextButton).toBeEnabled();

    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.runtime', '{bad json');
    });
    await page.reload();
    await expect(ui.auth.status).toHaveText('Connected');
    const runtimeValue = await page.evaluate(() => localStorage.getItem('shuffle-by-album.runtime'));
    expect(runtimeValue).toBeNull();
  });
});
