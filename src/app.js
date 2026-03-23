// @ts-check

/**
 * Spotify Album & Playlist Shuffler
 *
 * Static app, no build step required. Uses JSDoc + TypeScript checkJs.
 */

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const STORAGE_KEYS = {
  clientId: 'spotify_shuffler_client_id',
  token: 'spotify_shuffler_token',
  tokenExpiry: 'spotify_shuffler_token_expiry',
  selectedContexts: 'spotify_shuffler_selected_contexts',
  pkceVerifier: 'spotify_shuffler_pkce_verifier'
};

const SCOPES = [
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-modify-playback-state'
].join(' ');

/** @typedef {{ id: string; name: string; type: 'album' | 'playlist'; uri: string; trackCount: number; imageUrl?: string }} MediaContext */
/** @typedef {{ access_token: string; token_type: string; expires_in: number; refresh_token?: string; scope: string }} TokenResponse */

const els = {
  clientId: /** @type {HTMLInputElement} */ (document.querySelector('#client-id')),
  connectBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#connect-btn')),
  disconnectBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#disconnect-btn')),
  authStatus: /** @type {HTMLParagraphElement} */ (document.querySelector('#auth-status')),
  librarySection: /** @type {HTMLElement} */ (document.querySelector('#library-section')),
  refreshLibraryBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#refresh-library-btn')),
  selectAllBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#select-all-btn')),
  clearSelectionBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#clear-selection-btn')),
  libraryStatus: /** @type {HTMLParagraphElement} */ (document.querySelector('#library-status')),
  contextList: /** @type {HTMLUListElement} */ (document.querySelector('#context-list')),
  playSection: /** @type {HTMLElement} */ (document.querySelector('#play-section')),
  startBtn: /** @type {HTMLButtonElement} */ (document.querySelector('#start-btn')),
  playStatus: /** @type {HTMLParagraphElement} */ (document.querySelector('#play-status'))
};

/** @type {string | null} */
let accessToken = null;
/** @type {number | null} */
let tokenExpiry = null;
/** @type {MediaContext[]} */
let libraryItems = [];
/** @type {Set<string>} */
let selectedContextIds = new Set();
/** @type {string | null} */
let deviceId = null;

init().catch((error) => {
  console.error(error);
  setAuthStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
});

async function init() {
  hydrateFromStorage();
  attachEventHandlers();
  await restoreOrExchangeToken();
  if (accessToken) {
    await ensureWebPlaybackDevice();
    await loadLibraryAndRender();
  }
}

function hydrateFromStorage() {
  const savedClientId = localStorage.getItem(STORAGE_KEYS.clientId);
  if (savedClientId) {
    els.clientId.value = savedClientId;
  }

  const savedToken = localStorage.getItem(STORAGE_KEYS.token);
  const savedExpiry = localStorage.getItem(STORAGE_KEYS.tokenExpiry);
  if (savedToken && savedExpiry) {
    accessToken = savedToken;
    tokenExpiry = Number(savedExpiry);
  }

  const savedSelection = localStorage.getItem(STORAGE_KEYS.selectedContexts);
  if (savedSelection) {
    try {
      const parsed = JSON.parse(savedSelection);
      if (Array.isArray(parsed)) {
        selectedContextIds = new Set(parsed.filter((id) => typeof id === 'string'));
      }
    } catch {
      selectedContextIds = new Set();
    }
  }
}

function attachEventHandlers() {
  els.connectBtn.addEventListener('click', () => {
    void beginLogin();
  });

  els.disconnectBtn.addEventListener('click', () => {
    clearSession();
    setAuthStatus('Disconnected');
    els.librarySection.hidden = true;
    els.playSection.hidden = true;
    els.contextList.replaceChildren();
  });

  els.refreshLibraryBtn.addEventListener('click', () => {
    void loadLibraryAndRender();
  });

  els.selectAllBtn.addEventListener('click', () => {
    selectedContextIds = new Set(libraryItems.map((item) => item.id));
    persistSelection();
    renderLibrary();
  });

  els.clearSelectionBtn.addEventListener('click', () => {
    selectedContextIds.clear();
    persistSelection();
    renderLibrary();
  });

  els.startBtn.addEventListener('click', () => {
    void startShuffledPlayback();
  });
}

async function restoreOrExchangeToken() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  if (code) {
    const clientId = getClientIdOrThrow();
    const verifier = localStorage.getItem(STORAGE_KEYS.pkceVerifier);
    if (!verifier) {
      throw new Error('Missing PKCE verifier in localStorage. Please connect again.');
    }

    const token = await exchangeCodeForToken(clientId, code, verifier);
    persistToken(token);

    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());
    setAuthStatus('Connected');
    return;
  }

  if (accessToken && tokenExpiry && tokenExpiry > Date.now()) {
    setAuthStatus('Connected (restored session)');
    return;
  }

  clearSession();
  setAuthStatus('Not connected');
}

