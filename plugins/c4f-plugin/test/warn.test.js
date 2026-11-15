import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBanner } from '../src/modules/check-for-update/warn.js';

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

test('banner is one line and counts commits', () => {
  const banner = buildBanner(behind);
  assert.equal(banner.split('\n').length, 1);
  assert.match(banner, /c4f-opencode-config \+3/);
  assert.match(banner, /c4f-agent-skills not installed/);
  assert.match(banner, /\/c4f-update/);
});

test('banner is silent when everything is current', () => {
  const current = {
    checkedAt: Date.now(),
    repos: [{ name: 'a', label: '~/a', state: 'up-to-date' }],
  };
  assert.equal(buildBanner(current), undefined);
  assert.equal(buildBanner(undefined), undefined);
});

test('banner never mentions prompt instructions', () => {
  const banner = buildBanner(behind);
  assert.doesNotMatch(banner, /skill tool|system prompt|Do not run git/);
});
