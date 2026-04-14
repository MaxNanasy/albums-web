const ERROR_TOAST_COOLDOWN_MS = 45000;

export class ErrorReporter {
  /**
   * @param {{
   *  setAuthStatus: (message: string) => void;
   *  setPlaybackStatus: (message: string) => void;
   *  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
   * }} deps
   */
  constructor(deps) {
    /** @type {{setAuthStatus: (message: string) => void; setPlaybackStatus: (message: string) => void; showToast: (message: string, type?: 'success' | 'info' | 'error') => void;}} */
    this.deps = deps;
    /** @type {Map<string, number>} */
    this.errorToastLastShownAt = new Map();
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} task
   * @param {ErrorReportOptions} options
   * @returns {Promise<T | undefined>}
   */
  async run(task, options) {
    try {
      return await task();
    } catch (error) {
      this.report(error, options);
      return undefined;
    }
  }

  /**
   * @param {unknown} error
   * @param {ErrorReportOptions} options
   */
  report(error, options) {
    const message = errorMessageForUser(error, options.fallbackMessage);
    console.error(`[${options.context}]`, error);

    if (options.authStatusMessage) {
      this.deps.setAuthStatus(options.authStatusMessage);
    }
    if (options.playbackStatusMessage) {
      this.deps.setPlaybackStatus(options.playbackStatusMessage);
    }

    const toastKey = options.toastKey ?? `${options.context}:${message}`;
    if (options.toastMode === 'cooldown') {
      const lastAt = this.errorToastLastShownAt.get(toastKey) ?? 0;
      if (Date.now() - lastAt >= ERROR_TOAST_COOLDOWN_MS) {
        this.errorToastLastShownAt.set(toastKey, Date.now());
        this.deps.showToast(message, 'error');
      }
      return;
    }

    this.deps.showToast(message, 'error');
  }
}

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
 * @param {unknown} error
 * @param {string} fallbackMessage
 */
function errorMessageForUser(error, fallbackMessage) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw && (/Failed to fetch/i.test(raw) || /NetworkError/i.test(raw))) {
    return 'Network error while contacting Spotify. Please try again.';
  }
  return fallbackMessage;
}