async function beginLogin() {
  const clientId = getClientIdOrThrow();
  localStorage.setItem(STORAGE_KEYS.clientId, clientId);

  const verifier = generateCodeVerifier();
  localStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);

  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = window.location.origin + window.location.pathname;

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', SCOPES);

  window.location.assign(authUrl.toString());
}

function getClientIdOrThrow() {
  const clientId = els.clientId.value.trim();
  if (!clientId) {
    throw new Error('Enter your Spotify Client ID first.');
  }
  return clientId;
}

/** @param {string} value */
function setAuthStatus(value) {
  els.authStatus.textContent = value;
}

/** @param {TokenResponse} token */
function persistToken(token) {
  accessToken = token.access_token;
  tokenExpiry = Date.now() + token.expires_in * 1000;
  localStorage.setItem(STORAGE_KEYS.token, accessToken);
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, String(tokenExpiry));
}

function clearSession() {
  accessToken = null;
  tokenExpiry = null;
  deviceId = null;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.tokenExpiry);
  localStorage.removeItem(STORAGE_KEYS.pkceVerifier);
}

/** @param {string} clientId @param {string} code @param {string} verifier */
async function exchangeCodeForToken(clientId, code, verifier) {
  const redirectUri = window.location.origin + window.location.pathname;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return /** @type {Promise<TokenResponse>} */ (response.json());
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** @param {string} verifier */
async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** @param {Uint8Array} bytes */
function base64UrlEncode(bytes) {
  const value = btoa(String.fromCharCode(...bytes));
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function ensureWebPlaybackDevice() {
  const appWindow = /** @type {Window & { Spotify?: { Player: new (options: { name: string; getOAuthToken: (cb: (token: string) => void) => void }) => any }; onSpotifyWebPlaybackSDKReady?: () => void }} */ (window);

  if (!('Spotify' in appWindow)) {
    setAuthStatus('Connected (Spotify SDK still loading…)');
  }

  const sdkReady = new Promise((resolve) => {
    if (appWindow.Spotify) {
      resolve(undefined);
      return;
    }
    appWindow.onSpotifyWebPlaybackSDKReady = () => resolve(undefined);
  });

  await sdkReady;

  if (!appWindow.Spotify) {
    throw new Error('Spotify Web Playback SDK failed to load.');
  }

  const player = new appWindow.Spotify.Player({
    name: 'Album Playlist Shuffler Web Player',
    getOAuthToken: (cb) => cb(accessToken || '')
  });

  player.addListener('ready', ({ device_id: id }) => {
    deviceId = id;
    setAuthStatus('Connected and player ready');
  });

  player.addListener('not_ready', () => {
    deviceId = null;
  });

  player.addListener('initialization_error', ({ message }) => {
    console.warn('Spotify SDK init error:', message);
  });
  player.addListener('authentication_error', ({ message }) => {
    console.warn('Spotify SDK auth error:', message);
  });
  player.addListener('account_error', ({ message }) => {
    console.warn('Spotify SDK account error:', message);
  });

  await player.connect();
}

async function loadLibraryAndRender() {
  if (!accessToken) {
    throw new Error('Not connected.');
  }

  els.librarySection.hidden = false;
  els.playSection.hidden = false;
  els.libraryStatus.textContent = 'Loading playlists and saved albums…';

  const [playlists, albums] = await Promise.all([fetchAllPlaylists(), fetchAllSavedAlbums()]);
  libraryItems = [...playlists, ...albums].sort((a, b) => a.name.localeCompare(b.name));

  // Prune selections that no longer exist.
  selectedContextIds = new Set([...selectedContextIds].filter((id) => libraryItems.some((item) => item.id === id)));
  persistSelection();

  renderLibrary();
  els.libraryStatus.textContent = `Loaded ${libraryItems.length} items.`;
}

function renderLibrary() {
  els.contextList.replaceChildren();

  for (const item of libraryItems) {
    const li = document.createElement('li');
    li.className = 'context-item';

    const label = document.createElement('label');
    label.className = 'context-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedContextIds.has(item.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedContextIds.add(item.id);
      } else {
        selectedContextIds.delete(item.id);
      }
      persistSelection();
    });

    const textWrap = document.createElement('span');
    textWrap.innerHTML = `<strong>${escapeHtml(item.name)}</strong> <small>${item.type} • ${item.trackCount} tracks</small>`;

    label.append(checkbox, textWrap);
    li.append(label);
    els.contextList.append(li);
  }
}

