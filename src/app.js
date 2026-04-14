import { SpotifyApi, SpotifyApiHttpError } from './spotify-api.js';
import { SpotifyAppApi } from './spotify-app-api.js';
import { spotifyStatusMessage } from './spotify-status-message.js';
import { PlayerMonitor, PlayerMonitorStatusError } from './player-monitor.js';
import { ToastPresenter } from './ui/toast-presenter.js';
import { ItemStore } from './core/item-store.js';
import { AuthPanel } from './panels/auth-panel.js';
import { ItemsPanel } from './panels/items-panel.js';
import { SessionPanel } from './panels/session-panel.js';
import { StoragePanel } from './panels/storage-panel.js';

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

/** @type {SessionState} */
const session = {
  activationState: 'inactive',
  queue: [],
  index: 0,
  currentUri: null,
  observedCurrentContext: false,
};

const ERROR_TOAST_COOLDOWN_MS = 45000;
/** @type {Map<string, number>} */
const errorToastLastShownAt = new Map();

const toastPresenter = new ToastPresenter(el.toastStack);
const itemStore = new ItemStore({ items: STORAGE_KEYS.items });
const authPanel = new AuthPanel(el);
const itemsPanel = new ItemsPanel(el);
const sessionPanel = new SessionPanel(el);
const storagePanel = new StoragePanel(el);

const spotifyApi = new SpotifyApi({
  getAccessToken: getUsableAccessToken,
  refreshSpotifyAccessToken,
  handleAuthExpired,
});
const spotifyAppApi = new SpotifyAppApi(spotifyApi);


const playerMonitor = new PlayerMonitor({
  getSession: () => session,
  getUsableAccessToken,
  spotifyAppApi,
  persistRuntimeState,
  transitionToDetached,
  goToNextItem,
  reportError: reportMonitorError,
  isUnrecoverableSpotifyStatus,
});

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
  renderSessionQueue();
  renderPlaybackControls();
  refreshAuthStatus();
  await ensureStoredItemTitles();
}

async function ensureValidAccessToken() {
  await runWithReportedError(async () => {
    await getUsableAccessToken();
  }, {
    context: 'auth',
    fallbackMessage: 'Unable to validate Spotify session.',
    authStatusMessage: 'Unable to validate Spotify session. Please reconnect.',
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
      void runWithReportedError(() => reattachSession(), {
        context: 'playback',
        fallbackMessage: 'Failed to reattach Spotify playback.',
        playbackStatusMessage: 'Unable to reattach right now. Please try again.',
      });
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
    renderItemList();
    showToast('Item added.', 'success');
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

  renderItemList();
  showToast(`Removed “${removed.removedItem.title}”.`, 'info', {
    action: {
      actionLabel: 'Undo',
      onAction: () => {
        const restore = itemStore.restoreItem(removed.removedItem, removed.removedIndex);
        if (!restore.ok) {
          showToast('Item is already in your list.', 'info');
          return;
        }

        renderItemList();
        showToast(`Restored “${removed.removedItem.title}”.`, 'success');
      },
    },
  });
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

function getGrantedScopes() {
  const scopeText = localStorage.getItem(STORAGE_KEYS.tokenScope) ?? '';
  return new Set(scopeText.split(/\s+/).filter(Boolean));
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
  const verifier = randomString(64);
  const challenge = await codeChallengeFromVerifier(verifier);
  localStorage.setItem(STORAGE_KEYS.verifier, verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_APP_ID,
    scope: SCOPES.join(' '),
    redirect_uri: location.origin + location.pathname,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true',
  });

  location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleAuthRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    setAuthStatus(`Spotify authorization error: ${error}`);
    url.searchParams.delete('error');
    history.replaceState({}, '', url.toString());
    return;
  }

  if (!code) return;

  const verifier = localStorage.getItem(STORAGE_KEYS.verifier);

  if (!verifier) {
    setAuthStatus('Missing PKCE verifier. Try connecting again.');
    return;
  }

  const formData = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: location.origin + location.pathname,
    client_id: SPOTIFY_APP_ID,
    code_verifier: verifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (!response.ok) {
    setAuthStatus('Failed to exchange Spotify code for token.');
    return;
  }

  /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */
  const data = await response.json();
  localStorage.setItem(STORAGE_KEYS.token, data.access_token);
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh_token);
  }
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, String(Date.now() + data.expires_in * 1000));
  localStorage.setItem(STORAGE_KEYS.tokenScope, data.scope ?? '');
  localStorage.removeItem(STORAGE_KEYS.verifier);

  url.searchParams.delete('code');
  history.replaceState({}, '', url.toString());
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.tokenExpiry);
  localStorage.removeItem(STORAGE_KEYS.tokenScope);
  localStorage.removeItem(STORAGE_KEYS.verifier);
}

