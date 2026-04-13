/**
 * @param {number} status
 * @param {string} fallbackMessage
 */
export function spotifyStatusMessage(status, fallbackMessage) {
  if (status === 401) {
    return 'Spotify session expired. Please reconnect.';
  }
  if (status === 403) {
    return 'Spotify permissions are missing. Disconnect and reconnect.';
  }
  if (status === 404) {
    return 'Requested Spotify item or playback device was not found.';
  }
  if (status === 429) {
    return 'Spotify rate limit reached. Please wait a moment and retry.';
  }
  if (status >= 500) {
    return 'Spotify is temporarily unavailable. Please try again shortly.';
  }
  return fallbackMessage;
}
