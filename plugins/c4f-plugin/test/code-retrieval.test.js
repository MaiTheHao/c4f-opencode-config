import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SCRIPTS_DIR,
  normalizeOptions,
  resolveDbPath,
  resolveRoot,
} from '../src/modules/code-retrieval/config.js';
import {
  buildArgs,
  normalizeArgs,
  registerCodeRetrievalTool,
  run,
} from '../src/modules/code-retrieval/index.js';

const DB_REL = 'local/agents/retrieval/code_bm25.db';

const HITS_PAYLOAD = {
  query: 'jwt validate',
  index: { indexed: 1, skipped: 907, removed: 0 },
  hits: [
    { score: 22.7037, file_path: 'src/AccessTokenStrategy.java', symbol: 'validateToken', node_type: 'method_declaration', start_line: 44, end_line: 47, content: 'ignored' },
    { score: 12.1, file_path: 'src/JwtProvider.java', symbol: 'validateToken', node_type: 'method_declaration', start_line: 66, end_line: 73, content: 'ignored' },
  ],
};

async function makeRoot(t, { initialized = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  if (initialized) {
    const dbPath = join(dir, DB_REL);
    await mkdir(join(dbPath, '..'), { recursive: true });
    await writeFile(dbPath, '');
  }
  return dir;
}

function toolCtx(root, env = {}) {
  const tools = new Map();
  return {
    tools,
    env,
    location: { directory: root },
    tool: {
      transform: async (mutate) => {
        mutate({
          add(tool) {
            tools.set(tool.name, tool);
          },
        });
        return async () => tools.delete('code_retrieval');
      },
    },
  };
}

function fakeRunner(result = { ok: true, code: 0, stdout: JSON.stringify(HITS_PAYLOAD), stderr: '' }) {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    return typeof result === 'function' ? result(call) : result;
  };
  return { runner, calls };
}

async function execute(t, { input = {}, result, options = {}, root, initialized = true } = {}) {
  const dir = root ?? await makeRoot(t, { initialized });
  const ctx = toolCtx(dir);
  const { runner, calls } = fakeRunner(result);
  const registration = await registerCodeRetrievalTool({
    ctx,
    options: normalizeOptions(options, {}),
    runner,
  });
  const tool = ctx.tools.get('code_retrieval');
  const out = await tool.execute(input, { signal: undefined });
  return { out, calls, tool, registration, ctx, dir };
}

test('search on an initialized repo syncs and renders a hit table', async (t) => {
  const { out, calls, tool, dir } = await execute(t, { input: { query: 'jwt validate' } });
  const args = calls[0].args;

  assert.equal(tool.options.codemode, true);
  assert.deepEqual(args.slice(1, 5), ['search', 'jwt validate', '--top-k', '5']);
  assert.ok(args.includes('--json'));
  assert.ok(args.includes('--sync'), 'an initialized repo refreshes before searching');
  assert.equal(args[args.indexOf('--root') + 1], dir);

  assert.match(out.content, /2 hit\(s\)/);
  assert.match(out.content, /index: 1 updated, 907 unchanged/);
  assert.match(out.content, /`validateToken`/);
  assert.equal(out.metadata.hits, 2);
  assert.equal(out.metadata.initialized, true);
  assert.equal(out.metadata.synced, true);
});

test('search without a database reports NOT_INITIALIZED and never spawns python', async (t) => {
  const { out, calls, dir } = await execute(t, { input: { query: 'jwt' }, initialized: false });

  assert.equal(calls.length, 0);
  assert.match(out.content, /NOT_INITIALIZED/);
  assert.match(out.content, new RegExp(join(dir, DB_REL).replaceAll('/', '\\/')));
  assert.match(out.content, /action: "index"/);
  assert.equal(out.metadata.initialized, false);
});

