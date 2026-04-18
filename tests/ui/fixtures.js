import { expect, test as base } from '@playwright/test';
import { createUi } from './common.js';

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Request} Request */
/** @typedef {import('@playwright/test').Route} Route */
/** @typedef {ReturnType<typeof createUi>} Ui */

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
 */
async function installSpotifyRouteGuard(context) {
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
}

/** @typedef {import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions} PlaywrightTestContext */
/** @typedef {import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions} PlaywrightWorkerContext */

/** @type {import('@playwright/test').Fixtures<{ _spotifyRouteGuard: void, ui: Ui }, {}, PlaywrightTestContext, PlaywrightWorkerContext>} */
const fixtures = {
  _spotifyRouteGuard: [async ({ context }, use) => {
    await installSpotifyRouteGuard(context);
    try {
      await use();
    } finally {
      spotifyRouteDefinitionsByContext.delete(context);
    }
  }, { auto: true }],
  ui: async ({ page }, use) => {
    await use(createUi(page));
  },
};

const test = base.extend(fixtures);

/**
 * @param {BrowserContext} context
 * @param {SpotifyRouteDefinition[]} definitions
 * @returns {RecordedSpotifyRequest[]}
 */
export function installSpotifyRoutes(context, definitions) {
  const spotifyRouteDefinitions = spotifyRouteDefinitionsByContext.get(context);

  if (!spotifyRouteDefinitions) {
    throw new Error('Spotify routes have not been initialized for this test context.');
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
