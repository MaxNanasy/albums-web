/** @typedef {'album' | 'playlist'} ItemType */
/** @typedef {{uri: string; type: ItemType; title: string}} ShuffleItem */

export class ItemStore {
  /** @param {{ items: string }} storageKeys */
  constructor(storageKeys) {
    /** @type {{ items: string }} */
    this.storageKeys = storageKeys;
  }

  /** @returns {ShuffleItem[]} */
  getItems() {
    const raw = localStorage.getItem(this.storageKeys.items);
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
    localStorage.setItem(this.storageKeys.items, JSON.stringify(items));
  }

  /** @returns {{ data: Record<string, unknown> | null; error: string | null }} */
  exportData() {
    const rawItems = localStorage.getItem(this.storageKeys.items);
    /** @type {Record<string, unknown>} */
    const data = {};

    if (rawItems) {
      try {
        data[this.storageKeys.items] = JSON.parse(rawItems);
      } catch {
        return { data: null, error: 'Unable to export saved items because stored data is invalid JSON.' };
      }
    } else {
      data[this.storageKeys.items] = [];
    }

    return { data, error: null };
  }

  /** @param {string} raw */
  importFromJson(raw) {
    if (!raw.trim()) {
      return { ok: false, error: 'Paste a JSON object to import.' };
    }

    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Invalid JSON. Please provide a valid JSON object.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Import JSON must be an object of key/value pairs.' };
    }

    const parsedObject = /** @type {Record<string, unknown>} */ (parsed);
    const maybeItems = parsedObject[this.storageKeys.items];
    if (!Array.isArray(maybeItems)) {
      return { ok: false, error: 'Import JSON must include a valid shuffle-by-album.items array.' };
    }

    const items = normalizeItems(maybeItems);
    this.saveItems(items);
    return { ok: true, items };
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
