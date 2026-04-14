export class StoragePanel {
  /**
   * @param {{
   *  exportStorageBtn: HTMLButtonElement;
   *  importStorageBtn: HTMLButtonElement;
   *  storageJson: HTMLTextAreaElement;
   * }} el
   */
  constructor(el) {
    /** @type {{exportStorageBtn: HTMLButtonElement; importStorageBtn: HTMLButtonElement; storageJson: HTMLTextAreaElement;}} */
    this.el = el;
  }

  /** @param {{ onExport: () => void; onImport: () => void }} handlers */
  bind(handlers) {
    this.el.exportStorageBtn.addEventListener('click', handlers.onExport);
    this.el.importStorageBtn.addEventListener('click', handlers.onImport);
  }

  /** @returns {string} */
  getJsonInput() {
    return this.el.storageJson.value;
  }

  /** @param {string} value */
  setJsonInput(value) {
    this.el.storageJson.value = value;
  }
}
