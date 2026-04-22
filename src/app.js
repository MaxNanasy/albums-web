import { SpotifyApi, SpotifyApiHttpError } from './spotify-api.js';
import { SpotifyAppApi } from './spotify-app-api.js';
import { spotifyStatusMessage } from './spotify-status-message.js';
import { PlayerMonitor, PlayerMonitorStatusError } from './player-monitor.js';
import { ToastPresenter } from './ui/toast-presenter.js';
import { ItemStore } from './core/item-store.js';
import { ErrorReporter, userFacingErrorMessage } from './core/error-reporter.js';
import { AuthFlow } from './core/auth-flow.js';
import { SessionController } from './core/session-controller.js';
import { AuthPanel } from './panels/auth-panel.js';
import { ItemsPanel } from './panels/items-panel.js';
import { SessionPanel } from './panels/session-panel.js';
import { StoragePanel } from './panels/storage-panel.js';

/** @typedef {import('./core/error-reporter.js').ErrorReportOptions} ErrorReportOptions */

/** @typedef {'album' | 'playlist'} ItemType */

/**
 * @typedef ShuffleItem
 * @property {string} uri
 * @property {ItemType} type
 * @property {string} title
 */

/**
 * @typedef SessionState
 * @property {'inactive' | 'active' | 'detached'} activationState
 * @property {ShuffleItem[]} queue
 * @property {number} index
 * @property {string | null} currentUri
 * @property {boolean} observedCurrentContext
 */

const SCOPES = [
  // control playback + read active playback context
  'user-modify-playback-state',
  'user-read-playback-state',
  // read playlist metadata/tracks for importing albums
  'playlist-read-private',
  'playlist-read-collaborative',
];
const SPOTIFY_APP_ID = '5082b1452bc24cc3a0955f2d1c4e5560';

const STORAGE_KEYS = {
  verifier: 'shuffle-by-album.pkceVerifier',
  token: 'shuffle-by-album.token',
  refreshToken: 'shuffle-by-album.refreshToken',
  tokenExpiry: 'shuffle-by-album.tokenExpiry',
  tokenScope: 'shuffle-by-album.tokenScope',
  items: 'shuffle-by-album.items',
  removedItems: 'shuffle-by-album.removedItems',
  runtime: 'shuffle-by-album.runtime',
};

const el = {
  loginBtn: /** @type {HTMLButtonElement} */ (document.getElementById('login-btn')),
  logoutBtn: /** @type {HTMLButtonElement} */ (document.getElementById('logout-btn')),
  authStatus: /** @type {HTMLParagraphElement} */ (document.getElementById('auth-status')),
  addForm: /** @type {HTMLFormElement} */ (document.getElementById('add-form')),
  itemUri: /** @type {HTMLInputElement} */ (document.getElementById('item-uri')),
  importPlaylistBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById('import-playlist-btn')
  ),
  itemList: /** @type {HTMLUListElement} */ (document.getElementById('item-list')),
  removedItemsSection: /** @type {HTMLElement} */ (
    document.getElementById('removed-items-section')
  ),
  removedItemsCount: /** @type {HTMLElement} */ (
    document.getElementById('removed-items-count')
  ),
  removedItemsList: /** @type {HTMLUListElement} */ (
    document.getElementById('removed-items-list')
  ),
  purgeRemovedItemsBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById('purge-removed-items-btn')
  ),
  startBtn: /** @type {HTMLButtonElement} */ (document.getElementById('start-btn')),
  reattachBtn: /** @type {HTMLButtonElement} */ (document.getElementById('reattach-btn')),
  skipBtn: /** @type {HTMLButtonElement} */ (document.getElementById('skip-btn')),
  stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById('stop-btn')),
  playbackStatus: /** @type {HTMLParagraphElement} */ (document.getElementById('playback-status')),
  queueList: /** @type {HTMLUListElement} */ (document.getElementById('queue-list')),
  exportStorageBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById('export-storage-btn')
  ),
  importStorageBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById('import-storage-btn')
  ),
  storageJson: /** @type {HTMLTextAreaElement} */ (document.getElementById('storage-json')),
  toastStack: /** @type {HTMLDivElement} */ (document.getElementById('toast-stack')),
};