function persistSelection() {
  localStorage.setItem(STORAGE_KEYS.selectedContexts, JSON.stringify([...selectedContextIds]));
}

async function fetchAllPlaylists() {
  /** @type {MediaContext[]} */
  const results = [];
  let url = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;

  while (url) {
    const page = await spotifyFetch(url);
    for (const item of page.items || []) {
      if (!item?.id || !item?.uri) continue;
      results.push({
        id: `playlist:${item.id}`,
        name: item.name || 'Untitled playlist',
        type: 'playlist',
        uri: item.uri,
        trackCount: item.tracks?.total || 0,
        imageUrl: item.images?.[0]?.url
      });
    }
    url = page.next || '';
  }

  return results;
}

async function fetchAllSavedAlbums() {
  /** @type {MediaContext[]} */
  const results = [];
  let url = `${SPOTIFY_API_BASE}/me/albums?limit=50`;

  while (url) {
    const page = await spotifyFetch(url);
    for (const wrapper of page.items || []) {
      const album = wrapper?.album;
      if (!album?.id || !album?.uri) continue;
      results.push({
        id: `album:${album.id}`,
        name: album.name || 'Untitled album',
        type: 'album',
        uri: album.uri,
        trackCount: album.total_tracks || 0,
        imageUrl: album.images?.[0]?.url
      });
    }
    url = page.next || '';
  }

  return results;
}

async function startShuffledPlayback() {
  if (!accessToken) {
    throw new Error('Not connected.');
  }

  const selected = libraryItems.filter((item) => selectedContextIds.has(item.id));
  if (!selected.length) {
    els.playStatus.textContent = 'Select at least one album or playlist.';
    return;
  }

  const shuffledContexts = fisherYates([...selected]);
  els.playStatus.textContent = `Preparing ${shuffledContexts.length} selected contexts…`;

  /** @type {string[]} */
  const queueUris = [];

  for (const context of shuffledContexts) {
    els.playStatus.textContent = `Loading tracks for ${context.name}…`;
    const tracks = context.type === 'album'
      ? await fetchAlbumTrackUris(context.uri)
      : await fetchPlaylistTrackUris(context.uri);
    queueUris.push(...tracks);
  }

  if (!queueUris.length) {
    els.playStatus.textContent = 'No playable tracks were found.';
    return;
  }

  els.playStatus.textContent = `Starting playback (${queueUris.length} tracks)…`;

  // Best effort: make playback predictable.
  await spotifyFetch(`${SPOTIFY_API_BASE}/me/player/repeat?state=off`, { method: 'PUT' });
  await spotifyFetch(`${SPOTIFY_API_BASE}/me/player/shuffle?state=false`, { method: 'PUT' });

  if (deviceId) {
    await spotifyFetch(`${SPOTIFY_API_BASE}/me/player`, {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });
  }

  const deviceParam = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyFetch(`${SPOTIFY_API_BASE}/me/player/play${deviceParam}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [queueUris[0]] })
  });

  for (let i = 1; i < queueUris.length; i += 1) {
    await spotifyFetch(`${SPOTIFY_API_BASE}/me/player/queue?uri=${encodeURIComponent(queueUris[i])}${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ''}`, {
      method: 'POST'
    });
  }

  els.playStatus.textContent = `Now playing shuffled context order. Enqueued ${queueUris.length} tracks.`;
}

/** @param {string} albumUri */
async function fetchAlbumTrackUris(albumUri) {
  const albumId = albumUri.split(':')[2];
  /** @type {string[]} */
  const uris = [];
  let url = `${SPOTIFY_API_BASE}/albums/${albumId}/tracks?limit=50`;

  while (url) {
    const page = await spotifyFetch(url);
    for (const track of page.items || []) {
      if (track?.uri) uris.push(track.uri);
    }
    url = page.next || '';
  }

  return uris;
}

/** @param {string} playlistUri */
async function fetchPlaylistTrackUris(playlistUri) {
  const playlistId = playlistUri.split(':')[2];
  /** @type {string[]} */
  const uris = [];
  let url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100&fields=items(track(uri,is_local)),next`;

  while (url) {
    const page = await spotifyFetch(url);
    for (const row of page.items || []) {
      const track = row?.track;
      if (track?.uri && !track?.is_local) uris.push(track.uri);
    }
    url = page.next || '';
  }

  return uris;
}

/**
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function fisherYates(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** @param {string} input */
function escapeHtml(input) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function spotifyFetch(url, init = {}) {
  if (!accessToken) {
    throw new Error('Missing access token.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 204) {
    return {};
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API ${response.status}: ${text}`);
  }

  return response.json();
}

