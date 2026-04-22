/** @typedef {'album' | 'playlist'} ItemType */

/**
 * @param {string | null} rawItems
 * @param {string} itemsStorageKey
 * @param {string | null} rawRecentlyRemoved
 * @param {string} recentlyRemovedStorageKey
 * @returns {{ data: Record<string, unknown> | null; error: string | null }}
 */
export function exportItemsData(
  rawItems,
  itemsStorageKey,
  rawRecentlyRemoved,
  recentlyRemovedStorageKey,
) {
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

  if (rawRecentlyRemoved) {
    try {
      data[recentlyRemovedStorageKey] = JSON.parse(rawRecentlyRemoved);
    } catch {
      return {
        data: null,
        error: 'Unable to export Recently Removed because stored data is invalid JSON.',
      };
    }
  } else {
    data[recentlyRemovedStorageKey] = [];
  }

  return { data, error: null };
}

/**
 * @param {string} raw
 * @param {string} itemsStorageKey
 * @param {string} recentlyRemovedStorageKey
 * @returns {{ ok: false; error: string } | { ok: true; items: {type: ItemType; uri: string; title?: unknown}[]; recentlyRemoved: {type: ItemType; uri: string; title?: unknown}[] }}
 */
export function importItemsData(raw, itemsStorageKey, recentlyRemovedStorageKey) {
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

  const maybeRecentlyRemoved = parsedObject[recentlyRemovedStorageKey];
  if (maybeRecentlyRemoved !== undefined && !Array.isArray(maybeRecentlyRemoved)) {
    return {
      ok: false,
      error: 'Import JSON must include a valid shuffle-by-album.recentlyRemoved array when provided.',
    };
  }

  const itemFilter =
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
    };

  return {
    ok: true,
    items: maybeItems.filter(itemFilter),
    recentlyRemoved: Array.isArray(maybeRecentlyRemoved) ? maybeRecentlyRemoved.filter(itemFilter) : [],
  };
}