const toastPresenter = new ToastPresenter(el.toastStack);
const itemStore = new ItemStore({
  items: STORAGE_KEYS.items,
  removedItems: STORAGE_KEYS.removedItems,
});
const authPanel = new AuthPanel(el);
const itemsPanel = new ItemsPanel(el);
const sessionPanel = new SessionPanel(el);
const storagePanel = new StoragePanel(el);

const errorReporter = new ErrorReporter({
  setAuthStatus: (message) => authPanel.renderStatus(message),
  setPlaybackStatus: (message) => sessionPanel.renderPlaybackStatus(message),
  showToast: (message, type = 'info') => toastPresenter.show(message, type),
});
const authFlow = new AuthFlow({
  scopes: SCOPES,
  spotifyAppId: SPOTIFY_APP_ID,
  storageKeys: STORAGE_KEYS,
  reportError: (error, options) => errorReporter.report(error, options),
  setAuthStatus: (message) => authPanel.renderStatus(message),
});

const spotifyApi = new SpotifyApi({
  getAccessToken: getUsableAccessToken,
  refreshSpotifyAccessToken,
  handleAuthExpired,
});
const spotifyAppApi = new SpotifyAppApi(spotifyApi);
const sessionController = new SessionController({
  runtimeStorageKey: STORAGE_KEYS.runtime,
  getUsableAccessToken,
  spotifyAppApi,
  showToast,
  setPlaybackStatus: (message) => sessionPanel.renderPlaybackStatus(message),
  renderPlaybackControls: (activationState) => sessionPanel.renderControls(activationState),
  renderSessionQueue: (session) => sessionPanel.renderQueue(session),
  reportError,
  isUnrecoverableSpotifyError,
  isUnrecoverableSpotifyStatus,
  spotifyStatusMessage,
  getItems,
  shuffledCopy,
});


const playerMonitor = new PlayerMonitor({
  getSession: () => sessionController.getSession(),
  getUsableAccessToken,
  spotifyAppApi,
  persistRuntimeState: () => sessionController.persistRuntimeState(),
  transitionToDetached: (message) => sessionController.transitionToDetached(message),
  goToNextItem: () => sessionController.goToNextItem(),
  reportError: reportMonitorError,
  isUnrecoverableSpotifyStatus,
});
sessionController.setPlayerMonitor(playerMonitor);

/** @type {ShuffleItem[]} */
const removedItems = itemStore.getRemovedItems();
/** @type {Map<string, { item: ShuffleItem; index: number }>} */
const pendingUndoRemovals = new Map();

void runWithReportedError(bootstrap, {
  context: 'startup',
  fallbackMessage: 'The app failed to initialize.',
  authStatusMessage: 'Startup failed. Please refresh and reconnect Spotify.',
  toastMode: 'cooldown',
  toastKey: 'startup',
});

async function bootstrap() {
  hookEvents();
  restoreRuntimeState();
  await handleAuthRedirect();
  await ensureValidAccessToken();
  renderItemList();
  renderRemovedItems();
  renderSessionQueue();
  renderPlaybackControls();
  refreshStartupAuthStatus();
  await ensureStoredItemTitles();
}

async function ensureValidAccessToken() {
  await runWithReportedError(async () => {
    await getUsableAccessToken();
  }, {
    context: 'auth',
    fallbackMessage: 'Unable to restore Spotify session.',
    authStatusMessage: 'Unable to restore Spotify session. Please reconnect.',
    toastMode: 'cooldown',
    toastKey: 'auth-validate',
  });
}

