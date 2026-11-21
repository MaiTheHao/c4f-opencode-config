import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  BM25_CONTENT_WEIGHT,
  BM25_PATH_WEIGHT,
  BM25_SYMBOL_WEIGHT,
  EXPECTED_INDEXER_VERSION,
  buildMatchQuery,
  disposeSearchStores,
  openSearchStore,
} from '../src/modules/code-retrieval/store.js';
import { TOKENIZER_VERSION, normalizeTokens } from '../src/modules/code-retrieval/tokenize.js';
import { normalizeOptions } from '../src/modules/code-retrieval/config.js';

import { DatabaseSync } from 'node:sqlite';

const FIXTURE = new URL('./fixtures/tokenizer_cases.json', import.meta.url);

const OK_META = [
  { key: 'schema_version', value: '2' },
  { key: 'tokenizer_version', value: String(TOKENIZER_VERSION) },
  { key: 'indexer_version', value: '1' },
];
const OK_MASTER = [{ name: 'files' }, { name: 'fts_chunks' }, { name: 'meta' }];

function fakeDriver({ master = OK_MASTER, meta = OK_META, rows = [], selfTest = true, name = 'fake' } = {}) {
  const calls = [];
  const driver = {
    name,
    selfTest,
    open() {
      return {
        query(sql, params = []) {
          calls.push({ sql, params });
          if (sql.includes('sqlite_master')) return master;
          if (sql.includes('FROM meta')) return meta;
          if (sql.includes('FROM fts_chunks')) return rows;
          throw new Error(`unexpected query: ${sql}`);
        },
        close() {},
      };
    },
  };
  return { driver, calls };
}

async function existingDbPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  t.after(() => disposeSearchStores());
  const dbPath = join(dir, 'index.db');
  await writeFile(dbPath, '');
  return dbPath;
}

test('normalizeTokens matches the golden fixture (Python is source of truth)', async () => {
  const cases = JSON.parse(await readFile(FIXTURE, 'utf8'));
  assert.ok(cases.length > 0);
  for (const { input, tokens } of cases) {
    assert.deepEqual(normalizeTokens(input), tokens, `input: ${JSON.stringify(input)}`);
  }
});

test('tokenizer version is locked to 1 on both sides', () => {
  assert.equal(TOKENIZER_VERSION, 1);
});

test('bm25 weights start at 3.0 / 2.0 / 1.0 (symbol / path / content)', () => {
  assert.equal(BM25_SYMBOL_WEIGHT, 3.0);
  assert.equal(BM25_PATH_WEIGHT, 2.0);
  assert.equal(BM25_CONTENT_WEIGHT, 1.0);
});

test('query quoting keeps FTS5 metacharacters inside quoted phrases', async (t) => {
  const query = 'validate-token: "exact" * NEAR foo';
  const match = buildMatchQuery(query);
  const expected = normalizeTokens(query).map((token) => `"${token}"`).join(' OR ');
  assert.equal(match, expected);
  // No bare column/operator syntax may leak outside the quotes.
  assert.doesNotMatch(match, /(^| )NEAR( |$)/);
  assert.ok(!match.includes('*') || match.includes('"'));

  const dbPath = await existingDbPath(t);
  const rows = [
    { score: -1.5, file_path: 'b.ts', symbol: 'beta', node_type: 'function_declaration', start_line: 1, end_line: 2 },
  ];
  const { driver, calls } = fakeDriver({ rows });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'OK');
  const result = await store.search(query, 5);
  assert.equal(result.status, 'OK');
  const ftsCall = calls.find((call) => call.sql.includes('FROM fts_chunks'));
  assert.ok(ftsCall, 'search must run a MATCH query');
  assert.equal(ftsCall.params[0], expected);
  assert.ok(!ftsCall.params[0].includes(query), 'raw query text must never reach MATCH');
});

test('empty token stream never runs MATCH', async (t) => {
  const dbPath = await existingDbPath(t);
  const { driver, calls } = fakeDriver({ rows: [] });
  const store = await openSearchStore(dbPath, { driver });
  const result = await store.search('--- :::', 5);
  assert.deepEqual(result.hits, []);
  assert.ok(!calls.some((call) => call.sql.includes('FROM fts_chunks')));
});

test('missing database file reports NOT_INITIALIZED', async (t) => {
  t.after(() => disposeSearchStores());
  const dir = await mkdtemp(join(tmpdir(), 'c4f-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await openSearchStore(join(dir, 'missing.db'));
  assert.equal(store.status, 'NOT_INITIALIZED');
});

test('legacy database reports STALE_INDEX (RF1)', async (t) => {
  const dbPath = await existingDbPath(t);
  const legacyMaster = [{ name: 'files' }, { name: 'chunks' }, { name: 'bm25_vocab' }];
  const { driver } = fakeDriver({ master: legacyMaster, meta: [] });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'STALE_INDEX');
});

test('schema version mismatch reports STALE_INDEX', async (t) => {
  const dbPath = await existingDbPath(t);
  const { driver } = fakeDriver({
    meta: [
      { key: 'schema_version', value: '1' },
      { key: 'tokenizer_version', value: String(TOKENIZER_VERSION) },
    ],
  });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'STALE_INDEX');
});

