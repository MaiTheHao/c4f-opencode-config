import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBanner, buildInstruction, MARKER } from '../src/warn.js';

const behind = {
  version: 1,
  checkedAt: Date.UTC(2026, 10, 13, 21, 40, 0),
  repos: [
    {
      name: 'c4f-opencode-config',
      label: '~/.config/opencode',
      branch: 'master',
      state: 'behind',
      ahead: 0,
      behind: 3,
    },
    {
      name: 'c4f-agent-skills',
      label: '~/.agents/skills',
      branch: 'master',
      state: 'not-installed',
    },
  ],
};

test('instruction names every repo that needs action', () => {
  const text = buildInstruction(behind);
  assert.ok(text.startsWith(MARKER));
  assert.match(text, /2026-11-13T21:40:00Z/);
  assert.match(text, /~\/\.config\/opencode: 3 commit\(s\) behind origin\/master/);
  assert.match(text, /~\/\.agents\/skills: not installed/);
  assert.match(text, /c4f-update/);
  assert.ok(text.trimEnd().endsWith('</c4f-update-check>'));
});

test('instruction is silent when everything is current', () => {
  const current = {
    checkedAt: Date.now(),
    repos: [{ name: 'a', label: '~/a', state: 'up-to-date' }],
  };
  assert.equal(buildInstruction(current), undefined);
  assert.equal(buildBanner(current), undefined);
  assert.equal(buildInstruction(undefined), undefined);
});

test('offline probes are labelled as last known', () => {
  const text = buildInstruction({
    checkedAt: Date.now(),
    repos: [{ name: 'a', label: '~/a', branch: 'master', state: 'behind', behind: 1, offline: true }],
  });
  assert.match(text, /offline, last known/);
});

test('banner is one line and counts commits', () => {
  const banner = buildBanner(behind);
  assert.equal(banner.split('\n').length, 1);
  assert.match(banner, /c4f-opencode-config \+3/);
  assert.match(banner, /c4f-agent-skills not installed/);
  assert.match(banner, /c4f-update skill/);
});
