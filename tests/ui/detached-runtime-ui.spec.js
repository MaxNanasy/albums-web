import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Detached Session and Runtime Restore', () => {
  test('Unrecoverable start error detaches and reattach handles empty queue + missing token', async ({ context, page }) => {
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

  test('Reattach with matched context resumes without restarting playback', async ({ context, page }) => {
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
    await page.getByRole('button', { name: 'Reattach' }).click();

    await expect(page.getByText('Now playing album 1 of 1: One', { exact: true })).toBeVisible();
    expect(requests.some((request) => request.url.endsWith('/v1/me/player/play'))).toBe(false);
  });

  test('Recoverable reattach player-state failure shows retry UI and keeps the session detached', async ({ context, page }) => {
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
    await page.getByRole('button', { name: 'Reattach' }).click();

    await expect(page.getByText('Unable to reattach right now. Please try again.', { exact: true })).toBeVisible();
    await expect(page.getByText('Failed to reattach Spotify playback.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reattach' })).toBeVisible();
  });

  test('Reattach with mismatched context restarts expected item', async ({ context, page }) => {
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
    await page.getByRole('button', { name: 'Reattach' }).click();

    await expect(page.getByText('Playback failed. Session stopped.', { exact: true })).toBeVisible();
  });

  test('Restores active runtime state and ignores invalid runtime JSON', async ({ context, page }) => {
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