async function refreshSpotifyAccessToken() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return null;

  const formData = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: SPOTIFY_APP_ID,
  });

  const response = await runWithReportedError(
    () =>
      fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
      }),
    {
      context: 'auth',
      fallbackMessage: 'Unable to refresh Spotify session.',
      authStatusMessage: 'Network issue refreshing Spotify session. Please reconnect if this continues.',
      toastMode: 'cooldown',
      toastKey: 'refresh-token-network',
    },
  );
  if (!response) {
    return null;
  }
  if (!response.ok) return null;

  /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */
  const data = await response.json();
  localStorage.setItem(STORAGE_KEYS.token, data.access_token);
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, String(Date.now() + data.expires_in * 1000));
  if (typeof data.scope === 'string') {
    localStorage.setItem(STORAGE_KEYS.tokenScope, data.scope);
  }
  if (data.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh_token);
  }
  return data.access_token;
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
  renderItemList();
  refreshAuthStatus();
  showToast('Imported saved items.', 'success');
}

function getToken() {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  const expiryMs = Number(localStorage.getItem(STORAGE_KEYS.tokenExpiry) ?? 0);
  if (!token || Date.now() >= expiryMs) {
    return null;
  }
  return token;
}

async function getUsableAccessToken() {
  const token = getToken();
  if (token) return token;

  const hasRefreshToken = Boolean(localStorage.getItem(STORAGE_KEYS.refreshToken));
  if (!hasRefreshToken) return null;

  return refreshSpotifyAccessToken();
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

async function startShuffleSession() {
  const token = await getUsableAccessToken();
  if (!token) {
    showToast('Connect Spotify first.', 'error');
    return;
  }

  const items = getItems();
  if (items.length === 0) {
    showToast('Add at least one album or playlist first.', 'info');
    return;
  }

  session.queue = shuffledCopy(items);
  session.activationState = 'active';
  session.index = 0;
  persistRuntimeState();
  renderSessionQueue();
  renderPlaybackControls();

  setPlaybackStatus(`Session started with ${session.queue.length} item(s).`);
  await playCurrentItem();
  if (session.activationState === 'active') {
    playerMonitor.start();
  }
}

/** @param {string} message */
function stopSession(message) {
  transitionToInactive(message);
}

/** @param {string} message */
function transitionToInactive(message) {
  playerMonitor.stop();
  session.activationState = 'inactive';
  session.queue = [];
  session.index = 0;
  session.currentUri = null;
  session.observedCurrentContext = false;
  clearRuntimeState();
  renderSessionQueue();
  renderPlaybackControls();
  setPlaybackStatus(message);
}

/** @param {string} message */
function transitionToDetached(message) {
  if (session.activationState === 'inactive') {
    return;
  }
  playerMonitor.stop();
  session.activationState = 'detached';
  persistRuntimeState();
  renderPlaybackControls();
  setPlaybackStatus(message);
}

function renderPlaybackControls() {
  sessionPanel.renderControls(session.activationState);
}

async function goToNextItem() {
  if (session.activationState !== 'active') {
    setPlaybackStatus('No active session.');
    return;
  }

  session.index += 1;
  persistRuntimeState();
  if (session.index >= session.queue.length) {
    stopSession('Finished: all selected albums/playlists were played.');
    return;
  }
  renderSessionQueue();

  await playCurrentItem();
}

async function reattachSession() {
  if (session.activationState !== 'detached') {
    return;
  }
  const current = session.queue[session.index];
  if (!current) {
    transitionToInactive('No queued item available to reattach.');
    return;
  }

  const token = await getUsableAccessToken();
  if (!token) {
    transitionToDetached('Spotify session expired. Please reconnect.');
    return;
  }

  const playerState = await spotifyAppApi.getPlayerState();
  if (!playerState.ok) {
    if (isUnrecoverableSpotifyStatus(playerState.status)) {
      transitionToDetached(spotifyStatusMessage(playerState.status, 'Unable to reattach playback state.'));
      return;
    }
    throw new Error(
      `Unable to check current Spotify playback (${playerState.status}): ${playerState.errorText}`,
    );
  }

  const contextUri = playerState.contextUri;

  if (contextUri !== current.uri) {
    session.activationState = 'active';
    await playCurrentItem();
  } else {
    session.currentUri = current.uri;
    session.observedCurrentContext = true;
    session.activationState = 'active';
    persistRuntimeState();
    renderPlaybackControls();
    setPlaybackStatus(formatNowPlayingStatus(current));
  }
  if (session.activationState === 'active') {
    playerMonitor.start();
  }
}

async function playCurrentItem() {
  const current = session.queue[session.index];
  if (!current) {
    transitionToInactive('Finished: all selected albums/playlists were played.');
    return;
  }
  session.currentUri = current.uri;
  session.observedCurrentContext = false;
  session.activationState = 'active';
  persistRuntimeState();
  renderPlaybackControls();

  const token = await getUsableAccessToken();
  if (!token) {
    stopSession('Spotify session expired. Please reconnect.');
    return;
  }

  try {
    await spotifyAppApi.disableShuffle();
    await spotifyAppApi.disableRepeat();
    await spotifyAppApi.playContext(current.uri);
  } catch (error) {
    reportError(error, {
      context: 'playback',
      fallbackMessage: 'Unable to start playback on Spotify.',
      playbackStatusMessage: 'Could not start playback. Ensure an active Spotify device is available.',
    });
    if (isUnrecoverableSpotifyError(error)) {
      transitionToDetached('Playback detached due to a Spotify error. Reattach when ready.');
      return;
    }
    stopSession('Playback failed. Session stopped.');
    return;
  }

  setPlaybackStatus(formatNowPlayingStatus(current));
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
  renderItemList();
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
      return {
        albums: [],
        errorMessage: `Unable to import albums from that playlist (${page.status}). ${page.errorText || 'Please try again.'}`,
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
  const raw = localStorage.getItem(STORAGE_KEYS.runtime);
  if (!raw) return;

  /** @type {unknown} */
  let parsedUnknown;
  try {
    parsedUnknown = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEYS.runtime);
    return;
  }

  if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
    localStorage.removeItem(STORAGE_KEYS.runtime);
    return;
  }
  /** @type {Record<string, unknown>} */
  const parsed = /** @type {Record<string, unknown>} */ (parsedUnknown);

  /** @type {unknown} */
  const queueValue = parsed.queue;
  /** @type {unknown[]} */
  const queueItems = Array.isArray(queueValue) ? queueValue : [];
  /** @type {ShuffleItem[]} */
  const restoredQueue = queueItems.filter(
    /**
     * @param {unknown} item
     * @returns {item is ShuffleItem}
     */
    (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      /** @type {Record<string, unknown>} */
      const runtimeItem = /** @type {Record<string, unknown>} */ (item);
      return (
        (runtimeItem.type === 'album' || runtimeItem.type === 'playlist') &&
        typeof runtimeItem.uri === 'string' &&
        typeof runtimeItem.title === 'string'
      );
    },
  );

  const indexValue = parsed.index;
  const restoredIndex =
    typeof indexValue === 'number' && Number.isInteger(indexValue) && indexValue >= 0
      ? indexValue
      : 0;
  const restoredCurrentUri = typeof parsed.currentUri === 'string' ? parsed.currentUri : null;
  const restoredObserved = parsed.observedCurrentContext === true;
  const activationStateValue = parsed.activationState;
  let restoredActivationState = /** @type {'inactive' | 'active' | 'detached'} */ ('inactive');
  if (
    activationStateValue === 'active' ||
    activationStateValue === 'detached' ||
    activationStateValue === 'inactive'
  ) {
    restoredActivationState = activationStateValue;
  }
  if (restoredQueue.length === 0) {
    restoredActivationState = 'inactive';
  }

  session.queue = restoredQueue;
  session.index = Math.min(restoredIndex, Math.max(0, restoredQueue.length - 1));
  session.currentUri = restoredCurrentUri;
  session.observedCurrentContext = restoredObserved;
  session.activationState = restoredActivationState;

  if (session.activationState === 'inactive') {
    clearRuntimeState();
    return;
  }

  const current = session.queue[session.index];
  setPlaybackStatus(formatNowPlayingStatus(current));
  renderSessionQueue();
  renderPlaybackControls();
  if (session.activationState === 'active') {
    playerMonitor.start();
  }
}

