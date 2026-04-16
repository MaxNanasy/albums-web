/** @typedef {import('./spotify-api.js').SpotifyApi} SpotifyApi */

/** @typedef {'album' | 'playlist'} ItemType */

/**
 * @typedef {{
 *   ok: true;
 *   status: number;
 *   contextUri: string | null;
 * }} PlayerStateSuccess
 */

/**
 * @typedef {{
 *   ok: false;
 *   status: number;
 *   errorText: string;
 * }} PlayerStateFailure
 */

/** @typedef {PlayerStateSuccess | PlayerStateFailure} PlayerStateResponse */

/**
 * @typedef {{
 *   uri: string;
 *   title: string;
 * }} PlaylistAlbum
 */

/**
 * @typedef {{
 *   ok: true;
 *   status: number;
 *   albums: PlaylistAlbum[];
 *   hasNext: boolean;
 * }} PlaylistAlbumsPageSuccess
 */

/**
 * @typedef {{
 *   ok: false;
 *   status: number;
 *   errorText: string;
 * }} PlaylistAlbumsPageFailure
 */

/** @typedef {PlaylistAlbumsPageSuccess | PlaylistAlbumsPageFailure} PlaylistAlbumsPageResponse */

export class SpotifyAppApi {
  /** @type {SpotifyApi} */
  #spotifyApi;

  /** @param {SpotifyApi} spotifyApi */
  constructor(spotifyApi) {
    this.#spotifyApi = spotifyApi;
  }

  /** @returns {Promise<PlayerStateResponse>} */
  async getPlayerState() {
    const response = await this.#spotifyApi.request('/me/player', { method: 'GET' }, false);
    if (response.status === 204) {
      return { ok: true, status: response.status, contextUri: null };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, errorText: await response.text() };
    }

    const data = /** @type {{context?: {uri?: string} | null}} */ (await response.json());
    return { ok: true, status: response.status, contextUri: data.context?.uri ?? null };
  }

  /** @returns {Promise<void>} */
  async disableShuffle() {
    await this.#spotifyApi.request('/me/player/shuffle?state=false', { method: 'PUT' });
  }

  /** @returns {Promise<void>} */
  async disableRepeat() {
    await this.#spotifyApi.request('/me/player/repeat?state=off', { method: 'PUT' });
  }

  /** @param {string} contextUri */
  async playContext(contextUri) {
    await this.#spotifyApi.request('/me/player/play', {
      method: 'PUT',
      body: JSON.stringify({
        context_uri: contextUri,
        offset: { position: 0 },
        position_ms: 0,
      }),
    });
  }

  /**
   * @param {string} playlistId
   * @param {number} offset
   * @param {number} limit
   * @returns {Promise<PlaylistAlbumsPageResponse>}
   */
  async getPlaylistAlbumsPage(playlistId, offset, limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      additional_types: 'track',
      market: 'from_token',
    });

    const response = await this.#spotifyApi.request(
      `/playlists/${playlistId}/items?${params.toString()}`,
      { method: 'GET' },
      false,
    );

    if (!response.ok) {
      return { ok: false, status: response.status, errorText: await response.text() };
    }

    const data = /** @type {{items?: Array<{item?: {album?: {uri?: string; id?: string; name?: string} | null} | null}>; next?: string | null}} */ (
      await response.json()
    );

    /** @type {PlaylistAlbum[]} */
    const albums = [];
    for (const entry of data.items ?? []) {
      const album = entry?.item?.album;
      const albumUri = album?.uri ?? (album?.id ? `spotify:album:${album.id}` : '');
      if (!albumUri) continue;
      albums.push({ uri: albumUri, title: (album?.name ?? '').trim() });
    }

    return {
      ok: true,
      status: response.status,
      albums,
      hasNext: Boolean(data.next),
    };
  }

  /**
   * @param {ItemType} itemType
   * @param {string} id
   * @returns {Promise<string | null>}
   */
  async getItemTitle(itemType, id) {
    const path = itemType === 'album' ? `/albums/${id}` : `/playlists/${id}`;
    const response = await this.#spotifyApi.request(path, { method: 'GET' }, false);
    if (!response.ok) return null;

    const data = /** @type {{name?: string}} */ (await response.json());
    const title = (data.name ?? '').trim();
    return title || null;
  }
}
