// Verified-context store: a JSONL file with provenance stamps and freshness
// checks. Records keep the MCP layout (`_retrieval` metadata) so existing
// context files stay readable.
//
// Concurrency: writes are serialized per file within one process. Two OpenCode
// processes sharing one workspace are NOT serialized (accepted limit: one
// process per workspace).

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { isInside, readCappedFile, resolveHead, relativeTo } from './repo.js';

const METADATA_KEY = '_retrieval';
const SAFE_KEY = /^[A-Za-z_][\w-]*$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_RESULTS = 10;
const MAX_RESULTS = 50;
/** `path/file.py:10-40` or `:10-40,60-70` -> `path/file.py` */
const LINE_SUFFIX = /:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;
/** Top-level fields that are bookkeeping, never searched and never stored back. */
const DERIVED_KEYS = ['freshness', '_match', 'action'];
const SEARCH_SKIP = new Set([METADATA_KEY, 'status', 'invalidation', ...DERIVED_KEYS]);
const FRESHNESS_RANK = { fresh: 0, unknown: 1, stale: 2 };

const QUEUE_REGISTRY = Symbol.for('opencode.retrieval.storeQueues');
const queues = (globalThis[QUEUE_REGISTRY] ??= new Map());

function serialize(file, operation) {
  const key = resolve(file);
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(operation, operation);

  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });

  return run;
}

/** Build a store bound to one JSONL file. */
export function createStore({ file }) {
  if (typeof file !== 'string' || file === '') throw new Error('store file must be a path');

  return {
    file,
    readAll: () => readAll(file),
    lookup: (query, root, maxResults) => lookup(file, query, root, maxResults),
    upsert: (record, key, root) => serialize(file, () => upsert(file, record, key, root)),
    invalidate: (ids, reason, key) => serialize(file, () => invalidate(file, ids, reason, key)),
  };
}

/* ---------- lookup ---------- */

async function lookup(file, query, root, maxResults = DEFAULT_RESULTS) {
  if (typeof query !== 'string') throw new Error('query must be a string');

  const limit = Number.isInteger(maxResults) && maxResults > 0 ? Math.min(maxResults, MAX_RESULTS) : DEFAULT_RESULTS;
  const terms = tokenize(query);
  const records = await readAll(file);

  // Match first, verify freshness only for hits: hashing sources of records
  // that do not match the query is pure waste.
  const matched = [];
  for (const record of records) {
    const text = searchableText(record);
    const matchingTerms = terms.filter((term) => text.includes(term));
    if (matchingTerms.length > 0) matched.push({ record, matchingTerms, score: matchingTerms.length / terms.length });
  }

  const cache = { hashes: new Map(), head: undefined, rootReal: undefined };
  const evaluated = await Promise.all(matched.map(async (item) => ({ ...item, freshness: await freshness(item.record, root, cache) })));

  const results = evaluated
    .sort((a, b) => b.score - a.score || FRESHNESS_RANK[a.freshness.status] - FRESHNESS_RANK[b.freshness.status])
    .slice(0, limit)
    .map(({ record, freshness: state, score, matchingTerms }) => ({
      ...record,
      freshness: state,
      action: state.status === 'fresh' ? 'use' : 'review',
      _match: { score: Number(score.toFixed(3)), terms: matchingTerms },
    }));

  return { query, count: results.length, results, context_file: file };
}

/* ---------- upsert / invalidate ---------- */

