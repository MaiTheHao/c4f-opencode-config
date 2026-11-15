import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/modules/check-for-update/index.js';

function stateFileFor(repos, checkedAt = Date.now()) {
  return { version: 1, checkedAt, repos };
}

const behind = stateFileFor([
  { name: 'c4f-opencode-config', label: '~/.config/opencode', branch: 'master', state: 'behind', ahead: 0, behind: 3 },
  { name: 'c4f-agent-skills', label: '~/.agents/skills', branch: 'master', state: 'up-to-date', ahead: 0, behind: 0 },
]);

function mockCtx(env = {}) {
  return { env };
}

async function setup(t, { repos = behind.repos, options = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify(stateFileFor(repos)));
  const check = await run(mockCtx(), { stateFile, ttlMs: 60_000, ...options });
  t.after(() => check.dispose());
  return { check, stateFile };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for condition');
}

test('exposes the cached state without touching the model', async (t) => {
  const { check } = await setup(t);
  const state = check.state();
  assert.equal(state.repos[0].name, 'c4f-opencode-config');
  assert.equal(state.repos[0].state, 'behind');
  // The module returns no hook registrations; its only output is the state file.
  assert.deepEqual(Object.keys(check).sort(), ['dispose', 'options', 'refresh', 'state']);
});

test('returns stale cache immediately and refreshes the configured repos', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify({
    version: 1,
    checkedAt: 1,
    repos: [{ name: 'stale', state: 'up-to-date' }],
  }));

  const check = await run(mockCtx(), {
    stateFile,
    ttlMs: 60_000,
    repos: [{ name: 'custom', role: 'main', path: join(dir, 'missing'), branch: 'master' }],
  });
  t.after(() => check.dispose());

  assert.equal(check.state().repos[0].name, 'stale');
  await check.refresh();

  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(state.repos[0].name, 'custom');
  assert.equal(state.repos[0].state, 'not-installed');
  assert.equal(check.state().repos[0].name, 'custom');
});

test('schedules from cache age and stops after dispose', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  const ttlMs = 200;
  await writeFile(stateFile, JSON.stringify({
    version: 1,
    checkedAt: Date.now() - 100,
    repos: [{ name: 'stale', state: 'up-to-date' }],
  }));

  const check = await run(mockCtx(), {
    stateFile,
    ttlMs,
    repos: [{ name: 'custom', role: 'main', path: join(dir, 'missing'), branch: 'master' }],
  });
  t.after(() => check.dispose());

  assert.equal(check.state().repos[0].name, 'stale');
  await waitFor(async () => {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    return state.repos[0]?.name === 'custom';
  }, 160);

  await check.dispose();
  const written = JSON.parse(await readFile(stateFile, 'utf8')).checkedAt;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).checkedAt, written);
});

test('disabled by env or option writes nothing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');

  const check = await run(mockCtx(), { enabled: false, stateFile });
  t.after(() => check.dispose());
  assert.equal(check.state(), undefined);
  await check.refresh();
  await assert.rejects(readFile(stateFile, 'utf8'));

  const fromEnv = await run(mockCtx({ C4F_UPDATE_CHECK: '0' }), { stateFile });
  t.after(() => fromEnv.dispose());
  assert.equal(fromEnv.state(), undefined);
  await assert.rejects(readFile(stateFile, 'utf8'));
});
