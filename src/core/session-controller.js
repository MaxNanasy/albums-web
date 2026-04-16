/** @typedef {'album' | 'playlist'} ItemType */
/** @typedef {{uri: string; type: ItemType; title: string}} ShuffleItem */
/** @typedef {'inactive' | 'active' | 'detached'} SessionActivationState */

/**
 * @typedef SessionControllerDeps
 * @property {string} runtimeStorageKey
 * @property {() => Promise<string | null>} getUsableAccessToken
 * @property {import('../spotify-app-api.js').SpotifyAppApi} spotifyAppApi
 * @property {(message: string, type?: 'success' | 'info' | 'error') => void} showToast
 * @property {(message: string) => void} setPlaybackStatus
 * @property {(activationState: SessionActivationState) => void} renderPlaybackControls
 * @property {(session: SessionState) => void} renderSessionQueue
 * @property {(error: unknown, options: {context: string; fallbackMessage: string; playbackStatusMessage?: string; toastMode?: 'always' | 'cooldown'; toastKey?: string;}) => void} reportError
 * @property {(error: unknown) => boolean} isUnrecoverableSpotifyError
 * @property {(status: number) => boolean} isUnrecoverableSpotifyStatus
 * @property {(status: number, fallback: string) => string} spotifyStatusMessage
 * @property {() => ShuffleItem[]} getItems
 * @property {(items: ShuffleItem[]) => ShuffleItem[]} shuffledCopy
 */

export class SessionController {
  /** @type {SessionControllerDeps} */
  #deps;
  /** @type {{start: () => void; stop: () => void} | null} */
  #playerMonitor;
  /** @type {SessionState} */
  #session;

