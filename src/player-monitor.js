import { spotifyStatusMessage } from './spotify-status-message.js';

/** @typedef {import('./spotify-app-api.js').SpotifyAppApi} SpotifyAppApi */

/**
 * @typedef MonitorSession
 * @property {'inactive' | 'active' | 'detached'} activationState
 * @property {string | null} currentUri
 * @property {boolean} observedCurrentContext
 */

/**
 * @typedef PlayerMonitorDeps
 * @property {() => MonitorSession} getSession
 * @property {() => Promise<string | null>} getUsableAccessToken
 * @property {SpotifyAppApi} spotifyAppApi
 * @property {() => void} persistRuntimeState
 * @property {(message: string) => void} transitionToDetached
 * @property {() => Promise<void>} goToNextItem
 * @property {(error: unknown) => void} reportError
 * @property {(status: number) => boolean} isUnrecoverableSpotifyStatus
 */

export class PlayerMonitorStatusError extends Error {
  /** @type {number} */
  status;

  /**
   * @param {number} status
   * @param {string} errorText
   */
  constructor(status, errorText) {
    super(`Playback monitor request failed (${status}): ${errorText}`);
    this.status = status;
  }
}

export class PlayerMonitor {
  /** @type {PlayerMonitorDeps} */
  #deps;
  /** @type {ReturnType<typeof setInterval> | null} */
  #monitorTimer;

  /** @param {PlayerMonitorDeps} deps */
  constructor(deps) {
    this.#deps = deps;
    this.#monitorTimer = null;
  }

  start() {
    this.stop();
    this.#monitorTimer = globalThis.setInterval(() => {
      void (async () => {
        try {
          await this.#monitorPlayback();
        } catch (error) {
          this.#deps.reportError(error);
        }
      })();
    }, 4000);
  }

  stop() {
    if (this.#monitorTimer !== null) {
      clearInterval(this.#monitorTimer);
      this.#monitorTimer = null;
    }
  }

  async #monitorPlayback() {
    const session = this.#deps.getSession();
    if (session.activationState !== 'active' || !session.currentUri) return;

    const token = await this.#deps.getUsableAccessToken();
    if (!token) {
      this.#deps.transitionToDetached('Spotify session expired; please reconnect');
      return;
    }

    const playerState = await this.#deps.spotifyAppApi.getPlayerState();
    if (playerState.type === 'error') {
      if (this.#deps.isUnrecoverableSpotifyStatus(playerState.status)) {
        this.#deps.transitionToDetached(
          spotifyStatusMessage(playerState.status, 'Spotify playback monitor detached'),
        );
        return;
      }

      this.#deps.reportError(new PlayerMonitorStatusError(playerState.status, playerState.errorText));
      return;
    }

    if (playerState.type === 'no-snapshot-data') {
      return;
    }

    const contextUri = playerState.contextUri;

    if (contextUri === session.currentUri) {
      session.observedCurrentContext = true;
      this.#deps.persistRuntimeState();
      return;
    }

    if (!session.observedCurrentContext) {
      return;
    }

    if (session.observedCurrentContext && contextUri === null) {
      await this.#deps.goToNextItem();
      return;
    }

    if (contextUri && contextUri !== session.currentUri) {
      this.#deps.transitionToDetached(
        'Spotify is playing a different album/playlist than this app expects; reattach to resume',
      );
    }
  }
}
