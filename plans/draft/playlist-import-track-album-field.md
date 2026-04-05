## Issue

Android currently treats playlist import as if the Spotify response were shaped around a track-level `album` field. Spotify's playlist-items API actually returns playlist entry objects, with the imported item nested inside the entry. Because of that difference in response shape, Android can read the wrong nested field or skip albums that are present in the playlist-items response.

## Solution

Update the playlist import plan so it is based on the Spotify playlist-items endpoint itself, rather than on a track-centered assumption.

Describe the code change at a high level as:

- the playlist import logic should follow the Spotify playlist-items response shape, where each result is a playlist entry object containing the imported item
- album extraction should be aligned with that endpoint's nested response structure
- the parsing logic should be refactored so the expected endpoint shape is handled explicitly in one place
- entries that do not contain album data in the shape returned by the playlist-items endpoint should be ignored intentionally
- URI-based deduplication and pagination behavior should remain unchanged

The goal is to make Android's playlist import behavior match the Spotify playlist-items API contract, instead of assuming a different nested object layout.