import test from 'node:test';
import assert from 'node:assert/strict';

import { ErrorReporter } from '#src/core/error-reporter.js';

test('ErrorReporter reports and cooldown-gates toasts', () => {
  /** @type {{message: string; type: 'success' | 'info' | 'error' | undefined}[]} */
  const toasts = [];
  /** @type {string[]} */
  const authStatuses = [];
  const reporter = new ErrorReporter({
    setAuthStatus: (message) => authStatuses.push(message),
    setPlaybackStatus: () => {},
    showToast: (message, type) => toasts.push({ message, type }),
  });

  reporter.report(new Error('boom'), {
    context: 'auth',
    fallbackMessage: 'Fallback',
    authStatusMessage: 'Auth bad',
    toastMode: 'cooldown',
    toastKey: 'same',
  });
  reporter.report(new Error('boom2'), {
    context: 'auth',
    fallbackMessage: 'Fallback 2',
    toastMode: 'cooldown',
    toastKey: 'same',
  });

  assert.equal(authStatuses[0], 'Auth bad');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
});

test('ErrorReporter.run returns undefined after report on thrown task', async () => {
  let called = false;
  const reporter = new ErrorReporter({
    setAuthStatus: () => {},
    setPlaybackStatus: () => {},
    showToast: () => {
      called = true;
    },
  });

  const result = await reporter.run(() => {
    throw new Error('x');
  }, { context: 'test', fallbackMessage: 'Oops' });

  assert.equal(result, undefined);
  assert.equal(called, true);
});
