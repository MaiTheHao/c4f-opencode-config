import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SCRIPTS_DIR,
  normalizeOptions,
  resolveDbPath,
  resolveRoot,
} from '../src/modules/code-retrieval/config.js';
import {
  normalizeArgs,
  registerCodeRetrievalTool,
  run,
} from '../src/modules/code-retrieval/index.js';
import { renderSearch } from '../src/modules/code-retrieval/render.js';

const DB_REL = 'local/agents/retrieval/code_bm25.db';

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

function fakeStore(status, hits = []) {
  const calls = [];
  return {
    calls,
    async openStore(dbPath) {
      calls.push(dbPath);
      if (status !== 'OK') {
        return { status, search: async () => ({ status, hits: [] }), close: async () => {} };
      }
      return {
        status,
        search: async (query, topK) => ({ status, hits: hits.slice(0, topK) }),
        close: async () => {},
      };
    },
  };
}

async function execute(t, { input = {}, status = 'OK', hits = [], options = {}, root } = {}) {
  const dir = root ?? await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  if (!root) t.after(() => rm(dir, { recursive: true, force: true }));
  const ctx = toolCtx(dir);
  const fake = fakeStore(status, hits);
  const registration = await registerCodeRetrievalTool({
    ctx,
    options: normalizeOptions(options, {}),
    openStore: status === 'REAL' ? undefined : fake.openStore,
  });
  const tool = ctx.tools.get('code_retrieval');
  const out = await tool.execute(input, { signal: undefined });
  return { out, fake, tool, registration, ctx, dir };
}

const SEARCH_HITS = [
  { score: -4.25, file_path: 'src/AccessTokenStrategy.java', symbol: 'validateToken', node_type: 'method_declaration', start_line: 44, end_line: 47 },
  { score: -2.1, file_path: 'src/JwtProvider.java', symbol: 'validateToken', node_type: 'method_declaration', start_line: 66, end_line: 73 },
];

test('registers a direct tool by default; Code Mode is opt-in', () => {
  assert.equal(normalizeOptions({}, {}).codemode, false);
  assert.equal(normalizeOptions({ codemode: true }, {}).codemode, true);
  assert.equal(normalizeOptions({ codemode: false }, { C4F_RETRIEVAL_CODEMODE: '1' }).codemode, false);
  assert.equal(normalizeOptions({}, { C4F_RETRIEVAL_CODEMODE: '1' }).codemode, true);
});

test('search on an initialized repo renders hits best-first with metadata', async (t) => {
  const { out, tool } = await execute(t, { input: { query: 'jwt validate' }, hits: SEARCH_HITS });

  assert.equal(tool.options.codemode, false);
  assert.match(out.content, /2 hit\(s\)/);
  assert.match(out.content, /`validateToken`/);
  const first = out.content.indexOf('src/AccessTokenStrategy.java');
  const second = out.content.indexOf('src/JwtProvider.java');
  assert.ok(first !== -1 && second !== -1 && first < second);
  assert.equal(out.metadata.hits, 2);
  assert.equal(out.metadata.initialized, true);
});

test('root without an index reports NOT_INITIALIZED with a rebuild command', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { out } = await execute(t, { input: { query: 'jwt' }, status: 'REAL', root: dir });

  assert.match(out.content, /NOT_INITIALIZED/);
  assert.match(out.content, /index\.py/);
  assert.equal(out.metadata.initialized, false);
  assert.equal(out.metadata.hits, 0);
});

test('legacy database reports STALE_INDEX with a rebuild hint (RF1)', async (t) => {
  const { out } = await execute(t, { input: { query: 'jwt' }, status: 'STALE_INDEX' });

  assert.match(out.content, /STALE_INDEX/);
  assert.match(out.content, /--rebuild/);
  assert.equal(out.metadata.stale, true);
  assert.equal(out.metadata.initialized, false);
});

test('missing driver reports DRIVER_UNSUPPORTED', async (t) => {
  const { out } = await execute(t, { input: { query: 'jwt' }, status: 'DRIVER_UNSUPPORTED' });

  assert.match(out.content, /DRIVER_UNSUPPORTED/);
  assert.match(out.content, /bun:sqlite|node:sqlite/);
});

test('validation failures never touch the store', async (t) => {
  for (const input of [{}, { query: '   ' }, { query: 'x', top_k: 0 }, { query: 'x', top_k: 99 }]) {
    const { out, fake } = await execute(t, { input });
    assert.equal(fake.calls.length, 0, 'invalid input must not open the store');
    assert.match(out.content, input.query !== undefined && String(input.query).trim() ? /top_k/ : /query is required/);
  }
});