test('index initializes the repository and reports the database', async (t) => {
  const { out, calls } = await execute(t, {
    input: { action: 'index' },
    initialized: false,
    result: { ok: true, code: 0, stdout: JSON.stringify({ indexed: 3, skipped: 900, removed: 1, db: '/db.sqlite' }), stderr: '' },
  });

  assert.deepEqual(calls[0].args.slice(1, 3), ['index', '--root']);
  assert.ok(!calls[0].args.includes('--sync'), 'index does not need a second sync pass');
  assert.match(out.content, /Index synced .*: 3 updated, 900 unchanged, 1 removed/);
  assert.equal(out.metadata.initialized, true);
});

test('sync: false skips the refresh on an initialized repo', async (t) => {
  const { calls } = await execute(t, { input: { query: 'jwt', sync: false } });
  assert.ok(!calls[0].args.includes('--sync'));
});

test('root argument overrides the session directory and gates on that database', async (t) => {
  const other = await makeRoot(t, { initialized: false });
  const { calls, out } = await execute(t, { input: { query: 'jwt', root: other } });
  assert.equal(calls.length, 0);
  assert.match(out.content, /NOT_INITIALIZED/);
  assert.ok(out.content.includes(other));
});

test('root follows the session location, not the plugin setup location', async () => {
  const options = normalizeOptions({}, {});
  const moved = '/repo/moved-workspace';
  const ctx = {
    location: { directory: '/repo/setup-workspace' },
    session: { get: async ({ sessionID }) => ({ location: { directory: sessionID === 'ses_moved' ? moved : '/repo/other' } }) },
  };

  assert.equal(await resolveRoot({ options, ctx, sessionID: 'ses_moved' }), moved);
  assert.equal(
    await resolveRoot({ options, ctx, input: { root: 'sub' }, sessionID: 'ses_moved' }),
    `${moved}/sub`,
  );
  assert.equal(await resolveRoot({ options, ctx }), '/repo/setup-workspace');
});

test('session lookup failures fall back to the setup location', async () => {
  const options = normalizeOptions({}, {});
  const broken = {
    location: { directory: '/repo/setup' },
    session: { get: async () => { throw new Error('rpc unavailable'); } },
  };
  assert.equal(await resolveRoot({ options, ctx: broken, sessionID: 'ses_1' }), '/repo/setup');

  const noDirectory = {
    location: { directory: '/repo/setup' },
    session: { get: async () => ({ location: {} }) },
  };
  assert.equal(await resolveRoot({ options, ctx: noDirectory, sessionID: 'ses_1' }), '/repo/setup');
});

test('an explicit root beats the session location', async () => {
  const options = normalizeOptions({}, {});
  const ctx = { location: { directory: '/repo/setup' }, session: { get: async () => ({ location: { directory: '/repo/session' } }) } };
  assert.equal(await resolveRoot({ options, ctx, input: { root: '/explicit' }, sessionID: 'ses_1' }), '/explicit');
});

test('a moved session searches and gates on its new workspace', async (t) => {
  const setupDir = await makeRoot(t, { initialized: true });
  const movedDir = await makeRoot(t, { initialized: true });
  const ctx = toolCtx(setupDir);
  ctx.session = { get: async () => ({ location: { directory: movedDir } }) };
  const { runner, calls } = fakeRunner();

  await registerCodeRetrievalTool({ ctx, options: normalizeOptions({}, {}), runner });
  await ctx.tools.get('code_retrieval').execute({ query: 'jwt' }, { sessionID: 'ses_moved' });

  assert.equal(calls[0].args[calls[0].args.indexOf('--root') + 1], movedDir);
});

test('the database path mirrors the python default and honours --db', () => {
  assert.equal(resolveDbPath({ options: normalizeOptions({}, {}), root: '/repo' }), `/repo/${DB_REL}`);
  assert.equal(resolveDbPath({ options: normalizeOptions({ db: '/tmp/x.db' }, {}), root: '/repo' }), '/tmp/x.db');
  assert.equal(resolveDbPath({ options: normalizeOptions({ db: 'rel.db' }, {}), root: '/repo' }), '/repo/rel.db');
});

