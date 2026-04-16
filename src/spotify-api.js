import { spotifyStatusMessage } from './spotify-status-message.js';

export class SpotifyApiHttpError extends Error {
  /** @type {string} */
  name;
  /** @type {number} */
  status;

  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'SpotifyApiHttpError';
    this.status = status;
  }
}

/**
 * @typedef SpotifyApiDeps
 * @property {() => Promise<string | null>} getAccessToken
 * @property {() => Promise<string | null>} refreshSpotifyAccessToken
 * @property {() => void} handleAuthExpired
 */

export class SpotifyApi {
  /** @type {SpotifyApiDeps} */
  #deps;

  /**
   * @param {SpotifyApiDeps} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  /**
   * @param {string} path
   * @param {RequestInit} requestInit
   * @param {boolean} throwOnError
   */
  async request(path, requestInit, throwOnError = true) {
    /** @param {string} bearerToken */
    const makeRequest = (bearerToken) =>
      fetch(`https://api.spotify.com/v1${path}`, {
        ...requestInit,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
          ...(requestInit.headers ?? {}),
        },
      });

    const token = await this.#deps.getAccessToken();
    if (!token) {
      this.#deps.handleAuthExpired();
      throw new SpotifyApiHttpError(401, spotifyStatusMessage(401, `Spotify API request failed for ${path}.`));
    }

    let response = await makeRequest(token);
    if (response.status === 401) {
      const refreshedToken = await this.#deps.refreshSpotifyAccessToken();
      if (refreshedToken) {
        response = await makeRequest(refreshedToken);
      }

      if (response.status === 401) {
        this.#deps.handleAuthExpired();
      }
    }

    if (!response.ok && throwOnError) {
      const body = await response.text();
      const message = spotifyStatusMessage(response.status, `Spotify API request failed for ${path}.`);
      throw new SpotifyApiHttpError(response.status, body ? `${message} ${body}` : message);
    }

    return response;
  }
}