function hookEvents() {
  authPanel.bind({
    onLogin: () => {
      void runWithReportedError(() => startLogin(), {
        context: 'auth',
        fallbackMessage: 'Failed to start Spotify connection.',
        authStatusMessage: 'Unable to connect right now. Please try again.',
      });
    },
    onLogout: () => {
      clearAuth();
      refreshAuthStatus();
      showToast('Disconnected from Spotify.', 'info');
    },
  });

  itemsPanel.bind({
    onAdd: (rawUri) => {
      void addItemFromInput(rawUri);
    },
    onImportPlaylist: () => {
      void runWithReportedError(() => importAlbumsFromPlaylist(), {
        context: 'import',
        fallbackMessage: 'Failed to import albums from playlist.',
      });
    },
    onRemove: (uri) => {
      removeItemWithUndo(uri);
    },
    onRestoreRemovedItems: (uri) => {
      restoreRemovedItem(uri);
    },
    onPurgeRemovedItems: () => {
      purgeRemovedItems();
    },
  });

  sessionPanel.bind({
    onStart: () => {
      void runWithReportedError(() => startShuffleSession(), {
        context: 'playback',
        fallbackMessage: 'Failed to start shuffle session.',
        playbackStatusMessage: 'Unable to start session right now. Please try again.',
      });
    },
    onReattach: () => {
      void (async () => {
        try {
          await reattachSession();
        } catch (error) {
          reportError(error, {
            context: 'playback',
            fallbackMessage: 'Failed to reattach.',
          });
          setPlaybackStatus(`Failed to reattach: ${errorDetailForStatus(error, 'Please try again')}.`);
        }
      })();
    },
    onSkip: () => {
      void runWithReportedError(() => goToNextItem(), {
        context: 'playback',
        fallbackMessage: 'Failed to skip to the next item.',
        playbackStatusMessage: 'Unable to skip right now. Please try again.',
      });
    },
    onStop: () => {
      stopSession('Session stopped.');
    },
  });

  storagePanel.bind({
    onExport: () => {
      exportLocalStorageJson();
    },
    onImport: () => {
      importLocalStorageJson();
    },
  });
}

/** @param {string} rawUri */
async function addItemFromInput(rawUri) {
  try {
    const parsed = parseSpotifyUri(rawUri);
    if (!parsed) {
      showToast('Enter a valid Spotify album/playlist URI or URL.', 'error');
      return;
    }
    const items = getItems();
    if (items.some((item) => item.uri === parsed.uri)) {
      removeRemovedItemByUri(parsed.uri);
      renderRemovedItems();
      showToast('Item is already in your list.', 'info');
      return;
    }
    const token = await getUsableAccessToken();
    if (!token) {
      showToast('Connect Spotify first so the app can load item titles.', 'error');
      return;
    }

    const titledItem = await withItemTitle(parsed);
    if (!titledItem) {
      showToast('Unable to load title for that item. Please try another URI.', 'error');
      return;
    }

    items.push(titledItem);
    saveItems(items);
    itemsPanel.clearInput();
    removeRemovedItemByUri(titledItem.uri);
    renderItemList();
    renderRemovedItems();
    showToast(`Added “${titledItem.title}”.`, 'success');
  } catch (error) {
    reportError(error, {
      context: 'items',
      fallbackMessage: 'Failed to add this item.',
    });
  }
}

/** @param {string} uri */
function removeItemWithUndo(uri) {
  const removed = itemStore.removeByUri(uri);
  if (!removed) return;

  pendingUndoRemovals.set(uri, {
    item: removed.removedItem,
    index: removed.removedIndex,
  });
  upsertRemovedItem(removed.removedItem);

  renderItemList();
  renderRemovedItems();
  showToast(`Removed “${removed.removedItem.title}”.`, 'info', {
    action: {
      actionLabel: 'Undo',
      onAction: () => {
        undoRemovedItem(uri);
      },
    },
  });
}

/** @param {string} uri */
function undoRemovedItem(uri) {
  const pendingRemoval = pendingUndoRemovals.get(uri);
  if (!pendingRemoval) return;

  const restore = itemStore.restoreItem(pendingRemoval.item, pendingRemoval.index);
  pendingUndoRemovals.delete(uri);

  if (!restore.ok) {
    showToast('Item is already in your list.', 'info');
    return;
  }

  removeRemovedItemByUri(uri);
  renderItemList();
  renderRemovedItems();
  showToast(`Restored “${pendingRemoval.item.title}”.`, 'success');
}

/** @param {string} uri */
function restoreRemovedItem(uri) {
  const entryIndex = removedItems.findIndex((item) => item.uri === uri);
  if (entryIndex < 0) return;

  const [item] = removedItems.splice(entryIndex, 1);
  persistRemovedItems();
  pendingUndoRemovals.delete(uri);
  const restore = itemStore.restoreItem(item, getItems().length);
  renderRemovedItems();

  if (!restore.ok) {
    showToast('Item is already in your list.', 'info');
    return;
  }

  renderItemList();
  showToast(`Restored “${item.title}”.`, 'success');
}

function clearRemovedItems() {
  removedItems.splice(0, removedItems.length);
  persistRemovedItems();
  renderRemovedItems();
}

