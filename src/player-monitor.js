import { spotifyStatusMessage } from './spotify-status-message.js';

/** @typedef {import('./spotify-app-api.js').SpotifyAppApi} SpotifyAppApi */

/**
 * @typedef {{
 *   activationState: 'inactive' | 'active' | 'detached';
 *   currentUri: string | null;
 *   observedCurrentContext: boolean;
 * }} MonitorSession
 */

/**
 * @typedef {{
 *   getSession: () => MonitorSession;
 *   getUsableAccessToken: () => Promise<string | null>;
 *   spotifyAppApi: SpotifyAppApi;
 *   persistRuntimeState: () => void;
 *   transitionToDetached: (message: string) => void;
 *   goToNextItem: () => Promise<void>;
 *   reportError: (error: unknown) => void;
 *   isUnrecoverableSpotifyStatus: (status: number) => boolean;
 * }} PlayerMonitorDeps
 */

export class PlayerMonitorStatusError extends Error {
  /** @type {number} */
  status;

  /** @type {string} */
  errorText;

  /**
   * @param {number} status
   * @param {string} errorText
   */
  constructor(status, errorText) {
    super(`Playback monitor request failed (${status}): ${errorText}`);
    this.status = status;
    this.errorText = errorText;
  }
}

export class PlayerMonitor {
  /** @type {PlayerMonitorDeps} */
  deps;

  /** @type {number | null} */
  monitorTimer;

  /** @param {PlayerMonitorDeps} deps */
  constructor(deps) {
    this.deps = deps;
    this.monitorTimer = /** @type {number | null} */ (null);
  }

  start() {
    this.stop();
    this.monitorTimer = window.setInterval(() => {
      void (async () => {
        try {
          await this.monitorPlayback();
        } catch (error) {
          this.deps.reportError(error);
        }
      })();
    }, 4000);
  }

  stop() {
    if (this.monitorTimer !== null) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  async monitorPlayback() {
    const session = this.deps.getSession();
    if (session.activationState !== 'active' || !session.currentUri) return;

    const token = await this.deps.getUsableAccessToken();
    if (!token) {
      this.deps.transitionToDetached('Spotify session expired. Please reconnect.');
      return;
    }

    const playerState = await this.deps.spotifyAppApi.getPlayerState();
    if (!playerState.ok) {
      if (this.deps.isUnrecoverableSpotifyStatus(playerState.status)) {
        this.deps.transitionToDetached(
          spotifyStatusMessage(playerState.status, 'Spotify playback monitor detached.'),
        );
        return;
      }

      this.deps.reportError(new PlayerMonitorStatusError(playerState.status, playerState.errorText));
      return;
    }

    const contextUri = playerState.contextUri;

    if (contextUri === session.currentUri) {
      session.observedCurrentContext = true;
      this.deps.persistRuntimeState();
      return;
    }

    if (!session.observedCurrentContext) {
      return;
    }

    if (session.observedCurrentContext && contextUri === null) {
      await this.deps.goToNextItem();
      return;
    }

    if (contextUri && contextUri !== session.currentUri) {
      this.deps.transitionToDetached(
        'Spotify is playing a different album/playlist than this app expects. Reattach to resume.',
      );
    }
  }
}
