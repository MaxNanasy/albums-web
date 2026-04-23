/**
 * @param {number} status
 * @param {string} fallbackMessage
 */
export function spotifyStatusMessage(status, fallbackMessage) {
  if (status === 401) {
    return 'Spotify session expired; please reconnect';
  }
  if (status === 403) {
    return 'Spotify permissions are missing; disconnect and reconnect';
  }
  if (status === 404) {
    return 'Requested Spotify item or playback device was not found';
  }
  if (status === 429) {
    return 'Spotify rate limit reached; please wait a moment and retry';
  }
  if (status >= 500) {
    return 'Spotify is temporarily unavailable; please try again shortly';
  }
  return fallbackMessage;
}
