/** @typedef {{uri: string; title: string}} ShuffleItem */
/** @typedef {{addForm: HTMLFormElement; itemUri: HTMLInputElement; importPlaylistBtn: HTMLButtonElement; itemList: HTMLUListElement;}} ItemsPanelElements */

export class ItemsPanel {
  /** @type {ItemsPanelElements} */
  #el;
  /** @type {(uri: string) => void} */
  #onRemove;
  /** @param {ItemsPanelElements} el */
  constructor(el) {
    this.#el = el;
    this.#onRemove = () => {};
  }

  /**
   * @param {{
   *  onAdd: (rawUri: string) => void;
   *  onImportPlaylist: () => void;
   *  onRemove: (uri: string) => void;
   * }} handlers
   */
  bind(handlers) {
    this.#el.addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.onAdd(this.#el.itemUri.value.trim());
    });

    this.#el.importPlaylistBtn.addEventListener('click', handlers.onImportPlaylist);
    this.#onRemove = handlers.onRemove;
  }

  /** @param {ShuffleItem[]} items */
  renderList(items) {
    this.#el.itemList.innerHTML = '';

    for (const item of items) {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = item.title ? item.title : item.uri;

      const actions = document.createElement('div');
      actions.className = 'row';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'danger';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        this.#onRemove(item.uri);
      });

      actions.appendChild(removeButton);
      li.append(text, actions);
      this.#el.itemList.appendChild(li);
    }
  }

  clearInput() {
    this.#el.itemUri.value = '';
  }

  /** @returns {string} */
  getUriInput() {
    return this.#el.itemUri.value.trim();
  }
}
