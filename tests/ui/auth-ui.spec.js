import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth } from './common.js';

/**
 * @param {import("@playwright/test").Request} request
 */
function isSpotifyAccountTokenRequest(request) {
  return request.method() === 'POST' && request.url() === 'https://accounts.spotify.com/api/token';
}

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Auth and Connection States', () => {
  test('Cold start without token shows disconnected and disconnect clears auth', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    await expect(ui.auth.status).toHaveText('Not connected.');
    await ui.auth.disconnectButton.click();
    await expect(ui.toasts.instance('Disconnected from Spotify.')).toBeVisible();
  });

  test('Connect button stores a PKCE verifier and redirects to Spotify authorize', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');

    installSpotifyRoutes(context, [
      {
        match: (request) =>
          request.method() === 'GET' && request.url().startsWith('https://accounts.spotify.com/authorize?'),
        handle: (route) => route.fulfill({ status: 200, body: '<html><body>ok</body></html>' }),
      },
    ]);

    await ui.auth.connectButton.click();
    await expect(page).toHaveURL(/^https:\/\/accounts\.spotify\.com\/authorize\?/);

    const storageState = await context.storageState();
    const appOrigin = storageState.origins.find((originState) => originState.origin === 'http://127.0.0.1:4173');
    const pkceVerifier = appOrigin?.localStorage.find((entry) => entry.name === 'shuffle-by-album.pkceVerifier');
    expect(pkceVerifier?.value).toBeTruthy();

    const url = new URL(page.url());
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4173/');
    expect(url.searchParams.get('scope')).toBe(
      'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('show_dialog')).toBe('true');
  });

  test('Expired access token with refresh token silently refreshes during bootstrap', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.token', 'expired-access-token');
      localStorage.setItem('shuffle-by-album.refreshToken', 'refresh-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(Date.now() - 5_000));
      localStorage.setItem('shuffle-by-album.tokenScope', 'user-modify-playback-state');
    });

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyAccountTokenRequest(request),
        handle: (route) => route.fulfill({
          status: 200,
          json: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            scope: 'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative',
          },
        }),
      },
    ]);

    await page.goto('/');

    await expect(ui.auth.status).toHaveText('Connected.');

    const authState = await page.evaluate(() => ({
      token: localStorage.getItem('shuffle-by-album.token'),
      refreshToken: localStorage.getItem('shuffle-by-album.refreshToken'),
      tokenExpiry: Number(localStorage.getItem('shuffle-by-album.tokenExpiry')),
      tokenScope: localStorage.getItem('shuffle-by-album.tokenScope'),
    }));

    expect(authState.token).toBe('new-access-token');
    expect(authState.refreshToken).toBe('new-refresh-token');
    expect(authState.tokenExpiry).toBeGreaterThan(Date.now());
    expect(authState.tokenScope).toBe(
      'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative',
    );
  });

  test('Expired access token with unsuccessful refresh falls back to disconnected startup state', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.token', 'expired-access-token');
      localStorage.setItem('shuffle-by-album.refreshToken', 'refresh-token');
      localStorage.setItem('shuffle-by-album.tokenExpiry', String(Date.now() - 5_000));
    });

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyAccountTokenRequest(request),
        handle: (route) => route.fulfill({ status: 400, body: 'bad refresh' }),
      },
    ]);

    await page.goto('/');

    await expect(ui.auth.status).toHaveText('Not connected.');
  });

  test('Missing playlist scopes shows reconnect warning', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.setItem('shuffle-by-album.tokenScope', 'user-modify-playback-state user-read-playback-state');
    });

    await page.goto('/');

    await expect(ui.auth.status).toHaveText(
      'Connected, but token is missing playlist import scopes. Disconnect and reconnect.',
    );
  });

  test('Auth redirect with error clears query and records disconnected auth state', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/?error=access_denied');

    await expect(page).toHaveURL('/');
    await expect(ui.auth.status).toHaveText('Not connected.');
  });

  test('Auth redirect with code and missing verifier keeps code and leaves session disconnected', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/?code=abc123');

    await expect(page).toHaveURL('/?code=abc123');
    await expect(ui.auth.status).toHaveText('Not connected.');
  });

  test('Successful code exchange stores tokens, clears verifier, and removes code from the URL', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('shuffle-by-album.pkceVerifier', 'verifier');
    });

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyAccountTokenRequest(request),
        handle: (route) => route.fulfill({
          status: 200,
          json: {
            access_token: 'exchange-access-token',
            refresh_token: 'exchange-refresh-token',
            expires_in: 3600,
            scope: 'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative',
          },
        }),
      },
    ]);

    await page.goto('/?code=abc123');

    await expect(page).toHaveURL('/');
    await expect(ui.auth.status).toHaveText('Connected.');

    const authState = await page.evaluate(() => ({
      token: localStorage.getItem('shuffle-by-album.token'),
      refreshToken: localStorage.getItem('shuffle-by-album.refreshToken'),
      tokenExpiry: Number(localStorage.getItem('shuffle-by-album.tokenExpiry')),
      tokenScope: localStorage.getItem('shuffle-by-album.tokenScope'),
      verifier: localStorage.getItem('shuffle-by-album.pkceVerifier'),
    }));

    expect(authState.token).toBe('exchange-access-token');
    expect(authState.refreshToken).toBe('exchange-refresh-token');
    expect(authState.tokenExpiry).toBeGreaterThan(Date.now());
    expect(authState.tokenScope).toBe(
      'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative',
    );
    expect(authState.verifier).toBeNull();
  });

  test('Failed code exchange attempts token request and keeps code in URL', async ({ context, page, ui }) => {
    await context.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('shuffle-by-album.pkceVerifier', 'verifier');
    });

    const requests = installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyAccountTokenRequest(request),
        handle: (route) => route.fulfill({ status: 400, body: 'bad code' }),
      },
    ]);

    await page.goto('/?code=abc123');

    await expect(page).toHaveURL('/?code=abc123');
    await expect(ui.auth.status).toHaveText('Not connected.');
    expect(requests).toHaveLength(1);
  });
});