test('argument validation reports actionable errors instead of calling python', async (t) => {
  const cases = [
    [{ action: 'explode' }, /unknown action/],
    [{ action: 'search' }, /query is required/],
    [{ query: 'x', top_k: 0 }, /top_k must be an integer between 1 and 50/],
    [{ query: 'x', top_k: 99 }, /top_k must be an integer/],
  ];

  for (const [input, pattern] of cases) {
    const { out, calls } = await execute(t, { input });
    assert.equal(calls.length, 0, 'invalid input must not spawn python');
    assert.match(out.content, pattern);
  }
});

test('normalizeArgs keeps sync tri-state (auto when omitted)', () => {
  assert.deepEqual(normalizeArgs({ query: ' jwt ' }), {
    action: 'search',
    query: 'jwt',
    topK: 5,
    sync: undefined,
    root: '',
  });
  assert.equal(normalizeArgs({ query: 'x', sync: false }).sync, false);
  assert.equal(normalizeArgs({ query: 'x', top_k: 50 }).topK, 50);
});

test('buildArgs adds --db only when configured', () => {
  const args = { action: 'search', query: 'q', topK: 3, sync: false };
  assert.ok(!buildArgs({ options: normalizeOptions({}, {}), args, root: '/repo' }).includes('--db'));
  assert.ok(buildArgs({ options: normalizeOptions({ db: '/tmp/x.db' }, {}), args, root: '/repo' }).includes('--db'));
});

test('missing python interpreter is reported with a fix', async (t) => {
  const { out } = await execute(t, {
    input: { query: 'jwt' },
    result: { ok: false, code: null, stdout: '', stderr: '', spawnError: Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }) },
  });
  assert.match(out.content, /Python interpreter not found/);
  assert.match(out.content, /C4F_RETRIEVAL_PYTHON/);
});

test('a timeout is reported with the configured budget', async (t) => {
  const { out } = await execute(t, {
    input: { query: 'jwt' },
    result: { ok: false, code: null, stdout: '', stderr: '', timedOut: true },
    options: { timeoutMs: 1234 },
  });
  assert.match(out.content, /timed out after 1234 ms/);
});

test('falls back to an unsynced search on a sync timeout', async (t) => {
  let attempts = 0;
  const { out, calls, registration, dir } = await execute(t, {
    input: { query: 'jwt' },
    result: () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, code: null, stdout: '', stderr: '', timedOut: true }
        : { ok: true, code: 0, stdout: JSON.stringify(HITS_PAYLOAD), stderr: '' };
    },
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('--sync'));
  assert.ok(!calls[1].args.includes('--sync'));
  assert.match(out.content, /index not refreshed: sync timed out/);
  assert.equal(out.metadata.synced, false);
  assert.equal(out.metadata.degraded, 'sync-timeout');
  assert.equal(registration.lastSyncedAt.has(dir), false);
});

test('no fallback when sync is false', async (t) => {
  const { out, calls } = await execute(t, {
    input: { query: 'jwt', sync: false },
    result: { ok: false, code: null, stdout: '', stderr: '', timedOut: true },
  });

  assert.equal(calls.length, 1);
  assert.match(out.content, /^\*\*ERROR\*\*/);
});

test('no fallback for action=index', async (t) => {
  const { out, calls } = await execute(t, {
    input: { action: 'index' },
    result: { ok: false, code: null, stdout: '', stderr: '', timedOut: true },
  });

  assert.equal(calls.length, 1);
  assert.match(out.content, /^\*\*ERROR\*\*/);
});

test('reports the original failure when the retry also fails', async (t) => {
  let attempts = 0;
  const { out, calls } = await execute(t, {
    input: { query: 'jwt' },
    options: { timeoutMs: 1234 },
    result: () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, code: null, stdout: '', stderr: '', timedOut: true }
        : { ok: false, code: 1, stdout: '', stderr: 'retry failed' };
    },
  });

  assert.equal(calls.length, 2);
  assert.match(out.content, /timed out after 1234 ms/);
  assert.doesNotMatch(out.content, /retry failed/);
});

