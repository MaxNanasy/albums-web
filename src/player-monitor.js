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
 * @param {{
 *   getSession: () => MonitorSession;
 *   getUsableAccessToken: () => Promise<string | null>;
 *   getPlayerState: () => Promise<{ok: true; contextUri: string | null} | {ok: false; status: number; errorText: string}>;
 *   persistRuntimeState: () => void;
 *   transitionToDetached: (message: string) => void;
 *   goToNextItem: () => Promise<void>;
 *   reportError: (error: unknown, options: ErrorReportOptions) => void;
 *   isUnrecoverableSpotifyStatus: (status: number) => boolean;
 * }} deps
 */
export function createPlayerMonitor(deps) {
  let monitorTimer = /** @type {number | null} */ (null);

  function stop() {
    if (monitorTimer !== null) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  function start() {
    stop();
    monitorTimer = window.setInterval(() => {
      void monitorPlayback();
    }, 4000);
  }

  async function monitorPlayback() {
    const session = deps.getSession();
    if (session.activationState !== 'active' || !session.currentUri) return;

    const token = await deps.getUsableAccessToken();
    if (!token) {
      deps.transitionToDetached('Spotify session expired. Please reconnect.');
      return;
    }

    try {
      const playerState = await deps.getPlayerState();
      if (!playerState.ok) {
        if (deps.isUnrecoverableSpotifyStatus(playerState.status)) {
          deps.transitionToDetached(
            spotifyStatusMessage(playerState.status, 'Spotify playback monitor detached.'),
          );
          return;
        }

        deps.reportError(
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
        deps.persistRuntimeState();
        return;
      }

      if (!session.observedCurrentContext) {
        // Ignore transient mismatch while a new context is still starting.
        return;
      }

      if (session.observedCurrentContext && contextUri === null) {
        // Current context is no longer active (likely finished).
        await deps.goToNextItem();
        return;
      }

      if (contextUri && contextUri !== session.currentUri) {
        deps.transitionToDetached(
          'Spotify is playing a different album/playlist than this app expects. Reattach to resume.',
        );
      }
    } catch (error) {
      deps.reportError(error, {
        context: 'monitor',
        fallbackMessage: 'Playback monitor encountered an error.',
        playbackStatusMessage:
          'Playback monitor paused due to an error. Try restarting the session.',
        toastMode: 'cooldown',
        toastKey: 'monitor-loop',
      });
    }
  }

  return { start, stop };
}