async function upsert(file, recordInput, key = 'id', root) {
  if (!isRecord(recordInput)) throw new Error('record must be an object');
  assertKey(key);
  if (!Object.hasOwn(recordInput, key)) throw new Error(`record.${key} is required to upsert context`);

  const record = structuredClone(recordInput);
  const identity = record[key];
  if (identity === undefined || identity === null || String(identity).trim() === '') {
    throw new Error(`record.${key} is required to upsert context`);
  }
  const identityValue = String(identity);

  // A looked-up record may be passed straight back: drop derived fields, and
  // treat the upsert as re-verification (clears a previous invalidation).
  for (const derived of DERIVED_KEYS) delete record[derived];
  delete record.invalidation;
  if (record.status === 'stale') delete record.status;

  const { stamped, unstamped, malformed, declaredCount } = await stamp(record, root);
  const records = await readAll(file);
  const existing = records.findIndex((item) => item[key] !== undefined && String(item[key]) === identityValue);

  if (existing >= 0) records[existing] = stamped;
  else records.push(stamped);

  await writeAll(file, records);

  const warnings = [];
  if (declaredCount === 0) warnings.push('no sources declared: freshness will rely on repository HEAD only');

  return {
    stored: true,
    key,
    identity: identityValue,
    replaced: existing >= 0,
    record: stamped,
    ...(unstamped.length > 0 ? { unstamped } : {}),
    ...(malformed ? { sources_malformed: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    context_file: file,
  };
}

async function invalidate(file, ids, reason = '', key = 'id') {
  assertKey(key);
  const records = await readAll(file);
  const selected = new Set(ids.map(String));
  const found = new Set();
  const at = new Date().toISOString();
  let invalidated = 0;

  const updated = records.map((record) => {
    const id = record[key] === undefined ? '' : String(record[key]);
    if (!selected.has(id)) return record;
    found.add(id);
    invalidated += 1;
    return {
      ...record,
      status: 'stale',
      invalidation: { reason: reason || 'Invalidated by context_invalidate', at },
    };
  });

  // A no-op must not rewrite the file or create it.
  if (invalidated > 0) await writeAll(file, updated);

  const missing = [...selected].filter((id) => !found.has(id));
  return { invalidated, requested: ids, ...(missing.length > 0 ? { missing } : {}), reason, context_file: file };
}

function assertKey(key) {
  if (typeof key !== 'string' || !SAFE_KEY.test(key) || RESERVED_KEYS.has(key)) {
    throw new Error(`key must be a plain identifier field name, got ${JSON.stringify(key)}`);
  }
}

/* ---------- file IO ---------- */

async function readAll(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  const records = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      // Never rewrite a file we could not fully parse.
      throw new Error(`invalid JSON in ${file} at line ${index + 1}`);
    }
    if (!isRecord(value)) {
      throw new Error(`invalid context record in ${file} at line ${index + 1}: expected a JSON object`);
    }
    records.push(value);
  }
  return records;
}