test('a failing indexer surfaces stderr and the dependency hint', async (t) => {
  const { out } = await execute(t, {
    input: { query: 'jwt' },
    result: { ok: false, code: 1, stdout: '', stderr: "ModuleNotFoundError: No module named 'tree_sitter'" },
  });
  assert.match(out.content, /exited with code 1/);
  assert.match(out.content, /ModuleNotFoundError/);
  assert.match(out.content, /pip install tree-sitter/);
});

test('invalid JSON output is reported, not thrown', async (t) => {
  const { out } = await execute(t, {
    input: { query: 'jwt' },
    result: { ok: true, code: 0, stdout: 'Traceback (most recent call last)', stderr: '' },
  });
  assert.match(out.content, /invalid JSON/);
});

test('a missing scripts directory is reported with a fix', async (t) => {
  const { out, calls } = await execute(t, {
    input: { query: 'jwt' },
    options: { scriptsDir: '/nope/missing' },
  });
  assert.equal(calls.length, 0);
  assert.match(out.content, /Retrieval indexer not found/);
  assert.match(out.content, /C4F_RETRIEVAL_SCRIPTS/);
});

test('no results still returns a usable message', async (t) => {
  const { out } = await execute(t, {
    input: { query: 'nothing' },
    result: { ok: true, code: 0, stdout: JSON.stringify({ query: 'nothing', index: null, hits: [] }), stderr: '' },
  });
  assert.match(out.content, /0 hit\(s\)/);
  assert.match(out.content, /No matching chunk/);
});

test('the tool is not registered when the runtime lacks tool.transform', async () => {
  const registration = await registerCodeRetrievalTool({
    ctx: { location: { directory: '/repo' } },
    options: normalizeOptions({}, {}),
  });
  assert.equal(registration, undefined);
});

test('dispose removes the registered tool', async (t) => {
  const { registration, ctx } = await execute(t, { input: { query: 'jwt' }, dir: undefined });
  assert.ok(ctx.tools.has('code_retrieval'));
  await registration.dispose();
  assert.ok(!ctx.tools.has('code_retrieval'));
});

test('autoSync is enabled by default but still gated by the database flag', async (t) => {
  assert.equal(normalizeOptions({}, {}).autoSync, true);
  assert.equal(normalizeOptions({}, { C4F_RETRIEVAL_AUTOSYNC: '0' }).autoSync, false);
  assert.equal(normalizeOptions({ autoSync: false }, {}).autoSync, false);
  assert.equal(normalizeOptions({}, {}).warmupTimeoutMs, 5000);

  const neverInitialized = await makeRoot(t, { initialized: false });
  const coldCalls = [];
  await run(toolCtx(neverInitialized), {}, { runner: async (call) => { coldCalls.push(call); return { ok: true }; } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(coldCalls.length, 0, 'no database means no startup scan');

  const initialized = await makeRoot(t, { initialized: true });
  const warmCalls = [];
  const handle = await run(toolCtx(initialized), {}, {
    runner: async (call) => {
      warmCalls.push(call);
      return { ok: true, code: 0, stdout: '{}', stderr: '' };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(warmCalls.length, 1, 'an initialized repo is refreshed at startup');
  assert.equal(warmCalls[0].args[1], 'index');
  await handle.dispose();
});

test('the whole tool can be disabled by option or env', async () => {
  const ctx = toolCtx('/repo');
  const fromOption = await run(ctx, { enabled: false });
  assert.equal(ctx.tools.size, 0);
  await fromOption.dispose();

  const envCtx = toolCtx('/repo', { C4F_RETRIEVAL_TOOL: '0' });
  const fromEnv = await run(envCtx, {});
  assert.equal(envCtx.tools.size, 0);
  await fromEnv.dispose();
});

test('scripts ship beside the module, not in a skill directory', () => {
  assert.match(DEFAULT_SCRIPTS_DIR, /src\/modules\/code-retrieval\/scripts$/);
});
