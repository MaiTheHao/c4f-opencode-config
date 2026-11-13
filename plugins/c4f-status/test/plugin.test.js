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

function mockCtx() {
  const hooks = {};
  const synthetic = [];
  const ctx = {
    env: {},
    session: {
      hook: async (name, callback) => {
        hooks[name] = callback;
        return { dispose() {} };
      },
      synthetic: async (input) => {
        synthetic.push(input);
      },
    },
  };
  return { ctx, hooks, synthetic };
}

async function setup(t, { repos = behind.repos, options = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify(stateFileFor(repos)));
  const { ctx, hooks, synthetic } = mockCtx();
  const check = await run(ctx, { stateFile, ttlMs: 60_000, ...options });
  t.after(() => check.dispose());
  return { hooks, synthetic, check };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for condition');
}

test('injects one WARN part per request while behind', async (t) => {
  const { hooks } = await setup(t);
  const request = { system: [] };
  hooks.context(request);
  assert.equal(request.system.length, 1);

  hooks.context(request);
  assert.equal(request.system.length, 1, 'the marker prevents duplicate injection');
});

test('stays silent when the cached state is current', async (t) => {
  const { hooks } = await setup(t, {
    repos: [{ name: 'a', label: '~/a', branch: 'master', state: 'up-to-date', ahead: 0, behind: 0 }],
  });
  const request = { system: [] };
  hooks.context(request);
  assert.equal(request.system.length, 0);
});

test('banner is posted once per session', async (t) => {
  const { hooks, synthetic } = await setup(t);
  await hooks.prompt({ sessionID: 's1' });
  await hooks.prompt({ sessionID: 's1' });
  assert.equal(synthetic.length, 1);

  await hooks.prompt({ sessionID: 's2' });
  assert.equal(synthetic.length, 2);
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

  const { ctx } = mockCtx();
  const check = await run(ctx, {
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

  const { ctx } = mockCtx();
  const check = await run(ctx, {
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

test('disabled by env or option registers nothing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { ctx, hooks } = mockCtx();
  const check = await run(ctx, {
    enabled: false,
    stateFile: join(dir, 'state.json'),
  });
  t.after(() => check.dispose());
  assert.deepEqual(Object.keys(hooks), []);

  const second = mockCtx();
  second.ctx.env = { C4F_UPDATE_CHECK: '0' };
  const fromEnv = await run(second.ctx, {
    stateFile: join(dir, 'state.json'),
  });
  t.after(() => fromEnv.dispose());
  assert.deepEqual(Object.keys(second.hooks), []);
});
