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

/** @type {{
 * refreshSpotifyAccessToken?: () => Promise<string | null>;
 * clearAuth?: () => void;
 * transitionToDetached?: (message: string) => void;
 * setAuthStatus?: (message: string) => void;
 * spotifyStatusMessage?: (status: number, fallbackMessage: string) => string;
 * }} */
const deps = {};

/**
 * @param {typeof deps} nextDeps
 */
export function configureSpotifyApi(nextDeps) {
  Object.assign(deps, nextDeps);
}

/**
 * @param {string} path
 * @param {RequestInit} init
 * @param {string} token
 * @param {boolean} throwOnError
 */
export async function spotifyApi(path, init, token, throwOnError = true) {
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

  let response = await makeRequest(token);
  if (response.status === 401) {
    const refreshedToken = await deps.refreshSpotifyAccessToken?.();
    if (refreshedToken) {
      response = await makeRequest(refreshedToken);
    }

    if (response.status === 401) {
      deps.clearAuth?.();
      deps.transitionToDetached?.('Spotify session expired. Please reconnect.');
      deps.setAuthStatus?.('Spotify session expired. Please reconnect.');
    }
  }

  if (!response.ok && throwOnError) {
    const body = await response.text();
    const fallbackMessage = `Spotify API request failed for ${path}.`;
    const message = deps.spotifyStatusMessage
      ? deps.spotifyStatusMessage(response.status, fallbackMessage)
      : fallbackMessage;
    throw new SpotifyApiHttpError(response.status, body ? `${message} ${body}` : message);
  }

  return response;
}
