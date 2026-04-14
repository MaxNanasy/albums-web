const TOAST_DURATION_MS = 5000;

/** @typedef {{ actionLabel: string, onAction: () => void }} ToastAction */

export class ToastPresenter {
  /** @param {HTMLDivElement} toastStack */
  constructor(toastStack) {
    /** @type {HTMLDivElement} */
    this.toastStack = toastStack;
  }

  /**
   * @param {string} message
   * @param {'success' | 'info' | 'error'} [type]
   * @param {{ action?: ToastAction }} [options]
   */
  show(message, type = 'info', options = {}) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.role = type === 'error' ? 'alert' : 'status';

    const body = document.createElement('span');
    body.className = 'toast-message';
    body.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'toast-close';
    closeButton.setAttribute('aria-label', 'Close notification');
    closeButton.textContent = '×';

    const actions = document.createElement('div');
    actions.className = 'toast-actions';

    if (options.action) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'secondary toast-action';
      actionButton.textContent = options.action.actionLabel;
      actionButton.addEventListener('click', () => {
        options.action?.onAction();
        removeToast();
      });
      actions.appendChild(actionButton);
    }
    actions.appendChild(closeButton);

    /** @type {number | null} */
    let timeoutId = window.setTimeout(removeToast, TOAST_DURATION_MS);

    function clearDismissTimer() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function restartDismissTimer() {
      clearDismissTimer();
      timeoutId = window.setTimeout(removeToast, TOAST_DURATION_MS);
    }

    function removeToast() {
      clearDismissTimer();
      toast.classList.add('toast-leaving');
      window.setTimeout(() => {
        toast.remove();
      }, 180);
    }

    closeButton.addEventListener('click', removeToast);
    toast.addEventListener('mouseenter', clearDismissTimer);
    toast.addEventListener('mouseleave', restartDismissTimer);

    toast.append(body, actions);
    this.toastStack.appendChild(toast);
  }
}
