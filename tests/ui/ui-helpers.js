/** @typedef {import('@playwright/test').Request} Request */

export const CONNECTED_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

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

/** @param {Request} request */
export function isSpotifyAccountTokenRequest(request) {
  return request.method() === 'POST' && request.url() === 'https://accounts.spotify.com/api/token';
}

/**
 * @param {Request} request
 * @param {string} playlistId
 * @param {number} offset
 */
export function isPlaylistItemsRequest(request, playlistId, offset) {
  const url = new URL(request.url());
  return (
    request.method() === 'GET'
    && url.pathname === `/v1/playlists/${playlistId}/items`
    && url.searchParams.get('limit') === '50'
    && url.searchParams.get('offset') === String(offset)
    && url.searchParams.get('additional_types') === 'track'
    && url.searchParams.get('market') === 'from_token'
  );
}