test('normalizeArgs is search-only', () => {
  assert.deepEqual(normalizeArgs({ query: ' jwt ' }), { query: 'jwt', topK: 5, root: '' });
  assert.equal(normalizeArgs({ query: 'x', top_k: 50 }).topK, 50);
  assert.deepEqual(normalizeArgs({ action: 'index', query: 'x' }), { query: 'x', topK: 5, root: '' });
});

test('root argument overrides the session directory and gates on that database', async (t) => {
  const other = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  t.after(() => rm(other, { recursive: true, force: true }));
  const { out, fake } = await execute(t, { input: { query: 'jwt', root: other }, status: 'REAL' });
  assert.equal(fake.calls.length, 0, 'real opener gates on the missing database');
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

test('a moved session searches and gates on its new workspace', async (t) => {
  const setupDir = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  const movedDir = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  t.after(() => rm(setupDir, { recursive: true, force: true }));
  t.after(() => rm(movedDir, { recursive: true, force: true }));
  const ctx = toolCtx(setupDir);
  ctx.session = { get: async () => ({ location: { directory: movedDir } }) };
  const fake = fakeStore('OK', SEARCH_HITS);

  await registerCodeRetrievalTool({ ctx, options: normalizeOptions({}, {}), openStore: fake.openStore });
  const out = await ctx.tools.get('code_retrieval').execute({ query: 'jwt' }, { sessionID: 'ses_moved' });

  assert.ok(fake.calls[0].startsWith(movedDir));
  assert.match(out.content, /2 hit\(s\)/);
});

test('the database path mirrors the python default and honours --db', () => {
  assert.equal(resolveDbPath({ options: normalizeOptions({}, {}), root: '/repo' }), `/repo/${DB_REL}`);
  assert.equal(resolveDbPath({ options: normalizeOptions({ db: '/tmp/x.db' }, {}), root: '/repo' }), '/tmp/x.db');
  assert.equal(resolveDbPath({ options: normalizeOptions({ db: 'rel.db' }, {}), root: '/repo' }), '/repo/rel.db');
});

test('the tool is not registered when the runtime lacks tool.transform', async () => {
  const registration = await registerCodeRetrievalTool({
    ctx: { location: { directory: '/repo' } },
    options: normalizeOptions({}, {}),
  });
  assert.equal(registration, undefined);
});

test('dispose removes the registered tool', async (t) => {
  const { registration, ctx } = await execute(t, { input: { query: 'jwt' }, hits: SEARCH_HITS });
  assert.ok(ctx.tools.has('code_retrieval'));
  await registration.dispose();
  assert.ok(!ctx.tools.has('code_retrieval'));
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

test('search ERROR status renders failure content, not an empty table', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-code-retrieval-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ctx = toolCtx(dir);
  await registerCodeRetrievalTool({
    ctx,
    options: normalizeOptions({}, {}),
    openStore: async () => ({
      status: 'OK',
      search: async () => ({ status: 'ERROR', hits: [] }),
      close: async () => {},
    }),
  });
  const out = await ctx.tools.get('code_retrieval').execute({ query: 'jwt' }, {});
  assert.match(out.content, /ERROR/);
  assert.doesNotMatch(out.content, /0 hit\(s\)/);
});

test('markdown cells sanitize pipes, backticks and newlines', () => {
  const content = renderSearch({
    query: 'x',
    root: '/repo',
    hits: [
      {
        score: -1.5, file_path: 'a|b.ts', symbol: 'f`oo\nbar',
        node_type: 'function_declaration', start_line: 1, end_line: 2,
      },
    ],
  });
  // One data row stays on one line: header, blank, table head, separator, row, blank, footer.
  assert.equal(content.split('\n').length, 7);
  assert.ok(content.includes('a\\|b.ts'));
  assert.ok(!content.includes('f`oo'));
});

test('oversized query fails validation without touching the store', async (t) => {
  const { out, fake } = await execute(t, { input: { query: 'x'.repeat(300) } });
  assert.equal(fake.calls.length, 0);
  assert.match(out.content, /ERROR/);
});

test('backticks in query do not break the header code span', () => {
  const content = renderSearch({
    query: 'a`b',
    root: '/r`e',
    hits: [
      {
        score: -1, file_path: 'f.ts', symbol: 's',
        node_type: 'function_declaration', start_line: 1, end_line: 2,
      },
    ],
  });
  const header = content.split('\n')[0];
  assert.equal(header, '**1 hit(s)** for `a\'b` in `/r\'e`');
});
