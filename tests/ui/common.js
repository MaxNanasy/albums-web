/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {import('@playwright/test').Page} Page */

/**
 * @typedef SavedItem
 * @property {'album' | 'playlist'} type
 * @property {string} uri
 * @property {string} title
 */

const CONNECTED_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

/** @param {string} text */
function exactText(text) {
  return new RegExp(`^${RegExp.escape(text)}$`);
}

/** @param {Page} page */
export function authStatus(page) {
  return page.locator('#auth-status');
}

/** @param {Page} page */
export function playbackStatus(page) {
  return page.locator('#playback-status');
}

/**
 * @param {Page} page
 * @param {string} text
 */
export function itemTitle(page, text) {
  return page.locator('#item-list > li > span').filter({ hasText: exactText(text) });
}

/**
 * @param {Page} page
 * @param {string} text
 */
export function queueItem(page, text) {
  return page.locator('#queue-list > li').filter({ hasText: exactText(text) });
}

/**
 * @param {Page} page
 * @param {string} text
 */
export function toastMessage(page, text) {
  return page.locator('#toast-stack .toast-message').filter({ hasText: exactText(text) });
}

/** @param {BrowserContext} context */
export async function installStableBrowserState(context) {
  await context.addInitScript(() => {
    window.setInterval =
      /** @type {typeof window.setInterval} */
      (() => /** @type {unknown} */ (1));
    window.clearInterval = () => {};
  });
}

/** @param {BrowserContext} context */
export async function seedConnectedAuth(context) {
  await context.addInitScript(({ expiry, scopes }) => {
    localStorage.setItem('shuffle-by-album.token', 'test-access-token');
    localStorage.setItem('shuffle-by-album.tokenExpiry', String(expiry));
    localStorage.setItem('shuffle-by-album.tokenScope', scopes);
  }, { expiry: Date.now() + 60 * 60 * 1000, scopes: CONNECTED_SCOPES });
}

/**
 * @param {BrowserContext} context
 * @param {SavedItem[]} items
 */
export async function seedItems(context, items) {
  await context.addInitScript((savedItems) => {
    localStorage.setItem('shuffle-by-album.items', JSON.stringify(savedItems));
  }, items);
}

/**
 * @param {Request} request
 * @param {string} method
 * @param {string} path
 */
export function isSpotifyApiRequest(request, method, path) {
  const url = new URL(request.url());
  return (
    request.method() === method
    && url.origin === 'https://api.spotify.com'
    && url.pathname === `/v1${path}`
  );
}
