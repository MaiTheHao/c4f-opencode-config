import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  isFresh,
  needsAction,
  probeRepo,
  readState,
  writeState,
} from '../src/modules/check-for-update/probe.js';

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

test('probeRepo resolves @{u} and reports behind on a custom remote', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { work, clone } = await makePair(root);
  await git(work, 'remote', 'rename', 'origin', 'upstream');
  await git(clone, 'remote', 'rename', 'origin', 'upstream');

  await writeFile(join(work, 'b.txt'), 'b\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-qm', 'next');
  await git(work, 'push', '-q', 'upstream', 'master');

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.state, 'behind');
  assert.equal(result.behind, 1);
  assert.equal(result.ahead, 0);
  assert.equal(result.branch, 'master');
  assert.equal(result.upstream, 'upstream/master');
  assert.ok(result.head);
});

test('probeRepo reports up-to-date for a clean repo', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { clone } = await makePair(root);

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.state, 'up-to-date');
  assert.equal(result.ahead, 0);
  assert.equal(result.behind, 0);
  assert.equal(result.upstream, 'origin/master');
});

test('probeRepo reports up-to-date when only local commits are ahead', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { clone } = await makePair(root);
  await writeFile(join(clone, 'local.txt'), 'local\n');
  await git(clone, 'add', '-A');
  await git(clone, 'commit', '-qm', 'local');

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.state, 'up-to-date');
  assert.equal(result.ahead, 1);
  assert.equal(result.behind, 0);
});

test('probeRepo reports not-installed for a missing path', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await probeRepo({ name: 'gone', role: 'skills', path: join(root, 'nope'), branch: 'master' });
  assert.equal(result.state, 'not-installed');
  assert.equal(result.name, 'gone');
});

test('probeRepo accepts a .git file from a worktree', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { work } = await makePair(root);
  const tree = join(root, 'tree');
  await git(work, 'worktree', 'add', '-q', '-b', 'wt', tree);
  await git(tree, 'branch', '--set-upstream-to=origin/master');

  const result = await probeRepo({ name: 'tree', role: 'main', path: tree, branch: 'master' });
  assert.equal(result.state, 'up-to-date');
  assert.equal(result.upstream, 'origin/master');
  assert.equal(result.path, tree);
});

test('probeRepo falls back to origin/<branch> when the branch has no upstream', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { work, clone } = await makePair(root);
  await git(clone, 'branch', '--unset-upstream');

  await writeFile(join(work, 'b.txt'), 'b\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-qm', 'next');
  await git(work, 'push', '-q', 'origin', 'master');

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.state, 'behind');
  assert.equal(result.behind, 1);
  assert.equal(result.upstream, 'origin/master');
  assert.equal(result.inferredUpstream, true);
});

test('probeRepo reports unknown when the branch has no upstream', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'plain');
  await run('git', ['init', '--quiet', repo], { env });

  const result = await probeRepo({ name: 'plain', role: 'main', path: repo, branch: 'master' });
  assert.equal(result.state, 'unknown');
  assert.match(result.error, /no upstream/);
});

test('probeRepo keeps previous state when fetch fails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { work, clone } = await makePair(root);
  await writeFile(join(work, 'b.txt'), 'b\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-qm', 'next');
  await git(work, 'push', '-q', 'origin', 'master');

  const target = { name: 'repo', role: 'main', path: clone, branch: 'master' };
  const previous = await probeRepo(target);
  assert.equal(previous.state, 'behind');
  assert.equal(previous.behind, 1);

  await git(clone, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
  const result = await probeRepo(target, { previous });

  assert.equal(result.state, 'behind');
  assert.equal(result.behind, previous.behind);
  assert.equal(result.offline, true);
});

test('probeRepo falls back to local refs when offline without previous state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-probe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { clone } = await makePair(root);
  await git(clone, 'remote', 'set-url', 'origin', join(root, 'missing.git'));

  const result = await probeRepo({ name: 'repo', role: 'main', path: clone, branch: 'master' });
  assert.equal(result.offline, true);
  assert.equal(result.state, 'up-to-date');
  assert.equal(result.behind, 0);
});

test('isFresh and needsAction drive the cache decision', () => {
  const state = { version: 1, checkedAt: 1_000, repos: [{ state: 'behind', behind: 2 }] };
  assert.equal(isFresh(state, 500, 1_400), true);
  assert.equal(isFresh(state, 500, 1_600), false);
  assert.equal(isFresh(undefined), false);
  assert.equal(needsAction(state), true);
  assert.equal(needsAction({ repos: [{ state: 'up-to-date' }] }), false);
  assert.equal(needsAction({ repos: [{ state: 'not-installed' }] }), true);
  assert.equal(needsAction({ repos: [{ state: 'unknown' }] }), false);
  assert.equal(needsAction(undefined), false);
});

test('state cache round-trips and rejects foreign shapes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'nested', 'state.json');
  const state = { version: 1, checkedAt: 42, repos: [{ name: 'x', state: 'behind', behind: 1 }] };

  await writeState(file, state);
  assert.deepEqual(await readState(file), state);
  assert.deepEqual(await readdir(join(root, 'nested')), ['state.json']);

  await writeFile(file, JSON.stringify({ version: 99, repos: [] }));
  assert.equal(await readState(file), undefined);

  await writeFile(file, 'not json');
  assert.equal(await readState(file), undefined);
});

test('concurrent writes leave valid JSON', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'c4f-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'state.json');
  const states = Array.from({ length: 8 }, (_, index) => ({
    version: 1,
    checkedAt: index,
    repos: [{ name: `repo-${index}`, state: 'up-to-date' }],
  }));

  await Promise.all(states.map((state) => writeState(file, state)));
  const result = await readState(file);

  assert.ok(result);
  assert.ok(states.some((state) => state.checkedAt === result.checkedAt));
  const files = await readdir(root);
  assert.ok(files.every((name) => !name.endsWith('.tmp')));
});
