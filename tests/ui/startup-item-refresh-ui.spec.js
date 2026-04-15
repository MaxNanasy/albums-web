import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';
import { isSpotifyApiRequest } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('startup item title refresh', () => {
  test('startup title refresh updates missing title and tolerates failures', async ({ context, page }) => {
    await seedItems(context, [
      { type: 'album', uri: 'spotify:album:ok', title: '' },
      { type: 'album', uri: 'spotify:album:fail', title: '' },
    ]);

    installSpotifyRoutes(context, [
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/ok'),
        handle: (route) => route.fulfill({ status: 200, json: { name: 'OK Title' } }),
      },
      {
        match: (request) => isSpotifyApiRequest(request, 'GET', '/albums/fail'),
        handle: (route) => route.fulfill({ status: 404, body: '' }),
      },
    ]);

    await page.goto('/');

    await expect(page.getByText('OK Title', { exact: true })).toBeVisible();
    await expect(page.getByText('spotify:album:fail', { exact: true })).toBeVisible();
  });
});
