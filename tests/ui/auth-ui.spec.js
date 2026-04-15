import { expect, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth } from './common.js';
import { isSpotifyAccountTokenRequest } from './ui-helpers.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('auth and connection states', () => {
  test('cold start without token shows disconnected and disconnect clears auth', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Disconnected from Spotify.', { exact: true })).toBeVisible();
  });

  test('missing playlist scopes shows reconnect warning', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.tokenScope', 'user-modify-playback-state user-read-playback-state');
    });

    await page.goto('/');

    await expect(
      page.getByText('Connected, but token is missing playlist import scopes. Disconnect and reconnect.', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('auth redirect with error clears query and records disconnected auth state', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/?error=access_denied');

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
  });

  test('auth redirect with code and missing verifier keeps code and leaves session disconnected', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/?code=abc123');

    await expect(page).toHaveURL('/?code=abc123');
    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
  });

  test('failed code exchange attempts token request and keeps code in URL', async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('shuffle-by-album.pkceVerifier', 'verifier');
    });

    let tokenExchangeRequests = 0;
    await context.route('https://accounts.spotify.com/api/token', async (route) => {
      const request = route.request();
      if (isSpotifyAccountTokenRequest(request)) {
        tokenExchangeRequests += 1;
        await route.fulfill({ status: 400, body: 'bad code' });
        return;
      }
      await route.continue();
    });

    await page.goto('/?code=abc123');

    await expect(page).toHaveURL('/?code=abc123');
    await expect(page.getByText('Not connected.', { exact: true })).toBeVisible();
    expect(tokenExchangeRequests).toBe(1);
  });
});