function purgeRemovedItems() {
  if (removedItems.length === 0) return;

  const itemLabel = removedItems.length === 1 ? '1 item' : `${removedItems.length} items`;
  if (!window.confirm(`Permanently remove ${itemLabel} from Removed Items?`)) {
    return;
  }

  clearRemovedItems();
  showToast('Purged Removed Items.', 'info');
}

function persistRemovedItems() {
  itemStore.saveRemovedItems(removedItems);
}

/** @param {ShuffleItem} item */
function upsertRemovedItem(item) {
  removeRemovedItemByUri(item.uri);
  removedItems.unshift(item);
  persistRemovedItems();
}

/** @param {string} uri */
function removeRemovedItemByUri(uri) {
  const entryIndex = removedItems.findIndex((item) => item.uri === uri);
  if (entryIndex < 0) return false;

  removedItems.splice(entryIndex, 1);
  persistRemovedItems();
  return true;
}

/** @param {string[]} uris */
function removeRemovedItemsByUris(uris) {
  if (uris.length === 0) return false;

  const uriSet = new Set(uris);
  const remainingItems = removedItems.filter((item) => !uriSet.has(item.uri));
  if (remainingItems.length === removedItems.length) return false;

  removedItems.splice(0, removedItems.length, ...remainingItems);
  persistRemovedItems();
  return true;
}

function refreshAuthStatus() {
  const token = getToken();
  if (!token) {
    setAuthStatus('Not connected.');
    return;
  }
  const scopeSet = getGrantedScopes();
  if (!scopeSet.has('playlist-read-private') || !scopeSet.has('playlist-read-collaborative')) {
    setAuthStatus(
      `Connected, but token is missing playlist import scopes. Disconnect and reconnect.`,
    );
    return;
  }
  setAuthStatus('Connected.');
}

function refreshStartupAuthStatus() {
  const redirectStatus = authFlow.consumePendingRedirectStatus();
  if (redirectStatus && !getToken()) {
    setAuthStatus(redirectStatus);
    return;
  }

  const refreshFailureStatus = authFlow.consumePendingRefreshFailureStatus();
  if (refreshFailureStatus && !getToken()) {
    setAuthStatus(refreshFailureStatus);
    return;
  }

  refreshAuthStatus();
}

function getGrantedScopes() {
  return authFlow.getGrantedScopes();
}

async function ensureStoredItemTitles() {
  const items = getItems();
  if (items.length === 0) return;

  const token = await runWithReportedError(() => getUsableAccessToken(), {
    context: 'items',
    fallbackMessage: 'Unable to refresh saved item titles.',
    toastMode: 'cooldown',
    toastKey: 'item-title-refresh',
  });
  if (token === undefined) {
    return;
  }
  if (!token) return;

  let changed = false;
  /** @type {ShuffleItem[]} */
  const updated = [];
  for (const item of items) {
    if (item.title) {
      updated.push(item);
      continue;
    }

    const titledItem = await withItemTitle(item);
    if (!titledItem) {
      updated.push({ ...item, title: item.uri });
    } else {
      updated.push(titledItem);
    }
    changed = true;
  }

  if (changed) {
    saveItems(updated);
    renderItemList();
  }
}

function handleAuthExpired() {
  clearAuth();
  transitionToDetached('Spotify session expired. Please reconnect.');
  setAuthStatus('Spotify session expired. Please reconnect.');
}

/** @param {string} message */
function setAuthStatus(message) {
  authPanel.renderStatus(message);
}

/** @param {string} message */
function setPlaybackStatus(message) {
  sessionPanel.renderPlaybackStatus(message);
}


/** @typedef {{ actionLabel: string, onAction: () => void }} ToastAction */
/**
 * @param {string} message
 * @param {'success' | 'info' | 'error'} [type]
 * @param {{ action?: ToastAction }} [options]
 */
function showToast(message, type = 'info', options = {}) {
  toastPresenter.show(message, type, options);
}


async function startLogin() {
  await authFlow.startLogin();
}

async function handleAuthRedirect() {
  await authFlow.handleAuthRedirect();
}

function clearAuth() {
  authFlow.clearAuth();
}

async function refreshSpotifyAccessToken() {
  return authFlow.refreshSpotifyAccessToken();
}

function exportLocalStorageJson() {
  const exported = itemStore.exportData();
  if (exported.error) {
    storagePanel.setJsonInput('');
    showToast(exported.error, 'error');
    return;
  }

  storagePanel.setJsonInput(JSON.stringify(exported.data, null, 2));
  showToast('Exported saved items to JSON.', 'success');
}