test('tokenizer version mismatch reports STALE_INDEX', async (t) => {
  const dbPath = await existingDbPath(t);
  const { driver } = fakeDriver({
    meta: [
      { key: 'schema_version', value: '2' },
      { key: 'tokenizer_version', value: '999' },
    ],
  });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'STALE_INDEX');
});

test('search ordering is ascending by bm25 with the symbol weight winning', async (t) => {
  const dbPath = await existingDbPath(t);
  const rows = [
    { score: -0.5, file_path: 'src/B.ts', symbol: 'other', node_type: 'function_declaration', start_line: 10, end_line: 12 },
    { score: -4.25, file_path: 'src/A.ts', symbol: 'validateToken', node_type: 'method_definition', start_line: 1, end_line: 3 },
    { score: -2.0, file_path: 'src/C.ts', symbol: 'middle', node_type: 'class_declaration', start_line: 5, end_line: 9 },
  ];
  const { driver } = fakeDriver({ rows });
  const store = await openSearchStore(dbPath, { driver });
  const result = await store.search('validate token', 10);
  assert.deepEqual(
    result.hits.map((hit) => hit.symbol),
    ['validateToken', 'middle', 'other'],
  );
  const scores = result.hits.map((hit) => hit.score);
  assert.deepEqual([...scores].sort((a, b) => a - b), scores);
});

test('top_k clamps to 1..50 with a default of 5', async (t) => {
  const dbPath = await existingDbPath(t);
  const rows = Array.from({ length: 60 }, (_, i) => ({
    score: -1 - i * 0.01,
    file_path: `f${i}.ts`,
    symbol: `sym${i}`,
    node_type: 'function_declaration',
    start_line: 1,
    end_line: 2,
  }));
  const { driver, calls } = fakeDriver({ rows });
  const store = await openSearchStore(dbPath, { driver });
  const limited = await store.search('sym', 99);
  assert.equal(limited.hits.length, 50);
  const defaulted = await store.search('sym');
  assert.equal(defaulted.hits.length, 5);
  const limits = calls.filter((call) => call.sql.includes('FROM fts_chunks')).map((call) => call.params[1]);
  assert.ok(limits.every((limit) => limit >= 1 && limit <= 50));
});

test('config keeps only the store-era keys', () => {
  const options = normalizeOptions({ python: 'x', timeoutMs: 1, warmupTimeoutMs: 1, autoSync: true }, {});
  assert.deepEqual(Object.keys(options).sort(), ['codemode', 'db', 'enabled', 'root', 'scriptsDir']);
});

test('real store opens OK through node:sqlite (RW self-test, AC5)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-store-real-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  t.after(() => disposeSearchStores());
  const dbPath = join(dir, 'real.db');
  const setup = new DatabaseSync(dbPath);
  try {
    setup.exec(`CREATE TABLE files (
        file_id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT UNIQUE NOT NULL,
        language TEXT NOT NULL, file_hash TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE VIRTUAL TABLE fts_chunks USING fts5(
        symbol, path, content, file_path UNINDEXED, node_type UNINDEXED,
        start_line UNINDEXED, end_line UNINDEXED);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES
        ('schema_version', '2'), ('tokenizer_version', '${TOKENIZER_VERSION}'), ('indexer_version', '${EXPECTED_INDEXER_VERSION}');
      INSERT INTO files (file_path, language, file_hash) VALUES ('src/a.ts', 'ts', 'abc');
      INSERT INTO fts_chunks (symbol, path, content, file_path, node_type, start_line, end_line)
        VALUES ('hello world', 'src a ts', 'hello world src a', 'src/a.ts', 'function_declaration', 1, 2);`);
  } finally {
    setup.close();
  }
  const store = await openSearchStore(dbPath);
  assert.equal(store.status, 'OK');
  assert.equal(store.driverName, 'node:sqlite');
  const result = await store.search('hello', 5);
  assert.equal(result.status, 'OK');
  assert.ok(result.hits.length > 0);
  assert.deepEqual(
    result.hits.map((hit) => hit.score),
    [...result.hits.map((hit) => hit.score)].sort((a, b) => a - b),
  );
});

test('a driver that fails self-test falls through to the next driver', async (t) => {
  const dbPath = await existingDbPath(t);
  const bad = fakeDriver({ selfTest: false, name: 'bad' });
  const good = fakeDriver({ rows: [], name: 'good' });
  const store = await openSearchStore(dbPath, { drivers: [bad.driver, good.driver] });
  assert.equal(store.status, 'OK');
  assert.equal(store.driverName, 'good');
});

