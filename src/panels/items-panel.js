/** @typedef {{uri: string; title: string}} ShuffleItem */
/** @typedef {{id: number; item: ShuffleItem; index: number}} RecentlyRemovedEntry */
/** @typedef {{addForm: HTMLFormElement; itemUri: HTMLInputElement; importPlaylistBtn: HTMLButtonElement; itemList: HTMLUListElement; recentlyRemovedSection: HTMLElement; recentlyRemovedCount: HTMLElement; recentlyRemovedList: HTMLUListElement; purgeRecentlyRemovedBtn: HTMLButtonElement;}} ItemsPanelElements */

export class ItemsPanel {
  /** @type {ItemsPanelElements} */
  #el;
  /** @type {(uri: string) => void} */
  #onRemove;
  /** @type {(entryId: number) => void} */
  #onRestoreRecentlyRemoved;
  /** @type {() => void} */
  #onPurgeRecentlyRemoved;

  /** @param {ItemsPanelElements} el */
  constructor(el) {
    this.#el = el;
    this.#onRemove = () => {};
    this.#onRestoreRecentlyRemoved = () => {};
    this.#onPurgeRecentlyRemoved = () => {};
  }

  /**
   * @param {{
   *  onAdd: (rawUri: string) => void;
   *  onImportPlaylist: () => void;
   *  onRemove: (uri: string) => void;
   *  onRestoreRecentlyRemoved: (entryId: number) => void;
   *  onPurgeRecentlyRemoved: () => void;
   * }} handlers
   */
  bind(handlers) {
    this.#el.addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.onAdd(this.#el.itemUri.value.trim());
    });

    this.#el.importPlaylistBtn.addEventListener('click', handlers.onImportPlaylist);
    this.#el.purgeRecentlyRemovedBtn.addEventListener('click', () => {
      this.#onPurgeRecentlyRemoved();
    });
    this.#onRemove = handlers.onRemove;
    this.#onRestoreRecentlyRemoved = handlers.onRestoreRecentlyRemoved;
    this.#onPurgeRecentlyRemoved = handlers.onPurgeRecentlyRemoved;
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

  /** @param {RecentlyRemovedEntry[]} entries */
  renderRecentlyRemoved(entries) {
    this.#el.recentlyRemovedList.innerHTML = '';
    this.#el.recentlyRemovedSection.hidden = entries.length === 0;
    this.#el.recentlyRemovedCount.textContent = entries.length === 1 ? '1 item' : `${entries.length} items`;
    this.#el.purgeRecentlyRemovedBtn.disabled = entries.length === 0;

    for (const entry of entries) {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = entry.item.title ? entry.item.title : entry.item.uri;

      const actions = document.createElement('div');
      actions.className = 'row';

      const restoreButton = document.createElement('button');
      restoreButton.type = 'button';
      restoreButton.textContent = 'Restore';
      restoreButton.addEventListener('click', () => {
        this.#onRestoreRecentlyRemoved(entry.id);
      });

      actions.appendChild(restoreButton);
      li.append(text, actions);
      this.#el.recentlyRemovedList.appendChild(li);
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
