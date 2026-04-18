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
export function makeUi(page) {
  return {
    auth: {
      status: page.locator('#auth-status'),
      connectButton: page.getByRole('button', { name: 'Connect', exact: true }),
      disconnectButton: page.getByRole('button', { name: 'Disconnect', exact: true }),
    },
    playback: {
      status: page.locator('#playback-status'),
      startButton: page.getByRole('button', { name: 'Start', exact: true }),
      reattachButton: page.getByRole('button', { name: 'Reattach', exact: true }),
      nextButton: page.getByRole('button', { name: 'Next', exact: true }),
      stopButton: page.getByRole('button', { name: 'Stop', exact: true }),
      queueItems: {
        /** @param {string} text */
        byText(text) {
          return page.locator('#queue-list > li').filter({ hasText: exactText(text) });
        },
      },
    },
    savedItems: {
      uriInput: page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...'),
      addButton: page.getByRole('button', { name: 'Add', exact: true }),
      importAlbumsButton: page.getByRole('button', { name: 'Import Albums', exact: true }),
      /** @param {string} text */
      byText(text) {
        return page.locator('#item-list > li > span').filter({ hasText: exactText(text) });
      },
    },
    toasts: {
      /** @param {string} text */
      byText(text) {
        return page.locator('#toast-stack .toast-message').filter({ hasText: exactText(text) });
      },
    },
    storage: {
      json: page.locator('#storage-json'),
      exportDataButton: page.getByRole('button', { name: 'Export Data', exact: true }),
      importDataButton: page.getByRole('button', { name: 'Import Data', exact: true }),
    },
  };
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
