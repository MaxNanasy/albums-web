const ERROR_TOAST_COOLDOWN_MS = 45000;
/** @typedef {{setAuthStatus: (message: string) => void; setPlaybackStatus: (message: string) => void; showToast: (message: string, type?: 'success' | 'info' | 'error') => void;}} ErrorReporterDeps */

export class ErrorReporter {
  /** @type {ErrorReporterDeps} */
  #deps;
  /** @type {Map<string, number>} */
  #errorToastLastShownAt;
  /** @param {ErrorReporterDeps} deps */
  constructor(deps) {
    this.#deps = deps;
    this.#errorToastLastShownAt = new Map();
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
    const message = userFacingErrorMessage(error, options.fallbackMessage);
    console.error(`[${options.context}]`, error);

    if (options.authStatusMessage) {
      this.#deps.setAuthStatus(options.authStatusMessage);
    }
    if (options.playbackStatusMessage) {
      this.#deps.setPlaybackStatus(options.playbackStatusMessage);
    }

    const toastKey = options.toastKey ?? `${options.context}:${message}`;
    if (options.toastMode === 'cooldown') {
      const lastAt = this.#errorToastLastShownAt.get(toastKey) ?? 0;
      if (Date.now() - lastAt >= ERROR_TOAST_COOLDOWN_MS) {
        this.#errorToastLastShownAt.set(toastKey, Date.now());
        this.#deps.showToast(message, 'error');
      }
      return;
    }

    this.#deps.showToast(message, 'error');
  }
}

/**
 * @typedef ErrorReportOptions
 * @property {string} context
 * @property {string} fallbackMessage
 * @property {string} [authStatusMessage]
 * @property {string} [playbackStatusMessage]
 * @property {'always' | 'cooldown'} [toastMode]
 * @property {string} [toastKey]
 */

/**
 * @param {unknown} error
 * @param {string} fallbackMessage
 */
export function userFacingErrorMessage(error, fallbackMessage) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw && (/Failed to fetch/i.test(raw) || /NetworkError/i.test(raw))) {
    return 'Network error while contacting Spotify. Please try again.';
  }
  return fallbackMessage;
}
