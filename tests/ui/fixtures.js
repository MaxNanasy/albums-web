import { expect, test } from '@playwright/test';

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {import('@playwright/test').Route} Route */

/**
 * @typedef SpotifyRouteDefinition
 * @property {(request: Request) => boolean} match
 * @property {(route: Route, request: Request) => Promise<void>} handle
 */

/** @type {WeakMap<BrowserContext, SpotifyRouteDefinition[]>} */
const spotifyRouteDefinitionsByContext = new WeakMap();

test.beforeEach(async ({ context }) => {
  /** @type {SpotifyRouteDefinition[]} */
  const spotifyRouteDefinitions = [];
  spotifyRouteDefinitionsByContext.set(context, spotifyRouteDefinitions);

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
});

test.afterEach(async ({ context }) => {
  spotifyRouteDefinitionsByContext.delete(context);
});

/**
 * @param {BrowserContext} context
 * @param {...SpotifyRouteDefinition} definitions
 */
export function mockSpotify(context, ...definitions) {
  const spotifyRouteDefinitions = spotifyRouteDefinitionsByContext.get(context);

  if (!spotifyRouteDefinitions) {
    throw new Error('Spotify routes have not been initialized for this test context.');
  }

  spotifyRouteDefinitions.push(...definitions);
}

export { expect, test };