  /** @param {SessionControllerDeps} deps */
  constructor(deps) {
    this.#deps = deps;
    this.#playerMonitor = null;
    this.#session = {
      activationState: 'inactive',
      queue: [],
      index: 0,
      currentUri: null,
      observedCurrentContext: false,
    };
  }

  /** @param {{start: () => void; stop: () => void}} monitor */
  setPlayerMonitor(monitor) {
    this.#playerMonitor = monitor;
  }

  /** @returns {SessionState} */
  getSession() {
    return this.#session;
  }

  async startShuffleSession() {
    const token = await this.#deps.getUsableAccessToken();
    if (!token) {
      this.#deps.showToast('Connect Spotify first.', 'error');
      return;
    }

    const items = this.#deps.getItems();
    if (items.length === 0) {
      this.#deps.showToast('Add at least one album or playlist first.', 'info');
      return;
    }

    this.#session.queue = this.#deps.shuffledCopy(items);
    this.#session.activationState = 'active';
    this.#session.index = 0;
    this.persistRuntimeState();
    this.#render();

    this.#deps.setPlaybackStatus(`Session started with ${this.#session.queue.length} item(s).`);
    await this.playCurrentItem();
    if (this.#session.activationState === 'active') {
      this.#playerMonitor?.start();
    }
  }

  /** @param {string} message */
  stopSession(message) {
    this.transitionToInactive(message);
  }

  /** @param {string} message */
  transitionToInactive(message) {
    this.#playerMonitor?.stop();
    this.#session.activationState = 'inactive';
    this.#session.queue = [];
    this.#session.index = 0;
    this.#session.currentUri = null;
    this.#session.observedCurrentContext = false;
    this.clearRuntimeState();
    this.#render();
    this.#deps.setPlaybackStatus(message);
  }

  /** @param {string} message */
  transitionToDetached(message) {
    if (this.#session.activationState === 'inactive') {
      return;
    }
    this.#playerMonitor?.stop();
    this.#session.activationState = 'detached';
    this.persistRuntimeState();
    this.#render();
    this.#deps.setPlaybackStatus(message);
  }

  async goToNextItem() {
    if (this.#session.activationState !== 'active') {
      this.#deps.setPlaybackStatus('No active session.');
      return;
    }

    this.#session.index += 1;
    this.persistRuntimeState();
    if (this.#session.index >= this.#session.queue.length) {
      this.stopSession('Finished: all selected albums/playlists were played.');
      return;
    }
    this.#deps.renderSessionQueue(this.#session);

    await this.playCurrentItem();
  }

  async reattachSession() {
    if (this.#session.activationState !== 'detached') {
      return;
    }
    const current = this.#session.queue[this.#session.index];
    if (!current) {
      this.transitionToInactive('No queued item available to reattach.');
      return;
    }

    const token = await this.#deps.getUsableAccessToken();
    if (!token) {
      this.transitionToDetached('Spotify session expired. Please reconnect.');
      return;
    }

    const playerState = await this.#deps.spotifyAppApi.getPlayerState();
    if (!playerState.ok) {
      if (this.#deps.isUnrecoverableSpotifyStatus(playerState.status)) {
        this.transitionToDetached(this.#deps.spotifyStatusMessage(playerState.status, 'Unable to reattach playback state.'));
        return;
      }
      throw new Error(
        `Unable to check current Spotify playback (${playerState.status}): ${playerState.errorText}`,
      );
    }

    const contextUri = playerState.contextUri;

    if (contextUri !== current.uri) {
      this.#session.activationState = 'active';
      await this.playCurrentItem();
    } else {
      this.#session.currentUri = current.uri;
      this.#session.observedCurrentContext = true;
      this.#session.activationState = 'active';
      this.persistRuntimeState();
      this.#render();
      this.#deps.setPlaybackStatus(this.formatNowPlayingStatus(current));
    }
    if (this.#session.activationState === 'active') {
      this.#playerMonitor?.start();
    }
  }

  async playCurrentItem() {
    const current = this.#session.queue[this.#session.index];
    if (!current) {
      this.transitionToInactive('Finished: all selected albums/playlists were played.');
      return;
    }
    this.#session.currentUri = current.uri;
    this.#session.observedCurrentContext = false;
    this.#session.activationState = 'active';
    this.persistRuntimeState();
    this.#render();

    const token = await this.#deps.getUsableAccessToken();
    if (!token) {
      this.stopSession('Spotify session expired. Please reconnect.');
      return;
    }

    try {
      await this.#deps.spotifyAppApi.disableShuffle();
      await this.#deps.spotifyAppApi.disableRepeat();
      await this.#deps.spotifyAppApi.playContext(current.uri);
    } catch (error) {
      this.#deps.reportError(error, {
        context: 'playback',
        fallbackMessage: 'Unable to start playback on Spotify.',
        playbackStatusMessage: 'Could not start playback. Ensure an active Spotify device is available.',
      });
      if (this.#deps.isUnrecoverableSpotifyError(error)) {
        this.transitionToDetached('Playback detached due to a Spotify error. Reattach when ready.');
        return;
      }
      this.stopSession('Playback failed. Session stopped.');
      return;
    }

    this.#deps.setPlaybackStatus(this.formatNowPlayingStatus(current));
  }

  restoreRuntimeState() {
    const raw = localStorage.getItem(this.#deps.runtimeStorageKey);
    if (!raw) return;

    /** @type {unknown} */
    let parsedUnknown;
    try {
      parsedUnknown = JSON.parse(raw);
    } catch {
      localStorage.removeItem(this.#deps.runtimeStorageKey);
      return;
    }

    if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
      localStorage.removeItem(this.#deps.runtimeStorageKey);
      return;
    }
    const parsed = /** @type {Record<string, unknown>} */ (parsedUnknown);

    const queueValue = parsed.queue;
    /** @type {unknown[]} */
    const queueItems = Array.isArray(queueValue) ? queueValue : [];
    const restoredQueue = queueItems.filter(
      /**
       * @param {unknown} item
       * @returns {item is ShuffleItem}
       */
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const runtimeItem = /** @type {Record<string, unknown>} */ (item);
        return (
          (runtimeItem.type === 'album' || runtimeItem.type === 'playlist') &&
          typeof runtimeItem.uri === 'string' &&
          typeof runtimeItem.title === 'string'
        );
      },
    );

    const indexValue = parsed.index;
    const restoredIndex =
      typeof indexValue === 'number' && Number.isInteger(indexValue) && indexValue >= 0
        ? indexValue
        : 0;
    const restoredCurrentUri = typeof parsed.currentUri === 'string' ? parsed.currentUri : null;
    const restoredObserved = parsed.observedCurrentContext === true;
    const activationStateValue = parsed.activationState;
    let restoredActivationState = /** @type {SessionActivationState} */ ('inactive');
    if (
      activationStateValue === 'active' ||
      activationStateValue === 'detached' ||
      activationStateValue === 'inactive'
    ) {
      restoredActivationState = activationStateValue;
    }
    if (restoredQueue.length === 0) {
      restoredActivationState = 'inactive';
    }

    this.#session.queue = restoredQueue;
    this.#session.index = Math.min(restoredIndex, Math.max(0, restoredQueue.length - 1));
    this.#session.currentUri = restoredCurrentUri;
    this.#session.observedCurrentContext = restoredObserved;
    this.#session.activationState = restoredActivationState;

    if (this.#session.activationState === 'inactive') {
      this.clearRuntimeState();
      return;
    }

    const current = this.#session.queue[this.#session.index];
    this.#deps.setPlaybackStatus(this.formatNowPlayingStatus(current));
    this.#render();
    if (this.#session.activationState === 'active') {
      this.#playerMonitor?.start();
    }
  }

  persistRuntimeState() {
    localStorage.setItem(
      this.#deps.runtimeStorageKey,
      JSON.stringify({
        active: this.#session.activationState === 'active',
        activationState: this.#session.activationState,
        queue: this.#session.queue,
        index: this.#session.index,
        currentUri: this.#session.currentUri,
        observedCurrentContext: this.#session.observedCurrentContext,
      }),
    );
  }

  clearRuntimeState() {
    localStorage.removeItem(this.#deps.runtimeStorageKey);
  }

  /** @param {ShuffleItem} item */
  formatNowPlayingStatus(item) {
    return `Now playing ${item.type} ${this.#session.index + 1} of ${this.#session.queue.length}: ${item.title}`;
  }

  #render() {
    this.#deps.renderSessionQueue(this.#session);
    this.#deps.renderPlaybackControls(this.#session.activationState);
  }
}

/**
 * @typedef SessionState
 * @property {SessionActivationState} activationState
 * @property {ShuffleItem[]} queue
 * @property {number} index
 * @property {string | null} currentUri
 * @property {boolean} observedCurrentContext
 */
