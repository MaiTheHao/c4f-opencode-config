import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSession, bannerSignature, toastOptions } from '../src/modules/check-for-update/notify.js';

const behind = {
  version: 1,
  repos: [
    { name: 'c4f-opencode-config', state: 'behind', behind: 3 },
    { name: 'c4f-agent-skills', state: 'up-to-date', behind: 0 },
  ],
};

test('signature tracks repo identity, state and count only', () => {
  assert.equal(bannerSignature(behind), 'c4f-opencode-config:behind:3');
  assert.equal(bannerSignature({ repos: [{ ...behind.repos[0], behind: 4 }] }), 'c4f-opencode-config:behind:4');
  assert.equal(bannerSignature({ repos: [behind.repos[1]] }), '');
  assert.equal(bannerSignature(undefined), '');
});

test('toast is a warning that points at the slash command', () => {
  const toast = toastOptions(behind, 'ses_1');
  assert.equal(toast.variant, 'warning');
  assert.equal(toast.sessionID, 'ses_1');
  assert.match(toast.message, /\/c4f-update/);
  assert.equal(toastOptions({ repos: [behind.repos[1]] }), undefined);
  assert.equal(toastOptions(undefined), undefined);
});

test('toast omits sessionID outside a session', () => {
  assert.equal('sessionID' in toastOptions(behind), false);
});

test('active session comes from the current route', () => {
  assert.equal(activeSession({ current: () => ({ type: 'session', sessionID: 'ses_1' }) }), 'ses_1');
  assert.equal(activeSession({ current: () => ({ type: 'home' }) }), undefined);
  assert.equal(activeSession(undefined), undefined);
});
