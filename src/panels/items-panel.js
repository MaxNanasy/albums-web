/** @typedef {{uri: string; title: string}} ShuffleItem */
/** @typedef {{addForm: HTMLFormElement; itemUri: HTMLInputElement; importPlaylistBtn: HTMLButtonElement; itemList: HTMLUListElement; removedItemsSection: HTMLElement; removedItemsCount: HTMLElement; removedItemsList: HTMLUListElement; purgeRemovedItemsBtn: HTMLButtonElement;}} ItemsPanelElements */

export class ItemsPanel {
  /** @type {ItemsPanelElements} */
  #el;
  /** @type {(uri: string) => void} */
  #onRemove;
  /** @type {(uri: string) => void} */
  #onRestoreRemovedItems;
  /** @type {() => void} */
  #onPurgeRemovedItems;

  /** @param {ItemsPanelElements} el */
  constructor(el) {
    this.#el = el;
    this.#onRemove = () => {};
    this.#onRestoreRemovedItems = () => {};
    this.#onPurgeRemovedItems = () => {};
  }

  /**
   * @param {{
   *  onAdd: (rawUri: string) => void;
   *  onImportPlaylist: () => void;
   *  onRemove: (uri: string) => void;
   *  onRestoreRemovedItems: (uri: string) => void;
   *  onPurgeRemovedItems: () => void;
   * }} handlers
   */
  bind(handlers) {
    this.#el.addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.onAdd(this.#el.itemUri.value.trim());
    });

    this.#el.importPlaylistBtn.addEventListener('click', handlers.onImportPlaylist);
    this.#el.purgeRemovedItemsBtn.addEventListener('click', () => {
      this.#onPurgeRemovedItems();
    });
    this.#onRemove = handlers.onRemove;
    this.#onRestoreRemovedItems = handlers.onRestoreRemovedItems;
    this.#onPurgeRemovedItems = handlers.onPurgeRemovedItems;
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

  /** @param {ShuffleItem[]} entries */
  renderRemovedItems(entries) {
    this.#el.removedItemsList.innerHTML = '';
    this.#el.removedItemsSection.hidden = entries.length === 0;
    this.#el.removedItemsCount.textContent = entries.length === 1 ? '1 item' : `${entries.length} items`;
    this.#el.purgeRemovedItemsBtn.disabled = entries.length === 0;

    for (const entry of entries) {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = entry.title ? entry.title : entry.uri;

      const actions = document.createElement('div');
      actions.className = 'row';

      const restoreButton = document.createElement('button');
      restoreButton.type = 'button';
      restoreButton.textContent = 'Restore';
      restoreButton.addEventListener('click', () => {
        this.#onRestoreRemovedItems(entry.uri);
      });

      actions.appendChild(restoreButton);
      li.append(text, actions);
      this.#el.removedItemsList.appendChild(li);
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
