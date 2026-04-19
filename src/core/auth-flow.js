import { spotifyStatusMessage } from '../spotify-status-message.js';
import { userFacingErrorMessage } from './error-reporter.js';

/**
 * @typedef AuthFlowDeps
 * @property {string[]} scopes
 * @property {string} spotifyAppId
 * @property {{ verifier: string; token: string; refreshToken: string; tokenExpiry: string; tokenScope: string; }} storageKeys
 * @property {(error: unknown, options: {context: string; fallbackMessage: string; authStatusMessage?: string; toastMode?: 'always'|'cooldown'; toastKey?: string;}) => void} reportError
 * @property {(message: string) => void} setAuthStatus
 */

export class AuthFlow {
  /** @type {AuthFlowDeps} */
  #deps;
  /** @type {string | null} */
  #pendingRefreshFailureStatus;
  /** @param {AuthFlowDeps} deps */
  constructor(deps) {
    this.#deps = deps;
    this.#pendingRefreshFailureStatus = null;
  }

  async startLogin() {
    const locationRef = /** @type {{origin: string; pathname: string; href: string}} */ (
      /** @type {unknown} */ (Reflect.get(globalThis, 'location'))
    );
    const verifier = randomString(64);
    const challenge = await codeChallengeFromVerifier(verifier);
    localStorage.setItem(this.#deps.storageKeys.verifier, verifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.#deps.spotifyAppId,
      scope: this.#deps.scopes.join(' '),
      redirect_uri: locationRef.origin + locationRef.pathname,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      show_dialog: 'true',
    });