function importLocalStorageJson() {
  const imported = itemStore.importFromJson(storagePanel.getJsonInput());
  if (!imported.ok) {
    const error = imported.error ?? 'Import failed.';
    showToast(error, 'error');
    return;
  }

  stopSession('Data imported. Session reset.');
  removedItems.splice(0, removedItems.length, ...imported.removedItems);
  renderItemList();
  renderRemovedItems();
  refreshAuthStatus();
  showToast('Imported saved items.', 'success');
}

function getToken() {
  return authFlow.getToken();
}

async function getUsableAccessToken() {
  return authFlow.getUsableAccessToken();
}

/** @returns {ShuffleItem[]} */
function getItems() {
  return itemStore.getItems();
}

/** @param {ShuffleItem[]} items */
function saveItems(items) {
  itemStore.saveItems(items);
}

function renderItemList() {
  itemsPanel.renderList(getItems());
}

function renderRemovedItems() {
  itemsPanel.renderRemovedItems(removedItems);
}

async function startShuffleSession() {
  await sessionController.startShuffleSession();
}

/** @param {string} message */
function stopSession(message) {
  sessionController.stopSession(message);
}

/** @param {string} message */
function transitionToInactive(message) {
  sessionController.transitionToInactive(message);
}

/** @param {string} message */
function transitionToDetached(message) {
  sessionController.transitionToDetached(message);
}

function renderPlaybackControls() {
  sessionPanel.renderControls(sessionController.getSession().activationState);
}

async function goToNextItem() {
  await sessionController.goToNextItem();
}

async function reattachSession() {
  await sessionController.reattachSession();
}

async function playCurrentItem() {
  await sessionController.playCurrentItem();
}

async function importAlbumsFromPlaylist() {
  const token = await getUsableAccessToken();
  if (!token) {
    showToast('Connect Spotify first so the app can import albums.', 'error');
    return;
  }

  const parsedPlaylist = parseSpotifyPlaylistRef(itemsPanel.getUriInput());
  if (!parsedPlaylist) {
    showToast('Enter a valid Spotify playlist URL, URI, or playlist ID.', 'error');
    return;
  }

  showToast('Importing albums from playlist...', 'info');

  const existingItems = getItems();
  const existingUris = new Set(existingItems.map((item) => item.uri));
  const importResult = await fetchPlaylistAlbums(parsedPlaylist.id);
  if (importResult.errorMessage) {
    showToast(importResult.errorMessage, 'error');
    return;
  }
  const albumsFromPlaylist = importResult.albums;

  let added = 0;
  for (const album of albumsFromPlaylist) {
    if (existingUris.has(album.uri)) continue;
    existingItems.push(album);
    existingUris.add(album.uri);
    added += 1;
  }

  saveItems(existingItems);
  removeRemovedItemsByUris(albumsFromPlaylist.map((album) => album.uri));
  renderItemList();
  renderRemovedItems();
  showToast(
    `Imported ${added} album(s) from playlist (${albumsFromPlaylist.length} unique album(s) found).`,
    'success',
  );
}

/**
 * @param {string} playlistId
 * @returns {Promise<{albums: ShuffleItem[]; errorMessage: string | null}>}
 */
async function fetchPlaylistAlbums(playlistId) {
  /** @type {Map<string, ShuffleItem>} */
  const albumsByUri = new Map();
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyAppApi.getPlaylistAlbumsPage(playlistId, offset, limit);
    if (!page.ok) {
      const details = page.errorText ? `${page.status} ${page.errorText}` : String(page.status);
      return {
        albums: [],
        errorMessage: `Error importing albums: ${details}.`,
      };
    }

    for (const album of page.albums) {
      if (!albumsByUri.has(album.uri)) {
        albumsByUri.set(album.uri, {
          uri: album.uri,
          type: 'album',
          title: album.title || album.uri,
        });
      }
    }

    if (!page.hasNext) break;
    offset += limit;
  }

  return { albums: [...albumsByUri.values()], errorMessage: null };
}

/**
 * @param {{uri: string; type: ItemType; title?: string}} item
 * @returns {Promise<ShuffleItem | null>}
 */
async function withItemTitle(item) {
  const id = spotifyIdFromUri(item.uri);
  if (!id) return null;

  const title = await spotifyAppApi.getItemTitle(item.type, id);
  if (!title) return null;

  return { uri: item.uri, type: item.type, title };
}

