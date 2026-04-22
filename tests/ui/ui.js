/** @typedef {import('@playwright/test').Page} Page */

/** @param {string} text */
function exactText(text) {
  return new RegExp(`^${RegExp.escape(text)}$`);
}

/** @param {Page} page */
export function makeUi(page) {
  return {
    auth: {
      status: page.locator('#auth-status'),
      connectButton: page.getByRole('button', { name: 'Connect', exact: true }),
      disconnectButton: page.getByRole('button', { name: 'Disconnect', exact: true }),
    },
    playback: {
      status: page.locator('#playback-status'),
      startButton: page.getByRole('button', { name: 'Start', exact: true }),
      reattachButton: page.getByRole('button', { name: 'Reattach', exact: true }),
      nextButton: page.getByRole('button', { name: 'Next', exact: true }),
      stopButton: page.getByRole('button', { name: 'Stop', exact: true }),
      queueItems: {
        /** @param {string} text */
        row(text) {
          return page.locator('#queue-list > li').filter({ hasText: exactText(text) });
        },
      },
    },
    savedItems: {
      uriInput: page.getByPlaceholder('https://open.spotify.com/(album|playlist)/...'),
      addButton: page.getByRole('button', { name: 'Add', exact: true }),
      importAlbumsButton: page.getByRole('button', { name: 'Import Albums', exact: true }),
      /** @param {string} text */
      row(text) {
        return page.locator('#item-list > li').filter({ has: page.getByText(text, { exact: true }) });
      },
      /** @param {string} itemText */
      removeButton(itemText) {
        return this.row(itemText).getByRole('button', { name: 'Remove', exact: true });
      },
    },
    recentlyRemoved: {
      section: page.locator('#recently-removed-section'),
      count: page.locator('#recently-removed-count'),
      /** @param {string} text */
      row(text) {
        return page.locator('#recently-removed-list > li').filter({
          has: page.getByText(text, { exact: true }),
        });
      },
      purgeAllButton: page.getByRole('button', { name: 'Purge All', exact: true }),
      /** @param {string} itemText */
      restoreButton(itemText) {
        return this.row(itemText).getByRole('button', { name: 'Restore', exact: true });
      },
    },
    toasts: {
      /** @param {string} text */
      instance(text) {
        return page.locator('#toast-stack .toast').filter({
          has: page.locator('.toast-message', { hasText: exactText(text) }),
        });
      },
      /** @param {string} toastText */
      undoButton(toastText) {
        return this.instance(toastText).getByRole('button', { name: 'Undo', exact: true });
      },
    },
    storage: {
      json: page.locator('#storage-json'),
      exportDataButton: page.getByRole('button', { name: 'Export Data', exact: true }),
      importDataButton: page.getByRole('button', { name: 'Import Data', exact: true }),
    },
  };
}
