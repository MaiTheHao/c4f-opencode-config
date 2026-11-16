import test from 'node:test';
import assert from 'node:assert/strict';
import { advisorySignature, buildInstruction, MARKER } from '../src/modules/check-for-update/warn.js';

const behind = {
  version: 1,
  checkedAt: Date.UTC(2026, 10, 13, 21, 40, 0),
  repos: [
    {
      name: 'c4f-opencode-config',
      label: '~/.config/opencode',
      branch: 'master',
      upstream: 'origin/master',
      state: 'behind',
      ahead: 0,
      behind: 3,
    },
    {
      name: 'c4f-agent-skills',
      label: '~/.agents/skills',
      state: 'not-installed',
    },
  ],
};

test('instruction is a marked block that names every pending repo', () => {
  const text = buildInstruction(behind);
  assert.match(text, new RegExp(`^${MARKER}`));
  assert.match(text, /<\/c4f-update-check>$/);
  assert.match(text, /~\/\.config\/opencode: 3 commit\(s\) behind origin\/master/);
  assert.match(text, /~\/\.agents\/skills: not installed/);
  assert.match(text, /c4f-update/);
});

test('instruction carries no timestamp and no slash-command reference', () => {
  const text = buildInstruction(behind);
  assert.doesNotMatch(text, /2026-11-13|checked /);
  assert.doesNotMatch(text, /Run \/c4f-update|toast/);
});

test('offline repos are labelled with the last known count', () => {
  const offline = {
    repos: [{ ...behind.repos[0], offline: true }],
  };
  const text = buildInstruction(offline);
  assert.match(text, /3 commit\(s\) behind origin\/master \(offline, last known\)/);
});

test('instruction is silent when everything is current', () => {
  const current = {
    checkedAt: Date.now(),
    repos: [{ name: 'a', label: '~/a', state: 'up-to-date' }],
  };
  assert.equal(buildInstruction(current), undefined);
  assert.equal(buildInstruction(undefined), undefined);
});

test('signature tracks repo identity, state and count only', () => {
  assert.equal(advisorySignature(behind), 'c4f-opencode-config:behind:3|c4f-agent-skills:not-installed:0');
  assert.equal(advisorySignature({ repos: [{ ...behind.repos[0], behind: 4 }] }), 'c4f-opencode-config:behind:4');
  assert.equal(advisorySignature({ repos: [{ name: 'a', state: 'up-to-date' }] }), '');
  assert.equal(advisorySignature(undefined), '');
});
