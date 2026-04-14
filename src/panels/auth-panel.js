export class AuthPanel {
  /**
   * @param {{
   *  loginBtn: HTMLButtonElement;
   *  logoutBtn: HTMLButtonElement;
   *  authStatus: HTMLParagraphElement;
   * }} el
   */
  constructor(el) {
    /** @type {{loginBtn: HTMLButtonElement; logoutBtn: HTMLButtonElement; authStatus: HTMLParagraphElement;}} */
    this.el = el;
  }

  /** @param {{ onLogin: () => void; onLogout: () => void }} handlers */
  bind(handlers) {
    this.el.loginBtn.addEventListener('click', handlers.onLogin);
    this.el.logoutBtn.addEventListener('click', handlers.onLogout);
  }

  /** @param {string} message */
  renderStatus(message) {
    this.el.authStatus.textContent = message;
  }
}
