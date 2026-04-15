import { expect, test } from '@playwright/test';

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {import('@playwright/test').Route} Route */

/**
 * @typedef RecordedSpotifyRequest
 * @property {string} method
 * @property {string} url
 * @property {string | null} postData
 */

/**
 * @typedef SpotifyRouteDefinition
 * @property {(request: Request) => boolean} match
 * @property {(route: Route, request: Request) => Promise<void>} handle
 */

/** @type {WeakMap<BrowserContext, SpotifyRouteDefinition[]>} */
const spotifyRouteDefinitionsByContext = new WeakMap();

/**
 * @param {BrowserContext} context
 * @param {SpotifyRouteDefinition[]} spotifyRouteDefinitions
 */
async function installSpotifyRouteGuard(context, spotifyRouteDefinitions) {
  await context.route(/^https:\/\/(api|accounts)\.spotify\.com\//, async (route) => {
    const request = route.request();

    for (const definition of spotifyRouteDefinitions) {
      if (definition.match(request)) {
        await definition.handle(route, request);
        return;
      }
    }

    throw new Error(`Unexpected Spotify request: ${request.method()} ${request.url()}`);
  });
}

test.beforeEach(async ({ context }) => {
  /** @type {SpotifyRouteDefinition[]} */
  const spotifyRouteDefinitions = [];
  spotifyRouteDefinitionsByContext.set(context, spotifyRouteDefinitions);

  await installSpotifyRouteGuard(context, spotifyRouteDefinitions);
});

test.afterEach(async ({ context }) => {
  spotifyRouteDefinitionsByContext.delete(context);
});

/**
 * @param {BrowserContext} context
 * @param {SpotifyRouteDefinition[]} definitions
 * @returns {RecordedSpotifyRequest[]}
 */
export function installSpotifyRoutes(context, definitions) {
  const spotifyRouteDefinitions = spotifyRouteDefinitionsByContext.get(context);

  if (!spotifyRouteDefinitions) {
    /** @type {SpotifyRouteDefinition[]} */
    const fallbackSpotifyRouteDefinitions = [];
    spotifyRouteDefinitionsByContext.set(context, fallbackSpotifyRouteDefinitions);
    void installSpotifyRouteGuard(context, fallbackSpotifyRouteDefinitions);
    return installSpotifyRoutes(context, definitions);
  }

  /** @type {RecordedSpotifyRequest[]} */
  const recordedRequests = [];

  spotifyRouteDefinitions.push(
    ...definitions.map(
      /** @returns {SpotifyRouteDefinition} */
      (definition) => ({
        match: definition.match,
        /**
         * @param {Route} route
         * @param {Request} request
         */
        handle: async (route, request) => {
          recordedRequests.push({
            method: request.method(),
            url: request.url(),
            postData: request.postData(),
          });
          await definition.handle(route, request);
        },
      }),
    ),
  );

  return recordedRequests;
}

export { expect, test };
