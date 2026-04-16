/** @typedef {{exportStorageBtn: HTMLButtonElement; importStorageBtn: HTMLButtonElement; storageJson: HTMLTextAreaElement;}} StoragePanelElements */

export class StoragePanel {
  /** @type {StoragePanelElements} */
  #el;
  /** @param {StoragePanelElements} el */
  constructor(el) {
    this.#el = el;
  }

  /** @param {{ onExport: () => void; onImport: () => void }} handlers */
  bind(handlers) {
    this.#el.exportStorageBtn.addEventListener('click', handlers.onExport);
    this.#el.importStorageBtn.addEventListener('click', handlers.onImport);
  }

  /** @returns {string} */
  getJsonInput() {
    return this.#el.storageJson.value;
  }

  /** @param {string} value */
  setJsonInput(value) {
    this.#el.storageJson.value = value;
  }
}
