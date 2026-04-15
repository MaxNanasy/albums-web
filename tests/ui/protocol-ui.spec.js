import { expect, test } from './fixtures.js';
import { installStableBrowserState, seedConnectedAuth, seedItems } from './common.js';

test.beforeEach(async ({ context }) => {
  await installStableBrowserState(context);
  await seedConnectedAuth(context);
});

/** @typedef {import('@playwright/test').Request} Request */

/**
 * @param {Request} request
 * @param {number} expectedOffset
 */
function hasPlaylistPageRequest(request, expectedOffset) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET'
    && url.pathname === '/v1/playlists/playlist123/items'
    && url.searchParams.get('limit') === '50'
    && url.searchParams.get('offset') === String(expectedOffset)
    && url.searchParams.get('additional_types') === 'track'
    && url.searchParams.get('market') === 'from_token'
  );
}

test('imports playlist albums across pages and records strict request shape', async ({ context, page }) => {
  await seedItems(context, [
    {
      type: 'album',
      uri: 'spotify:album:existing',
      title: 'Existing Album',
    },
  ]);

  /** @type {Array<{method: string; url: string; postData: string | null}>} */
  const requests = [];
  await context.route(/^https:\/\/api\.spotify\.com\/v1\/playlists\/playlist123\/items\?.*$/, async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), postData: request.postData() });

    if (hasPlaylistPageRequest(request, 0)) {
      await route.fulfill({
        status: 200,
        json: {
          items: [
            { item: { album: { uri: 'spotify:album:existing', name: 'Existing Album' } } },
            { item: { album: { uri: 'spotify:album:new-one', name: 'New Album One' } } },
          ],
          next: 'https://api.spotify.com/v1/playlists/playlist123/items?offset=50',
        },
      });
      return;
    }

    if (hasPlaylistPageRequest(request, 50)) {
      await route.fulfill({
        status: 200,
        json: {
          items: [
            { item: { album: { uri: 'spotify:album:new-one', name: 'New Album One' } } },
            { item: { album: { id: 'new-two', name: 'New Album Two' } } },
          ],
          next: null,
        },
      });
      return;
    }

    throw new Error(`Unexpected playlist import request: ${request.method()} ${request.url()}`);
  });

  await page.goto('/');

  await page.getByPlaceholder('spotify:album:... or spotify:playlist:...').fill('playlist123');
  await page.getByRole('button', { name: 'Import Albums From Playlist' }).click();

  await expect(page.getByText('Existing Album', { exact: true })).toBeVisible();
  await expect(page.getByText('New Album One', { exact: true })).toBeVisible();
  await expect(page.getByText('New Album Two', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Imported 2 album(s) from playlist (3 unique album(s) found).', { exact: true }),
  ).toBeVisible();

  expect(requests.map((request) => request.url)).toEqual([
    'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=0&additional_types=track&market=from_token',
    'https://api.spotify.com/v1/playlists/playlist123/items?limit=50&offset=50&additional_types=track&market=from_token',
  ]);
});

test('start playback sends strict Spotify request order and body payload', async ({ context, page }) => {
  await seedItems(context, [
    {
      type: 'album',
      uri: 'spotify:album:album123',
      title: 'Discovery',
    },
  ]);

  /** @type {Array<{method: string; url: string; postData: string | null}>} */
  const requests = [];
  await context.route(/^https:\/\/api\.spotify\.com\/v1\/me\/player\/(shuffle|repeat|play).*$/, async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), postData: request.postData() });

    const url = request.url();
    const isKnown =
      (request.method() === 'PUT' && url === 'https://api.spotify.com/v1/me/player/shuffle?state=false')
      || (request.method() === 'PUT' && url === 'https://api.spotify.com/v1/me/player/repeat?state=off')
      || (request.method() === 'PUT' && url === 'https://api.spotify.com/v1/me/player/play');
    if (!isKnown) {
      throw new Error(`Unexpected playback request: ${request.method()} ${url}`);
    }

    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText('Now playing album 1 of 1: Discovery', { exact: true })).toBeVisible();

  expect(requests).toEqual([
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/shuffle?state=false',
      postData: null,
    },
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/repeat?state=off',
      postData: null,
    },
    {
      method: 'PUT',
      url: 'https://api.spotify.com/v1/me/player/play',
      postData: JSON.stringify({
        context_uri: 'spotify:album:album123',
        offset: { position: 0 },
        position_ms: 0,
      }),
    },
  ]);
});