async function writeAll(file, records) {
  await mkdir(dirname(file), { recursive: true });

  const serialized = records.map((record) => JSON.stringify(record)).join('\n');
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temp, serialized ? `${serialized}\n` : '', { encoding: 'utf8', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

/* ---------- provenance ---------- */

async function stamp(record, root) {
  const head = await resolveHead(root);
  const rootReal = await realpath(root).catch(() => resolve(root));
  const sourceHashes = [];
  const unstamped = [];
  const declared = declaredSources(record.sources);

  for (const sourcePath of declared.paths) {
    const absolute = resolve(root, sourcePath);
    let stamped = null;

    if (isInside(root, absolute)) {
      try {
        const sourceReal = await realpath(absolute);
        if (isInside(rootReal, sourceReal)) {
          stamped = { path: relativeTo(rootReal, sourceReal), sha256: sha256(await readCappedFile(sourceReal)) };
        }
      } catch {
        // Reported via `unstamped`; never silently treated as covered.
      }
    }

    if (stamped === null) unstamped.push(sourcePath);
    else sourceHashes.push(stamped);
  }

  return {
    unstamped,
    malformed: declared.malformed,
    declaredCount: declared.paths.length,
    stamped: {
      ...record,
      [METADATA_KEY]: {
        storedAt: new Date().toISOString(),
        repoRoot: resolve(root),
        gitHead: head,
        sourceHashes,
      },
    },
  };
}

/**
 * Freshness is a conjunction of the evidence a record actually carries.
 * `fresh` only when something was verified and still matches; anything
 * unverifiable is `unknown`, never `fresh`.
 */
async function freshness(record, root, cache) {
  const reasons = [];
  if (record.status === 'stale') reasons.push('record explicitly invalidated');

  const metadata = record[METADATA_KEY];
  if (!isRecord(metadata)) {
    return { status: reasons.length > 0 ? 'stale' : 'unknown', reasons: [...reasons, 'record has no retrieval provenance metadata'] };
  }

  if (typeof metadata.repoRoot !== 'string') {
    reasons.push('provenance has no repository root');
  } else if (resolve(metadata.repoRoot) !== resolve(root)) {
    reasons.push('repository root differs from stored provenance');
  }

  const declared = declaredSources(record.sources);
  if (declared.malformed) reasons.push('record declares sources in an unrecognized shape');

  const raw = metadata.sourceHashes;
  let verifiable = true;
  let hashes = [];

  if (raw !== undefined) {
    if (Array.isArray(raw)) {
      hashes = raw;
    } else {
      verifiable = false;
      reasons.push('provenance source hashes are malformed');
    }
  }

  if (declared.paths.length > hashes.length) {
    reasons.push(`declared source could not be stamped: ${declared.paths.length - hashes.length} of ${declared.paths.length}`);
  }

  if (verifiable) {
    cache.rootReal ??= realpath(root).catch(() => resolve(root));
    const rootReal = await cache.rootReal;

    for (const source of hashes) {
      if (!isRecord(source) || typeof source.path !== 'string' || typeof source.sha256 !== 'string') {
        verifiable = false;
        reasons.push('provenance contains a malformed source entry');
        break;
      }

      let sourceReal;
      try {
        sourceReal = await realpath(resolve(root, source.path));
      } catch {
        reasons.push(`source missing: ${source.path}`);
        continue;
      }

      if (!isInside(rootReal, sourceReal)) {
        reasons.push(`source path is outside repository: ${source.path}`);
        continue;
      }

      try {
        if ((await currentHash(cache, sourceReal)) !== source.sha256) reasons.push(`source changed: ${source.path}`);
      } catch (err) {
        const tooLarge = /exceeds \d+ bytes/.test(errorMessage(err));
        reasons.push(`${tooLarge ? 'source too large to verify' : 'source missing'}: ${source.path}`);
      }
    }
  }

  if (verifiable && hashes.length === 0) {
    if (typeof metadata.gitHead === 'string') {
      cache.head ??= resolveHead(root);
      const liveHead = await cache.head;
      if (liveHead === null) {
        reasons.push('repository HEAD is unreadable and no source hashes are available');
      } else if (metadata.gitHead !== liveHead) {
        reasons.push('repository HEAD changed and no source hashes are available');
      }
    } else {
      reasons.push('record carries no verifiable provenance (no HEAD, no source hashes)');
    }
  }

  const stalePrefixes = ['record explicitly', 'source changed', 'source missing', 'repository root differs'];
  if (reasons.some((reason) => stalePrefixes.some((prefix) => reason.startsWith(prefix)))) {
    return { status: 'stale', reasons };
  }
  if (reasons.length > 0) return { status: 'unknown', reasons };
  return { status: 'fresh', reasons: [] };
}

/** One hash per file per lookup, however many records cite it. */
function currentHash(cache, sourceReal) {
  let pending = cache.hashes.get(sourceReal);
  if (pending === undefined) {
    pending = readCappedFile(sourceReal).then(sha256);
    cache.hashes.set(sourceReal, pending);
  }
  return pending;
}

/* ---------- search ---------- */

function tokenize(query) {
  return [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .filter((term) => term.length > 1),
    ),
  ];
}

/**
 * Searchable text is the record's *values* only. Field names ("id", "path",
 * "summary") and provenance never match, so a query like "id" cannot hit every
 * record.
 */
function searchableText(record) {
  const parts = [];
  collect(record, parts, 0);
  return parts.join('\n').toLocaleLowerCase();
}

function collect(value, parts, depth) {
  if (depth > 6) return;
  if (typeof value === 'string') parts.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean') parts.push(String(value));
  else if (Array.isArray(value)) for (const item of value) collect(item, parts, depth + 1);
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (depth === 0 && SEARCH_SKIP.has(key)) continue;
      collect(item, parts, depth + 1);
    }
  }
}

/**
 * Declared source paths, deduplicated, with a trailing `:START-END` line range
 * removed (the SKILL cites ranges). Anything unparseable sets `malformed` so a
 * record can never look source-free and be called fresh.
 */
function declaredSources(sources) {
  if (sources === undefined || sources === null) return { paths: [], malformed: false };
  if (!Array.isArray(sources)) return { paths: [], malformed: true };

  const paths = new Set();
  let malformed = false;

  for (const source of sources) {
    const raw = typeof source === 'string' ? source : isRecord(source) ? source.path : undefined;
    if (typeof raw === 'string' && raw.trim() !== '') paths.add(raw.trim().replace(LINE_SUFFIX, ''));
    else malformed = true;
  }

  return { paths: [...paths], malformed };
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