function persistRuntimeState() {
  localStorage.setItem(
    STORAGE_KEYS.runtime,
    JSON.stringify({
      active: session.activationState === 'active',
      activationState: session.activationState,
      queue: session.queue,
      index: session.index,
      currentUri: session.currentUri,
      observedCurrentContext: session.observedCurrentContext,
    }),
  );
}

function clearRuntimeState() {
  localStorage.removeItem(STORAGE_KEYS.runtime);
}

function renderSessionQueue() {
  sessionPanel.renderQueue(session);
}

/**
 * @param {ShuffleItem} item
 * @returns {string}
 */
function formatNowPlayingStatus(item) {
  return `Now playing ${item.type} ${session.index + 1} of ${session.queue.length}: ${item.title}`;
}

/**
 * @template T
 * @param {() => T | Promise<T>} task
 * @param {ErrorReportOptions} reportErrorOptions
 * @returns {Promise<T | undefined>}
 */
async function runWithReportedError(task, reportErrorOptions) {
  try {
    return await task();
  } catch (error) {
    reportError(error, reportErrorOptions);
    return undefined;
  }
}

/** @param {unknown} error */
function reportMonitorError(error) {
  if (error instanceof PlayerMonitorStatusError) {
    reportError(error, {
      context: 'monitor',
      fallbackMessage: spotifyStatusMessage(error.status, 'Could not check playback state.'),
      playbackStatusMessage: 'Unable to check playback state right now.',
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
  const message = errorMessageForUser(error, options.fallbackMessage);
  console.error(`[${options.context}]`, error);
  if (options.authStatusMessage) {
    setAuthStatus(options.authStatusMessage);
  }
  if (options.playbackStatusMessage) {
    setPlaybackStatus(options.playbackStatusMessage);
  }

  const toastKey = options.toastKey ?? `${options.context}:${message}`;
  if (options.toastMode === 'cooldown') {
    const lastAt = errorToastLastShownAt.get(toastKey) ?? 0;
    if (Date.now() - lastAt >= ERROR_TOAST_COOLDOWN_MS) {
      errorToastLastShownAt.set(toastKey, Date.now());
      showToast(message, 'error');
    }
    return;
  }

  showToast(message, 'error');
}

/**
 * @typedef {{
 *   context: string;
 *   fallbackMessage: string;
 *   authStatusMessage?: string;
 *   playbackStatusMessage?: string;
 *   toastMode?: 'always' | 'cooldown';
 *   toastKey?: string;
 * }} ErrorReportOptions
 */

/**
 * @param {unknown} error
 * @param {string} fallbackMessage
 */
function errorMessageForUser(error, fallbackMessage) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw && (/Failed to fetch/i.test(raw) || /NetworkError/i.test(raw))) {
    return 'Network error while contacting Spotify. Please try again.';
  }
  return fallbackMessage;
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

/** @param {number} length */
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  for (const value of randomValues) {
    text += chars[value % chars.length];
  }
  return text;
}

/** @param {string} verifier */
async function codeChallengeFromVerifier(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);

  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