    locationRef.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async handleAuthRedirect() {
    const locationRef = /** @type {{origin: string; pathname: string; href: string}} */ (
      /** @type {unknown} */ (Reflect.get(globalThis, 'location'))
    );
    const historyRef = /** @type {{replaceState: (data: unknown, unused: string, url: string) => void}} */ (
      /** @type {unknown} */ (Reflect.get(globalThis, 'history'))
    );
    const url = new URL(locationRef.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const clearHandledRedirectUrl = () => {
      url.searchParams.delete('code');
      url.searchParams.delete('error');
      historyRef.replaceState({}, '', url.toString());
    };

    if (error) {
      this.#deps.setAuthStatus(`Spotify authorization error: ${error}`);
      localStorage.removeItem(this.#deps.storageKeys.verifier);
      clearHandledRedirectUrl();
      return;
    }

    if (!code) return;

    const verifier = localStorage.getItem(this.#deps.storageKeys.verifier);

    if (!verifier) {
      this.#deps.setAuthStatus('Missing PKCE verifier. Try connecting again.');
      clearHandledRedirectUrl();
      return;
    }

    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: locationRef.origin + locationRef.pathname,
      client_id: this.#deps.spotifyAppId,
      code_verifier: verifier,
    });

    /** @type {Response} */
    let response;
    try {
      response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
    } catch (error) {
      localStorage.removeItem(this.#deps.storageKeys.verifier);
      this.#deps.setAuthStatus(
        tokenExchangeFailureStatus(
          userFacingErrorMessage(error, 'Network error while contacting Spotify. Please try again.'),
        ),
      );
      clearHandledRedirectUrl();
      return;
    }

    localStorage.removeItem(this.#deps.storageKeys.verifier);

    if (!response.ok) {
      this.#deps.setAuthStatus(
        tokenExchangeFailureStatus(
          spotifyStatusMessage(response.status, 'Network error while contacting Spotify. Please try again.'),
        ),
      );
      clearHandledRedirectUrl();
      return;
    }

    /** @type {{access_token?: string; refresh_token?: string; expires_in?: number; scope?: string}} */
    let data;
    try {
      data = /** @type {{access_token?: string; refresh_token?: string; expires_in?: number; scope?: string}} */ (await response.json());
    } catch {
      this.#deps.setAuthStatus(tokenExchangeFailureStatus('invalid token response'));
      clearHandledRedirectUrl();
      return;
    }
    if (!(
      typeof data.access_token === 'string' &&
      typeof data.expires_in === 'number' &&
      Number.isFinite(data.expires_in)
    )) {
      this.#deps.setAuthStatus(tokenExchangeFailureStatus('invalid token response'));
      clearHandledRedirectUrl();
      return;
    }
    localStorage.setItem(this.#deps.storageKeys.token, data.access_token);
    if (data.refresh_token) {
      localStorage.setItem(this.#deps.storageKeys.refreshToken, data.refresh_token);
    }
    localStorage.setItem(this.#deps.storageKeys.tokenExpiry, String(Date.now() + data.expires_in * 1000));
    localStorage.setItem(this.#deps.storageKeys.tokenScope, data.scope ?? '');

    clearHandledRedirectUrl();
  }

  clearAuth() {
    localStorage.removeItem(this.#deps.storageKeys.token);
    localStorage.removeItem(this.#deps.storageKeys.refreshToken);
    localStorage.removeItem(this.#deps.storageKeys.tokenExpiry);
    localStorage.removeItem(this.#deps.storageKeys.tokenScope);
    localStorage.removeItem(this.#deps.storageKeys.verifier);
  }

  getToken() {
    const token = localStorage.getItem(this.#deps.storageKeys.token);
    const expiryMs = Number(localStorage.getItem(this.#deps.storageKeys.tokenExpiry) ?? 0);
    if (!token || Date.now() >= expiryMs) {
      return null;
    }
    return token;
  }

  getGrantedScopes() {
    const scopeText = localStorage.getItem(this.#deps.storageKeys.tokenScope) ?? '';
    return new Set(scopeText.split(/\s+/).filter(Boolean));
  }

  consumePendingRefreshFailureStatus() {
    const pendingStatus = this.#pendingRefreshFailureStatus;
    this.#pendingRefreshFailureStatus = null;
    return pendingStatus;
  }

  async refreshSpotifyAccessToken() {
    this.#pendingRefreshFailureStatus = null;
    const refreshToken = localStorage.getItem(this.#deps.storageKeys.refreshToken);
    if (!refreshToken) return null;

    const formData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.#deps.spotifyAppId,
    });

    /** @type {Response} */
    let response;
    try {
      response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
    } catch (error) {
      this.#pendingRefreshFailureStatus = 'Network issue refreshing Spotify session. Please reconnect if this continues.';
      this.#deps.reportError(error, {
        context: 'auth',
        fallbackMessage: 'Unable to restore Spotify session.',
        authStatusMessage: 'Network issue refreshing Spotify session. Please reconnect if this continues.',
        toastMode: 'cooldown',
        toastKey: 'refresh-token-network',
      });
      return null;
    }

    if (!response.ok) {
      this.#pendingRefreshFailureStatus = 'Unable to restore Spotify session. Please reconnect.';
      return null;
    }

    /** @type {{access_token?: string; refresh_token?: string; expires_in?: number; scope?: string}} */
    let data;
    try {
      data = /** @type {{access_token?: string; refresh_token?: string; expires_in?: number; scope?: string}} */ (await response.json());
    } catch {
      this.#pendingRefreshFailureStatus = 'Unable to restore Spotify session. Please reconnect.';
      return null;
    }
    if (!(
      typeof data.access_token === 'string' &&
      typeof data.expires_in === 'number' &&
      Number.isFinite(data.expires_in))
    ) {
      this.#pendingRefreshFailureStatus = 'Unable to restore Spotify session. Please reconnect.';
      return null;
    }
    localStorage.setItem(this.#deps.storageKeys.token, data.access_token);
    localStorage.setItem(this.#deps.storageKeys.tokenExpiry, String(Date.now() + data.expires_in * 1000));
    if (typeof data.scope === 'string') {
      localStorage.setItem(this.#deps.storageKeys.tokenScope, data.scope);
    }
    if (data.refresh_token) {
      localStorage.setItem(this.#deps.storageKeys.refreshToken, data.refresh_token);
    }
    return data.access_token;
  }

  async getUsableAccessToken() {
    const token = this.getToken();
    if (token) return token;

    const hasRefreshToken = Boolean(localStorage.getItem(this.#deps.storageKeys.refreshToken));
    if (!hasRefreshToken) return null;

    return this.refreshSpotifyAccessToken();
  }
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


/** @param {string} detail */
function tokenExchangeFailureStatus(detail) {
  return `Spotify token exchange failed: ${ensureTrailingPeriod(detail)}`;
}

/** @param {string} message */
function ensureTrailingPeriod(message) {
  const trimmed = message.trim().replace(/[.!?]+$/u, '');
  return `${trimmed}.`;
}
