import test from 'node:test';
import assert from 'node:assert/strict';

import { exportItemsData, importItemsData } from '../src/core/storage-transfer.js';

test('exportItemsData exports parsed items or empty array', () => {
  const exported = exportItemsData('[{"type":"album","uri":"spotify:album:a"}]', 'shuffle-by-album.items');
  assert.equal(exported.error, null);
  assert.deepEqual(exported.data, {
    'shuffle-by-album.items': [{ type: 'album', uri: 'spotify:album:a' }],
  });

  const empty = exportItemsData(null, 'shuffle-by-album.items');
  assert.equal(empty.error, null);
  assert.deepEqual(empty.data, { 'shuffle-by-album.items': [] });
});

test('importItemsData validates shape and filters invalid entries', () => {
  const parsed = importItemsData(
    JSON.stringify({
      'shuffle-by-album.items': [
        { type: 'album', uri: 'spotify:album:1', title: 'One' },
        { type: 'bad', uri: 'spotify:album:2' },
      ],
    }),
    'shuffle-by-album.items',
  );

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.items, [{ type: 'album', uri: 'spotify:album:1', title: 'One' }]);
  }

  const invalid = importItemsData('{"foo":[]}', 'shuffle-by-album.items');
  assert.equal(invalid.ok, false);
});