/** @param {string} uri */
function spotifyIdFromUri(uri) {
  const match = uri.match(/^spotify:(album|playlist):([a-zA-Z0-9]+)$/);
  return match ? match[2] : null;
}

function restoreRuntimeState() {
  sessionController.restoreRuntimeState();
}

function persistRuntimeState() {
  sessionController.persistRuntimeState();
}

function clearRuntimeState() {
  sessionController.clearRuntimeState();
}

function renderSessionQueue() {
  sessionPanel.renderQueue(sessionController.getSession());
}

/**
 * @param {ShuffleItem} item
 * @returns {string}
 */
function formatNowPlayingStatus(item) {
  return sessionController.formatNowPlayingStatus(item);
}

/**
 * @template T
 * @param {() => T | Promise<T>} task
 * @param {ErrorReportOptions} reportErrorOptions
 * @returns {Promise<T | undefined>}
 */
async function runWithReportedError(task, reportErrorOptions) {
  return errorReporter.run(task, reportErrorOptions);
}

/** @param {unknown} error */
function reportMonitorError(error) {
  if (error instanceof PlayerMonitorStatusError) {
    const detail = spotifyStatusMessage(error.status, 'Could not check playback state.');
    reportError(error, {
      context: 'monitor',
      fallbackMessage: 'Playback monitor encountered an error.',
      playbackStatusMessage: `Playback monitor encountered an error: ${detail}`,
      toastMode: 'cooldown',
      toastKey: `monitor-http-${error.status}`,
    });
    return;
  }

  reportError(error, {
    context: 'monitor',
    fallbackMessage: 'Playback monitor encountered an error.',
    playbackStatusMessage: 'Playback monitor encountered an error.',
    toastMode: 'cooldown',
    toastKey: 'monitor-loop',
  });
}

/**
 * @param {unknown} error
 * @param {ErrorReportOptions} options
 */
function reportError(error, options) {
  errorReporter.report(error, options);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isUnrecoverableSpotifyError(error) {
  const status = spotifyStatusFromError(error);
  return typeof status === 'number' && isUnrecoverableSpotifyStatus(status);
}

/**
 * @param {unknown} error
 * @returns {number | null}
 */
function spotifyStatusFromError(error) {
  if (error instanceof SpotifyApiHttpError) return error.status;
  return null;
}

/**
 * @param {unknown} error
 * @param {string} fallbackDetail
 * @returns {string}
 */
function errorDetailForStatus(error, fallbackDetail) {
  const rawFallback = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const detail = userFacingErrorMessage(error, rawFallback || fallbackDetail).trim();
  if (!detail) return 'Please try again';
  return detail.replace(/[.!?]+$/u, '');
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isUnrecoverableSpotifyStatus(status) {
  return status === 401 || status === 403 || status === 404;
}

/**
 * @param {string} raw
 * @returns {ShuffleItem | null}
 */
function parseSpotifyUri(raw) {
  if (!raw) return null;

  const uriMatch = raw.match(/^spotify:(album|playlist):([a-zA-Z0-9]+)$/);
  if (uriMatch) {
    return { type: /** @type {ItemType} */ (uriMatch[1]), uri: raw, title: '' };
  }

  try {
    const url = new URL(raw);
    if (!url.hostname.includes('spotify.com')) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const [, type, id] = ['', segments[0], segments[1]];
    if ((type === 'album' || type === 'playlist') && /^[a-zA-Z0-9]+$/.test(id)) {
      return { type, uri: `spotify:${type}:${id}`, title: '' };
    }
  } catch {
    // not a URL
  }

  return null;
}

/**
 * @param {string} raw
 * @returns {{id: string; uri: string} | null}
 */
function parseSpotifyPlaylistRef(raw) {
  if (!raw) return null;

  const uriItem = parseSpotifyUri(raw);
  if (uriItem?.type === 'playlist') {
    const id = spotifyIdFromUri(uriItem.uri);
    if (!id) return null;
    return { id, uri: uriItem.uri };
  }

  if (/^[a-zA-Z0-9]+$/.test(raw)) {
    return { id: raw, uri: `spotify:playlist:${raw}` };
  }

  return null;
}

/** @param {ShuffleItem[]} values */
function shuffledCopy(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
