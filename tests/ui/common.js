/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */

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

/** @param {BrowserContext} context */
export async function installStableBrowserState(context) {
  await context.addInitScript(() => {
    window.setInterval =
      /** @type {typeof window.setInterval} */
      (() => /** @type {unknown} */ (1));
    window.clearInterval = () => {};

    let nextTimeoutId = 1;

    /**
     * @param {((...args: unknown[]) => unknown) | string} handler
     * @param {number} timeout
     * @param {...unknown} args
     */
    function stableSetTimeout(handler, timeout = 0, ...args) {
      const timeoutId = nextTimeoutId++;

      // Preserve short timers so toast close and leave animations still finish,
      // while suppressing longer auto-dismiss timers that can race test assertions.
      if (timeout > 200) {
        return /** @type {unknown} */ (timeoutId);
      }

      queueMicrotask(() => {
        if (typeof handler === 'function') {
          handler(...args);
          return;
        }
        globalThis.eval(handler);
      });

      return timeoutId;
    };

    window.setTimeout =
      /** @type {typeof window.setTimeout} */ (/** @type unknown */ (stableSetTimeout));
    window.clearTimeout = () => {};
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
