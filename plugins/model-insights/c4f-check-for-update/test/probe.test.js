import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  isFresh,
  needsAction,
  probeRepo,
  readState,
  writeState,
} from '../src/probe.js';

const run = promisify(execFile);
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

async function git(cwd, ...args) {
  const { stdout } = await run('git', ['-C', cwd, ...args], { env });
  return stdout.trim();
}

async function makePair(root) {
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  const clone = join(root, 'clone');
  await run('git', ['init', '--bare', '--quiet', origin], { env });
  await run('git', ['init', '--quiet', work], { env });
  await git(work, 'checkout', '-qb', 'master');
  await writeFile(join(work, 'a.txt'), 'a\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-qm', 'base');
  await git(work, 'remote', 'add', 'origin', origin);
  await git(work, 'push', '-qu', 'origin', 'master');
  await run('git', ['clone', '--quiet', origin, clone], { env });
  return { origin, work, clone };
}

test('probeRepo reports a clean fast-forward as behind', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { work, clone } = await makePair(root);
  await writeFile(join(work, 'b.txt'), 'b\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-qm', 'next');
  await git(work, 'push', '-q', 'origin', 'master');

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.state, 'behind');
  assert.equal(result.behind, 1);
  assert.equal(result.ahead, 0);
  assert.equal(result.branch, 'master');
  assert.ok(result.head);
});

test('probeRepo reports up-to-date and missing repos', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { clone } = await makePair(root);

  const fresh = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(fresh.state, 'up-to-date');
  assert.equal(fresh.behind, 0);

  const missing = await probeRepo({ name: 'gone', role: 'skills', path: join(root, 'nope'), branch: 'master' });
  assert.equal(missing.state, 'not-installed');
  assert.equal(missing.name, 'gone');
});

test('isFresh and needsAction drive the cache decision', () => {
  const state = { version: 1, checkedAt: 1_000, repos: [{ state: 'behind', behind: 2 }] };
  assert.equal(isFresh(state, 500, 1_400), true);
  assert.equal(isFresh(state, 500, 1_600), false);
  assert.equal(isFresh(undefined), false);
  assert.equal(needsAction(state), true);
  assert.equal(needsAction({ repos: [{ state: 'up-to-date' }] }), false);
  assert.equal(needsAction({ repos: [{ state: 'not-installed' }] }), true);
  assert.equal(needsAction(undefined), false);
});

test('state cache round-trips and rejects foreign shapes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'nested', 'state.json');
  const state = { version: 1, checkedAt: 42, repos: [{ name: 'x', state: 'behind', behind: 1 }] };

  await writeState(file, state);
  assert.deepEqual(await readState(file), state);

  await writeFile(file, JSON.stringify({ version: 99, repos: [] }));
  assert.equal(await readState(file), undefined);

  await writeFile(file, 'not json');
  assert.equal(await readState(file), undefined);
});
