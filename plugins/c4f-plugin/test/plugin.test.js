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
  const hooks = {};
  const disposed = [];
  return {
    ctx: {
      env,
      session: {
        hook: async (name, callback) => {
          hooks[name] = callback;
          return {
            dispose: async () => {
              delete hooks[name];
              disposed.push(name);
            },
          };
        },
      },
    },
    hooks,
    disposed,
  };
}

async function setup(t, { repos = behind.repos, options = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify(stateFileFor(repos)));
  const { ctx, hooks, disposed } = mockCtx();
  const check = await run(ctx, { stateFile, ttlMs: 60_000, ...options });
  t.after(() => check.dispose());
  return { ctx, hooks, disposed, check, stateFile };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for condition');
}

test('exposes the cached state and registers the prompt hook', async (t) => {
  const { check, hooks } = await setup(t);
  const state = check.state();
  assert.equal(state.repos[0].name, 'c4f-opencode-config');
  assert.equal(state.repos[0].state, 'behind');
  assert.deepEqual(Object.keys(check).sort(), ['dispose', 'options', 'refresh', 'state']);
  assert.equal(typeof hooks.prompt, 'function');
  assert.equal(hooks.context, undefined, 'the system prompt is never rewritten');
});

test('appends the advisory to the first prompt of a session only', async (t) => {
  const { hooks } = await setup(t);

  const first = { sessionID: 's1', prompt: { text: 'hello' } };
  await hooks.prompt(first);
  assert.match(first.prompt.text, /^hello\n\n<c4f-update-check>/);
  assert.match(first.prompt.text, /~\/\.config\/opencode: 3 commit\(s\) behind origin\/master/);
  assert.doesNotMatch(first.prompt.text, /~\/\.agents\/skills/, 'current repos are not listed');

  const second = { sessionID: 's1', prompt: { text: 'again' } };
  await hooks.prompt(second);
  assert.equal(second.prompt.text, 'again', 'one advisory per session');

  const other = { sessionID: 's2', prompt: { text: 'hi' } };
  await hooks.prompt(other);
  assert.match(other.prompt.text, /<c4f-update-check>/);
});

test('stays silent when the cached state is current', async (t) => {
  const { hooks } = await setup(t, {
    repos: [{ name: 'a', label: '~/a', branch: 'master', state: 'up-to-date', ahead: 0, behind: 0 }],
  });
  const event = { sessionID: 's1', prompt: { text: 'hello' } };
  await hooks.prompt(event);
  assert.equal(event.prompt.text, 'hello');
});

test('never duplicates the advisory when the prompt already carries it', async (t) => {
  const { hooks } = await setup(t);
  const event = { sessionID: 's1', prompt: { text: 'hello\n\n<c4f-update-check>old</c4f-update-check>' } };
  await hooks.prompt(event);
  assert.equal(event.prompt.text, 'hello\n\n<c4f-update-check>old</c4f-update-check>');
});

test('dispose releases the prompt hook', async (t) => {
  const { check, hooks, disposed } = await setup(t);
  assert.equal(typeof hooks.prompt, 'function');
  await check.dispose();
  assert.deepEqual(disposed, ['prompt']);
  assert.equal(hooks.prompt, undefined);
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

test('disabled by env or option writes nothing and registers no hook', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');

  const off = mockCtx();
  const check = await run(off.ctx, { enabled: false, stateFile });
  t.after(() => check.dispose());
  assert.equal(check.state(), undefined);
  assert.deepEqual(off.hooks, {});
  await check.refresh();
  await assert.rejects(readFile(stateFile, 'utf8'));

  const env = mockCtx({ C4F_UPDATE_CHECK: '0' });
  const fromEnv = await run(env.ctx, { stateFile });
  t.after(() => fromEnv.dispose());
  assert.equal(fromEnv.state(), undefined);
  assert.deepEqual(env.hooks, {});
  await assert.rejects(readFile(stateFile, 'utf8'));
});
