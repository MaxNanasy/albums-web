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
  /** @param {AuthFlowDeps} deps */
  constructor(deps) {
    this.#deps = deps;
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

    if (error) {
      this.#deps.setAuthStatus(`Spotify authorization error: ${error}`);
      url.searchParams.delete('error');
      historyRef.replaceState({}, '', url.toString());
      return;
    }

    if (!code) return;

    const verifier = localStorage.getItem(this.#deps.storageKeys.verifier);

    if (!verifier) {
      this.#deps.setAuthStatus('Missing PKCE verifier. Try connecting again.');
      return;
    }

    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: locationRef.origin + locationRef.pathname,
      client_id: this.#deps.spotifyAppId,
      code_verifier: verifier,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      this.#deps.setAuthStatus('Failed to exchange Spotify code for token.');
      return;
    }

    /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */
    const data = /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */ (await response.json());
    localStorage.setItem(this.#deps.storageKeys.token, data.access_token);
    if (data.refresh_token) {
      localStorage.setItem(this.#deps.storageKeys.refreshToken, data.refresh_token);
    }
    localStorage.setItem(this.#deps.storageKeys.tokenExpiry, String(Date.now() + data.expires_in * 1000));
    localStorage.setItem(this.#deps.storageKeys.tokenScope, data.scope ?? '');
    localStorage.removeItem(this.#deps.storageKeys.verifier);

    url.searchParams.delete('code');
    historyRef.replaceState({}, '', url.toString());
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

  async refreshSpotifyAccessToken() {
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
      this.#deps.reportError(error, {
        context: 'auth',
        fallbackMessage: 'Unable to refresh Spotify session.',
        authStatusMessage: 'Network issue refreshing Spotify session. Please reconnect if this continues.',
        toastMode: 'cooldown',
        toastKey: 'refresh-token-network',
      });
      return null;
    }

    if (!response.ok) return null;

    /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */
    const data = /** @type {{access_token: string; refresh_token?: string; expires_in: number; scope?: string}} */ (await response.json());
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
