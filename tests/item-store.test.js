import test from 'node:test';
import assert from 'node:assert/strict';

import { ItemStore } from '../src/core/item-store.js';

function installLocalStorage() {
  /** @type {Map<string, string>} */
  const store = new Map();
  globalThis.localStorage = /** @type {Storage} */ (/** @type {unknown} */ ({
    getItem: (/** @type {string} */ key) => (store.has(key) ? store.get(key) : null),
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
      store.set(key, value);
    },
    removeItem: (/** @type {string} */ key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    length: 0,
  }));
  return store;
}

test('ItemStore normalizes import/get and supports remove/restore', () => {
  installLocalStorage();
  const itemStore = new ItemStore({ items: 'shuffle-by-album.items' });

  const imported = itemStore.importFromJson(
    JSON.stringify({
      'shuffle-by-album.items': [
        { type: 'album', uri: 'spotify:album:1', title: 'A' },
        { type: 'playlist', uri: 'spotify:playlist:2' },
      ],
    }),
  );
  assert.equal(imported.ok, true);

  const items = itemStore.getItems();
  assert.deepEqual(items, [
    { type: 'album', uri: 'spotify:album:1', title: 'A' },
    { type: 'playlist', uri: 'spotify:playlist:2', title: 'spotify:playlist:2' },
  ]);

  const removed = itemStore.removeByUri('spotify:album:1');
  assert.ok(removed);
  if (removed) {
    const restored = itemStore.restoreItem(removed.removedItem, removed.removedIndex);
    assert.deepEqual(restored, { ok: true });
  }
});
