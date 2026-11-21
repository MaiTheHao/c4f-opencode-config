import { access } from 'node:fs/promises';

import { TOKENIZER_VERSION, normalizeTokens } from './tokenize.js';

export const SCHEMA_VERSION = 2;
export const BM25_SYMBOL_WEIGHT = 3.0;
export const BM25_PATH_WEIGHT = 2.0;
export const BM25_CONTENT_WEIGHT = 1.0;

// Must match INDEXER_VERSION in scripts/storage.py; enforced in readStatus.
export const EXPECTED_INDEXER_VERSION = 1;

export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;
export const MAX_MATCH_TOKENS = 32;

const STATUS_OK = 'OK';
const STATUS_NOT_INITIALIZED = 'NOT_INITIALIZED';
const STATUS_STALE_INDEX = 'STALE_INDEX';
const STATUS_DRIVER_UNSUPPORTED = 'DRIVER_UNSUPPORTED';
const STATUS_ERROR = 'ERROR';

const openHandles = new Map();
const pendingOpens = new Map();
const ftsSelfTestCache = new Map();

/** Escape one token as a double-quoted FTS5 phrase; inner quotes are doubled. */
export function quoteToken(token) {
  return `"${String(token).replaceAll('"', '""')}"`;
}

/**
 * Build a safe FTS5 MATCH expression from raw query text.
 * Every token is double-quoted (never raw-interpolated) and joined with OR,
 * so `-`, `:`, `"`, `*`, `NEAR` and friends can never become FTS5 syntax.
 * Duplicate tokens are dropped and at most MAX_MATCH_TOKENS leading tokens
 * are kept, so a pathological query cannot build an unbounded OR chain.
 */
export function buildMatchQuery(text) {
  const seen = new Set();
  const tokens = [];
  for (const token of normalizeTokens(text)) {
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MAX_MATCH_TOKENS) break;
  }
  if (tokens.length === 0) return '';
  return tokens.map(quoteToken).join(' OR ');
}

