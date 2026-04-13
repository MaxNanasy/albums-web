import { spotifyStatusMessage } from './spotify-status-message.js';

/**
 * @typedef {{
 *   activationState: 'inactive' | 'active' | 'detached';
 *   currentUri: string | null;
 *   observedCurrentContext: boolean;
 * }} MonitorSession
 */

/**
 * @typedef {{
 *   context: string;
 *   fallbackMessage: string;
 *   authStatusMessage?: string;
 *   playbackStatusMessage?: string;
 *   toastMode?: 'always' | 'cooldown';
 *   toastKey?: string;
 * }} ErrorReportOptions
 */

/**
 * @typedef {{
 *   getSession: () => MonitorSession;
 *   getUsableAccessToken: () => Promise<string | null>;
 *   getPlayerState: () => Promise<{ok: true; contextUri: string | null} | {ok: false; status: number; errorText: string}>;
 *   persistRuntimeState: () => void;
 *   transitionToDetached: (message: string) => void;
 *   goToNextItem: () => Promise<void>;
 *   reportError: (error: unknown, options: ErrorReportOptions) => void;
 *   isUnrecoverableSpotifyStatus: (status: number) => boolean;
 * }} PlayerMonitorDeps
 */

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
          this.deps.reportError(error, {
            context: 'monitor',
            fallbackMessage: 'Playback monitor encountered an error.',
            playbackStatusMessage:
              'Playback monitor paused due to an error. Try restarting the session.',
            toastMode: 'cooldown',
            toastKey: 'monitor-loop',
          });
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

    const playerState = await this.deps.getPlayerState();
    if (!playerState.ok) {
      if (this.deps.isUnrecoverableSpotifyStatus(playerState.status)) {
        this.deps.transitionToDetached(
          spotifyStatusMessage(playerState.status, 'Spotify playback monitor detached.'),
        );
        return;
      }

      this.deps.reportError(
        new Error(
          `Playback monitor request failed (${playerState.status}): ${playerState.errorText}`,
        ),
        {
          context: 'monitor',
          fallbackMessage: spotifyStatusMessage(
            playerState.status,
            'Could not check playback state.',
          ),
          playbackStatusMessage: 'Unable to check playback state right now.',
          toastMode: 'cooldown',
          toastKey: `monitor-http-${playerState.status}`,
        },
      );
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