test('ranking is global top-k bm25 ascending (SQL ORDER BY + LIMIT)', async (t) => {
  const dbPath = await existingDbPath(t);
  const calls = [];
  const rows = Array.from({ length: 10 }, (_, i) => ({
    score: -1 - i,
    file_path: `f${i}.ts`,
    symbol: `sym${i}`,
    node_type: 'function_declaration',
    start_line: 1,
    end_line: 2,
  }));
  const driver = {
    name: 'sql-honoring',
    selfTest: true,
    open() {
      return {
        query(sql, params = []) {
          calls.push({ sql, params });
          if (sql.includes('sqlite_master')) return OK_MASTER;
          if (sql.includes('FROM meta')) return OK_META;
          if (sql.includes('FROM fts_chunks')) {
            // Honor SQL ORDER BY bm25 ASC + LIMIT like a real engine.
            return [...rows].sort((a, b) => a.score - b.score).slice(0, params[1]);
          }
          throw new Error(`unexpected query: ${sql}`);
        },
        close() {},
      };
    },
  };
  const store = await openSearchStore(dbPath, { driver });
  const result = await store.search('sym', 3);
  assert.equal(result.status, 'OK');
  const ftsCall = calls.find((call) => call.sql.includes('FROM fts_chunks'));
  assert.ok(ftsCall, 'search must run a MATCH query');
  assert.match(ftsCall.sql, /ORDER BY bm25\(fts_chunks, 3, 2, 1\) ASC/);
  assert.match(ftsCall.sql, /LIMIT \?/);
  assert.equal(ftsCall.params[1], 3);
  assert.deepEqual(
    result.hits.map((hit) => hit.symbol),
    ['sym9', 'sym8', 'sym7'],
  );
});

test('legacy tables force STALE_INDEX even when fts_chunks looks valid (RF1)', async (t) => {
  const dbPath = await existingDbPath(t);
  const master = [...OK_MASTER, { name: 'bm25_vocab' }];
  const { driver } = fakeDriver({ master, meta: OK_META });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'STALE_INDEX');
});

test('rebuild flow works without a restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  t.after(() => disposeSearchStores());
  const dbPath = join(dir, 'index.db');
  const { driver } = fakeDriver({ rows: [] });
  const first = await openSearchStore(dbPath, { driver });
  assert.equal(first.status, 'NOT_INITIALIZED');
  await writeFile(dbPath, '');
  const second = await openSearchStore(dbPath, { driver });
  assert.equal(second.status, 'OK');
});

test('parallel opens never observe the ERROR placeholder', async (t) => {
  const dbPath = await existingDbPath(t);
  let opens = 0;
  const base = fakeDriver({ rows: [] });
  const driver = {
    ...base.driver,
    open(...args) {
      opens += 1;
      return base.driver.open(...args);
    },
  };
  const [first, second] = await Promise.all([
    openSearchStore(dbPath, { driver }),
    openSearchStore(dbPath, { driver }),
  ]);
  assert.equal(first.status, 'OK');
  assert.equal(second.status, 'OK');
  assert.equal(first, second);
  assert.equal(opens, 1);
});

test('indexer_version mismatch reports STALE_INDEX', async (t) => {
  const dbPath = await existingDbPath(t);
  const meta = [
    { key: 'schema_version', value: '2' },
    { key: 'tokenizer_version', value: String(TOKENIZER_VERSION) },
    { key: 'indexer_version', value: '99' },
  ];
  const { driver } = fakeDriver({ meta });
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'STALE_INDEX');
});

test('unreadable meta table reports ERROR, not STALE_INDEX', async (t) => {
  const dbPath = await existingDbPath(t);
  const driver = {
    name: 'meta-broken',
    selfTest: true,
    open() {
      return {
        query(sql) {
          if (sql.includes('sqlite_master')) return OK_MASTER;
          if (sql.includes('FROM meta')) throw new Error('disk I/O error');
          throw new Error(`unexpected query: ${sql}`);
        },
        close() {},
      };
    },
  };
  const store = await openSearchStore(dbPath, { driver });
  assert.equal(store.status, 'ERROR');
});

test('match build dedupes tokens and caps at 32', () => {
  assert.equal(buildMatchQuery('alpha beta alpha gamma beta'), '"alpha" OR "beta" OR "gamma"');
  const words = Array.from(
    { length: 40 },
    (_, i) => `q${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
  );
  const match = buildMatchQuery(words.join(' '));
  const phrases = match.split(' OR ');
  assert.equal(phrases.length, 32);
  assert.equal(phrases[0], `"${words[0]}"`);
  assert.equal(phrases[31], `"${words[31]}"`);
  assert.ok(!match.includes(words[32]));
});