function majorMinor(version) {
  const match = /^(\d+)\.(\d+)/.exec(version ?? '');
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function nodeSupportsSqlite() {
  const parsed = majorMinor(process.versions?.node);
  if (!parsed) return false;
  return parsed.major > 22 || (parsed.major === 22 && parsed.minor >= 13);
}

function wrapBunDatabase(Database) {
  const wrap = (db) => ({
    query(sql, params = []) {
      return db.query(sql).all(...params);
    },
    close() {
      db.close();
    },
  });
  return {
    name: 'bun:sqlite',
    open(dbPath) {
      const db = new Database(dbPath, { readonly: true });
      try {
        db.exec('PRAGMA busy_timeout = 2000;');
      } catch {
        // Readonly metadata probes must not fail when PRAGMA is rejected.
      }
      return wrap(db);
    },
    openReadWrite(dbPath) {
      const db = new Database(dbPath);
      try {
        db.exec('PRAGMA busy_timeout = 2000;');
      } catch {
        // The self-test probe must not fail on a busy_timeout rejection.
      }
      return wrap(db);
    },
  };
}

function wrapNodeDatabase(DatabaseSync) {
  const wrap = (db) => ({
    query(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    close() {
      db.close();
    },
  });
  return {
    name: 'node:sqlite',
    open(dbPath) {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        db.exec('PRAGMA busy_timeout = 2000;');
      } catch {
        // Readonly metadata probes must not fail when PRAGMA is rejected.
      }
      return wrap(db);
    },
    openReadWrite(dbPath) {
      const db = new DatabaseSync(dbPath);
      try {
        db.exec('PRAGMA busy_timeout = 2000;');
      } catch {
        // The self-test probe must not fail on a busy_timeout rejection.
      }
      return wrap(db);
    },
  };
}

/** Drivers in fallback order: `bun:sqlite` first, then `node:sqlite`. */
async function probeDrivers() {
  const drivers = [];
  try {
    const bun = await import('bun:sqlite');
    if (bun?.Database) drivers.push(wrapBunDatabase(bun.Database));
  } catch {
    // Not running under Bun; fall through to node:sqlite.
  }
  if (nodeSupportsSqlite()) {
    try {
      const node = await import('node:sqlite');
      if (node?.DatabaseSync) drivers.push(wrapNodeDatabase(node.DatabaseSync));
    } catch {
      // node:sqlite unavailable; callers report DRIVER_UNSUPPORTED below.
    }
  }
  return drivers;
}

function selfTestFts(driver) {
  if (driver?.selfTest !== undefined) return driver.selfTest !== false;
  const cacheKey = driver?.name ?? 'unknown';
  if (ftsSelfTestCache.has(cacheKey)) return ftsSelfTestCache.get(cacheKey);
  let ok = false;
  try {
    // The probe writes (CREATE/INSERT), so it must use a read-write handle —
    // never the readonly wrapper, which fails with "attempt to write a readonly database".
    const opener =
      typeof driver?.openReadWrite === 'function'
        ? driver.openReadWrite.bind(driver)
        : driver.open.bind(driver);
    const probe = opener(':memory:');
    try {
      probe.query('CREATE VIRTUAL TABLE __c4f_probe USING fts5(a, b)');
      probe.query("INSERT INTO __c4f_probe (a, b) VALUES ('hello', 'world')");
      probe.query('SELECT bm25(__c4f_probe) AS score FROM __c4f_probe WHERE __c4f_probe MATCH ?', ['"hello"']);
      ok = true;
    } finally {
      probe.close();
    }
  } catch {
    ok = false;
  }
  ftsSelfTestCache.set(cacheKey, ok);
  return ok;
}

const LEGACY_TABLES = new Set(['bm25_vocab', 'bm25_postings', 'bm25_meta']);

function readStatus(connection) {
  let tables = [];
  try {
    tables = connection.query("SELECT name FROM sqlite_master WHERE type = 'table'");
  } catch {
    return STATUS_ERROR;
  }
  const names = new Set(tables.map((row) => row?.name));
  // RF1: any legacy BM25 table means a pre-FTS5 database, even when
  // fts_chunks + meta already look valid.
  for (const legacy of LEGACY_TABLES) {
    if (names.has(legacy)) return STATUS_STALE_INDEX;
  }
  if (!names.has('fts_chunks')) return STATUS_STALE_INDEX;
  // A missing meta table is structural staleness; an unreadable one is a
  // live failure and must surface as ERROR, not STALE_INDEX.
  if (!names.has('meta')) return STATUS_STALE_INDEX;

  let meta = [];
  try {
    meta = connection.query('SELECT key, value FROM meta');
  } catch {
    return STATUS_ERROR;
  }
  const values = new Map(meta.map((row) => [row?.key, row?.value]));
  if (values.get('schema_version') !== String(SCHEMA_VERSION)) return STATUS_STALE_INDEX;
  if (values.get('tokenizer_version') !== String(TOKENIZER_VERSION)) return STATUS_STALE_INDEX;
  if (values.get('indexer_version') !== String(EXPECTED_INDEXER_VERSION)) return STATUS_STALE_INDEX;
  return STATUS_OK;
}

function clampTopK(topK) {
  if (!Number.isInteger(topK)) return DEFAULT_TOP_K;
  return Math.min(MAX_TOP_K, Math.max(1, topK));
}

/**
 * Open a readonly search store over an FTS5 index database.
 * Injected `driver` (single) or `drivers` (ordered list) is for tests;
 * otherwise drivers are lazily probed as `bun:sqlite` -> `node:sqlite`.
 *
 * Only `OK` stores are cached. Every non-OK result is an ephemeral object,
 * so the next call re-checks the filesystem (a rebuild between two calls is
 * picked up without a restart). Concurrent opens for one dbPath share a
 * single in-flight init — no caller ever sees a placeholder status.
 */
export async function openSearchStore(dbPath, { driver, drivers } = {}) {
  const path = String(dbPath ?? '');
  if (openHandles.has(path)) return openHandles.get(path);
  if (pendingOpens.has(path)) return pendingOpens.get(path);
  const pending = initSearchStore(path, { driver, drivers });
  pendingOpens.set(path, pending);
  try {
    const store = await pending;
    if (store?.status === STATUS_OK) openHandles.set(path, store);
    return store;
  } finally {
    pendingOpens.delete(path);
  }
}

async function initSearchStore(path, { driver, drivers }) {
  const ephemeral = (status, driverName) => ({
    status,
    driverName: driverName ?? driver?.name ?? 'probe',
    search: async () => ({ status, hits: [] }),
    close: async () => {},
  });

  let exists = false;
  try {
    await access(path);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) return ephemeral(STATUS_NOT_INITIALIZED);

  const candidates = driver ? [driver] : (drivers ?? await probeDrivers());
  let resolved;
  for (const candidate of candidates) {
    if (selfTestFts(candidate)) {
      resolved = candidate;
      break;
    }
  }
  if (!resolved) {
    return ephemeral(STATUS_DRIVER_UNSUPPORTED, candidates[0]?.name ?? 'none');
  }

  let connection;
  try {
    connection = resolved.open(path);
  } catch {
    return ephemeral(STATUS_ERROR, resolved.name);
  }

  const status = readStatus(connection);
  if (status !== STATUS_OK) {
    try {
      connection.close();
    } catch {
      // Ignore close errors on a stale/unreadable handle.
    }
    return ephemeral(status, resolved.name);
  }

  const store = {
    status,
    driverName: resolved.name,
    search: async (query, topK) => {
      const limit = clampTopK(topK);
      const match = buildMatchQuery(query);
      if (!match) return { status: STATUS_OK, hits: [] };
      let rows = [];
      try {
        // Ranking is global top-k bm25 ascending in SQL; the JS sort below is
        // only a defensive second pass over at most `limit` rows.
        rows = connection.query(
          `SELECT file_path, symbol AS symbol, node_type, start_line, end_line,
                  bm25(fts_chunks, ${BM25_SYMBOL_WEIGHT}, ${BM25_PATH_WEIGHT}, ${BM25_CONTENT_WEIGHT}) AS score
             FROM fts_chunks WHERE fts_chunks MATCH ? ORDER BY bm25(fts_chunks, ${BM25_SYMBOL_WEIGHT}, ${BM25_PATH_WEIGHT}, ${BM25_CONTENT_WEIGHT}) ASC LIMIT ?`,
          [match, limit],
        );
      } catch {
        return { status: STATUS_ERROR, hits: [] };
      }
      const hits = rows
        .map((row) => ({
          score: Number(row?.score),
          file_path: String(row?.file_path ?? ''),
          symbol: String(row?.symbol ?? ''),
          node_type: String(row?.node_type ?? ''),
          start_line: Number(row?.start_line ?? 0),
          end_line: Number(row?.end_line ?? 0),
        }))
        .filter((hit) => Number.isFinite(hit.score))
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
      return { status: STATUS_OK, hits };
    },
    close: async () => {
      openHandles.delete(path);
      try {
        connection.close();
      } catch {
        // Ignore close errors during teardown.
      }
    },
  };
  return store;
}

/** Close every cached store handle (module teardown / tests). */
export async function disposeSearchStores() {
  const handles = [...openHandles.values()];
  openHandles.clear();
  for (const handle of handles) {
    try {
      await handle.close();
    } catch {
      // Ignore close errors during teardown.
    }
  }
}

export const __test__ = { readStatus, selfTestFts, clampTopK };
