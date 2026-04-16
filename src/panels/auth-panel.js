/** @typedef {{loginBtn: HTMLButtonElement; logoutBtn: HTMLButtonElement; authStatus: HTMLParagraphElement;}} AuthPanelElements */

export class AuthPanel {
  /** @type {AuthPanelElements} */
  #el;

  /** @param {AuthPanelElements} el */
  constructor(el) {
    this.#el = el;
  }

  /** @param {{ onLogin: () => void; onLogout: () => void }} handlers */
  bind(handlers) {
    this.#el.loginBtn.addEventListener('click', handlers.onLogin);
    this.#el.logoutBtn.addEventListener('click', handlers.onLogout);
  }

  /** @param {string} message */
  renderStatus(message) {
    this.#el.authStatus.textContent = message;
  }
}
