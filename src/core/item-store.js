import { exportItemsData, importItemsData } from './storage-transfer.js';

/** @typedef {'album' | 'playlist'} ItemType */
/** @typedef {{uri: string; type: ItemType; title: string}} ShuffleItem */
/** @typedef {{ items: string; recentlyRemoved: string }} ItemStoreStorageKeys */

export class ItemStore {
  /** @type {ItemStoreStorageKeys} */
  #storageKeys;

  /** @param {ItemStoreStorageKeys} storageKeys */
  constructor(storageKeys) {
    this.#storageKeys = storageKeys;
  }

  /** @returns {ShuffleItem[]} */
  getItems() {
    const raw = localStorage.getItem(this.#storageKeys.items);
    if (!raw) return [];

    try {
      /** @type {unknown} */
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return normalizeItems(parsed);
    } catch {
      return [];
    }
  }

  /** @param {ShuffleItem[]} items */
  saveItems(items) {
    localStorage.setItem(this.#storageKeys.items, JSON.stringify(items));
  }

  /** @returns {ShuffleItem[]} */
  getRecentlyRemoved() {
    const raw = localStorage.getItem(this.#storageKeys.recentlyRemoved);
    if (!raw) return [];

    try {
      /** @type {unknown} */
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return normalizeItems(parsed);
    } catch {
      return [];
    }
  }

  /** @param {ShuffleItem[]} entries */
  saveRecentlyRemoved(entries) {
    if (entries.length === 0) {
      localStorage.removeItem(this.#storageKeys.recentlyRemoved);
      return;
    }

    localStorage.setItem(this.#storageKeys.recentlyRemoved, JSON.stringify(entries));
  }

  clearRecentlyRemoved() {
    localStorage.removeItem(this.#storageKeys.recentlyRemoved);
  }

  /** @returns {{ data: Record<string, unknown> | null; error: string | null }} */
  exportData() {
    const rawItems = localStorage.getItem(this.#storageKeys.items);
    const rawRecentlyRemoved = localStorage.getItem(this.#storageKeys.recentlyRemoved);
    return exportItemsData(
      rawItems,
      this.#storageKeys.items,
      rawRecentlyRemoved,
      this.#storageKeys.recentlyRemoved,
    );
  }

  /**
   * @param {string} raw
   * @returns {{ ok: false; error: string } | { ok: true; items: ShuffleItem[]; recentlyRemoved: ShuffleItem[] }}
   */
  importFromJson(raw) {
    const parsed = importItemsData(raw, this.#storageKeys.items, this.#storageKeys.recentlyRemoved);
    if (!parsed.ok) return parsed;

    const items = normalizeItems(parsed.items);
    const itemUriSet = new Set(items.map((item) => item.uri));
    const recentlyRemoved = normalizeItems(parsed.recentlyRemoved).filter(
      (item) => !itemUriSet.has(item.uri)
    );

    this.saveItems(items);
    this.saveRecentlyRemoved(recentlyRemoved);
    return { ok: true, items, recentlyRemoved };
  }

  /** @param {string} uri */
  removeByUri(uri) {
    const items = this.getItems();
    const removedIndex = items.findIndex((candidate) => candidate.uri === uri);
    if (removedIndex < 0) {
      return null;
    }

    const [removedItem] = items.splice(removedIndex, 1);
    this.saveItems(items);
    return { removedItem, removedIndex };
  }

  /** @param {ShuffleItem} item @param {number} index */
  restoreItem(item, index) {
    const items = this.getItems();
    if (items.some((candidate) => candidate.uri === item.uri)) {
      return { ok: false, reason: 'duplicate' };
    }

    items.splice(index, 0, item);
    this.saveItems(items);
    return { ok: true };
  }
}

/** @param {unknown[]} parsedItems @returns {ShuffleItem[]} */
function normalizeItems(parsedItems) {
  return parsedItems
    .filter(
      /**
       * @param {unknown} item
       * @returns {item is {type: ItemType; uri: string; title?: unknown}}
       */
      (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const parsedItem = /** @type {Record<string, unknown>} */ (item);
        return (
          (parsedItem.type === 'album' || parsedItem.type === 'playlist') &&
          typeof parsedItem.uri === 'string'
        );
      },
    )
    .map((item) => ({
      type: item.type,
      uri: item.uri,
      title: typeof item.title === 'string' ? item.title : item.uri,
    }));
}
