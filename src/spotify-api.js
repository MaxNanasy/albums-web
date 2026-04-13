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
 * @typedef {{
 * getAccessToken: () => Promise<string | null>;
 * refreshSpotifyAccessToken: () => Promise<string | null>;
 * handleAuthExpired: () => void;
 * }} SpotifyApiDeps
 */

export class SpotifyApi {
  /** @type {SpotifyApiDeps} */
  deps;

  /**
   * @param {SpotifyApiDeps} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {string} path
   * @param {RequestInit} init
   * @param {boolean} throwOnError
   */
  async request(path, init, throwOnError = true) {
    /** @param {number} status */
    const statusMessage = (status) =>
      spotifyStatusMessage(status, `Spotify API request failed for ${path}.`);

    /** @param {string} bearerToken */
    const makeRequest = (bearerToken) =>
      fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });

    const token = await this.deps.getAccessToken();
    if (!token) {
      this.deps.handleAuthExpired();
      throw new SpotifyApiHttpError(401, statusMessage(401));
    }

    let response = await makeRequest(token);
    if (response.status === 401) {
      const refreshedToken = await this.deps.refreshSpotifyAccessToken();
      if (refreshedToken) {
        response = await makeRequest(refreshedToken);
      }

      if (response.status === 401) {
        this.deps.handleAuthExpired();
      }
    }

    if (!response.ok && throwOnError) {
      const body = await response.text();
      const message = statusMessage(response.status);
      throw new SpotifyApiHttpError(response.status, body ? `${message} ${body}` : message);
    }

    return response;
  }
}
