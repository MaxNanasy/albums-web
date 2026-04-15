/** @typedef {'album' | 'playlist'} ItemType */

/**
 * @param {string | null} rawItems
 * @param {string} itemsStorageKey
 * @returns {{ data: Record<string, unknown> | null; error: string | null }}
 */
export function exportItemsData(rawItems, itemsStorageKey) {
  /** @type {Record<string, unknown>} */
  const data = {};

  if (rawItems) {
    try {
      data[itemsStorageKey] = JSON.parse(rawItems);
    } catch {
      return { data: null, error: 'Unable to export saved items because stored data is invalid JSON.' };
    }
  } else {
    data[itemsStorageKey] = [];
  }

  return { data, error: null };
}

/**
 * @param {string} raw
 * @param {string} itemsStorageKey
 * @returns {{ ok: false; error: string } | { ok: true; items: {type: ItemType; uri: string; title?: unknown}[] }}
 */
export function importItemsData(raw, itemsStorageKey) {
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
  const maybeItems = parsedObject[itemsStorageKey];
  if (!Array.isArray(maybeItems)) {
    return { ok: false, error: 'Import JSON must include a valid shuffle-by-album.items array.' };
  }

  /** @type {unknown[]} */
  const rawItems = maybeItems;
  const parsedItems = rawItems.filter(
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
  );

  return {
    ok: true,
    items: parsedItems,
  };
}
