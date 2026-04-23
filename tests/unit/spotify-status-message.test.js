import test from 'node:test';
import assert from 'node:assert/strict';

import { spotifyStatusMessage } from '#src/spotify-status-message.js';

test('returns mapped message for known non-5xx Spotify statuses', () => {
  assert.equal(spotifyStatusMessage(401, 'fallback'), 'Spotify session expired; please reconnect');
  assert.equal(spotifyStatusMessage(403, 'fallback'), 'Spotify permissions are missing; disconnect and reconnect');
  assert.equal(spotifyStatusMessage(404, 'fallback'), 'Requested Spotify item or playback device was not found');
  assert.equal(spotifyStatusMessage(429, 'fallback'), 'Spotify rate limit reached; please wait a moment and retry');
});

test('returns mapped message for 5xx statuses', () => {
  assert.equal(spotifyStatusMessage(500, 'fallback'), 'Spotify is temporarily unavailable; please try again shortly');
  assert.equal(spotifyStatusMessage(503, 'fallback'), 'Spotify is temporarily unavailable; please try again shortly');
});

test('returns fallback message for unmapped statuses', () => {
  assert.equal(spotifyStatusMessage(400, 'fallback text'), 'fallback text');
  assert.equal(spotifyStatusMessage(418, 'teapot fallback'), 'teapot fallback');
});
