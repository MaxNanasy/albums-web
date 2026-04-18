import { expect, installSpotifyRoutes, test } from './fixtures.js';
import { installStableBrowserState, isSpotifyApiRequest, itemTitle, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

test.describe('Startup Item Title Refresh', () => {
  test('Startup title refresh updates missing title and tolerates failures', async ({ context, page }) => {
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

    await expect(itemTitle(page, 'OK Title')).toBeVisible();
    await expect(itemTitle(page, 'spotify:album:fail')).toBeVisible();
  });
});
