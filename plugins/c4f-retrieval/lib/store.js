// Verified-context store: a JSONL file with provenance stamps and freshness
// checks. Records keep the MCP layout (`_retrieval` metadata) so existing
// context files stay readable.
//
// Concurrency: writes are serialized per file within one process (the host
// loads one plugin instance, and a reload reuses the same queue registry).
// Two OpenCode processes sharing one workspace are NOT serialized, and no
// on-disk lock is provided — accepted limit: one process per workspace.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { isInside, readCappedFile, resolveHead, relativeTo } from './repo.js';

const METADATA_KEY = '_retrieval';
const SAFE_KEY = /^[A-Za-z_][\w-]*$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Write serialization, keyed by the resolved store path.
 *
 * The registry lives on `globalThis` rather than in module scope: a plugin
 * reload re-executes this module, and a fresh module-scope Map would let the
 * old closures and the new ones write the same file unserialized.
 */
const QUEUE_REGISTRY = Symbol.for('opencode.retrieval.storeQueues');
const queues = (globalThis[QUEUE_REGISTRY] ??= new Map());

function serialize(file, operation) {
  // Normalize the key so two spellings of one path cannot bypass the queue.
  const key = resolve(file);

  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(operation, operation);

  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  void settled.then(() => {
    // Drop the entry once this store is idle so the registry cannot grow.
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
    invalidate: (ids, reason) => serialize(file, () => invalidate(file, ids, reason)),
  };
}

async function lookup(file, query, root, maxResults = 10) {
  if (typeof query !== 'string') throw new Error('query must be a string');

  const limit = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : 10;
  const records = await readAll(file);
  const terms = tokenize(query);

  const evaluated = await Promise.all(
    records.map(async (record) => {
      const searchable = searchableText(record);
      const matchingTerms = terms.filter((term) => searchable.includes(term));
      return {
        record,
        freshness: await freshness(record, root),
        score: terms.length === 0 ? 0 : matchingTerms.length / terms.length,
        matchingTerms,
      };
    }),
  );

  const results = evaluated
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ record, freshness: state, score, matchingTerms }) => ({
      ...record,
      freshness: state,
      _match: { score: Number(score.toFixed(3)), terms: matchingTerms },
    }));

  return { query, count: results.length, results, context_file: file };
}

async function upsert(file, recordInput, key = 'id', root) {
  if (!isRecord(recordInput)) throw new Error('record must be an object');
  if (typeof key !== 'string' || !SAFE_KEY.test(key) || RESERVED_KEYS.has(key)) {
    throw new Error(`key must be a plain identifier field name, got ${JSON.stringify(key)}`);
  }
  if (!Object.hasOwn(recordInput, key)) {
    throw new Error(`record.${key} is required to upsert context`);
  }

  const record = structuredClone(recordInput);
  const identity = record[key];
  if (identity === undefined || identity === null || String(identity).trim() === '') {
    throw new Error(`record.${key} is required to upsert context`);
  }
  const identityValue = String(identity);

  const { stamped, unstamped, malformed } = await stamp(record, root);
  const records = await readAll(file);
  const existing = records.findIndex((item) => item[key] !== undefined && String(item[key]) === identityValue);

  if (existing >= 0) records[existing] = stamped;
  else records.push(stamped);

  await writeAll(file, records);

  return {
    stored: true,
    key,
    identity: identityValue,
    replaced: existing >= 0,
    record: stamped,
    // Only present when a declared source could not be hashed; the model should
    // fix the path, and freshness will report the record as unknown until it does.
    ...(unstamped.length > 0 ? { unstamped } : {}),
    ...(malformed ? { sources_malformed: true } : {}),
    context_file: file,
  };
}

async function invalidate(file, ids, reason = '') {
  const records = await readAll(file);
  const selected = new Set(ids.map(String));
  const at = new Date().toISOString();
  let invalidated = 0;

  const updated = records.map((record) => {
    const id = record.id === undefined ? '' : String(record.id);
    if (!selected.has(id)) return record;
    invalidated += 1;
    return {
      ...record,
      status: 'stale',
      invalidation: { reason: reason || 'Invalidated by context_invalidate', at },
    };
  });

  // A no-op must not rewrite the file or create it.
  if (invalidated > 0) await writeAll(file, updated);

  return { invalidated, requested: ids, reason, context_file: file };
}

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
      // Silently dropping it would delete the line on the next write.
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
        // Reported below; never silently treated as covered.
      }
    }

    if (stamped === null) unstamped.push(sourcePath);
    else sourceHashes.push(stamped);
  }

  return {
    unstamped,
    malformed: declared.malformed,
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
 *
 * `fresh` is only ever returned when something was verified and still matches:
 * every stamped source hash, or the recorded HEAD when no hashes exist. Anything
 * unverifiable is `unknown` — never `fresh`.
 */
async function freshness(record, root) {
  const reasons = [];
  if (record.status === 'stale') reasons.push('record explicitly invalidated');

  const metadata = record[METADATA_KEY];
  if (!isRecord(metadata)) {
    return { status: 'unknown', reasons: [...reasons, 'record has no retrieval provenance metadata'] };
  }

  if (typeof metadata.repoRoot !== 'string') {
    reasons.push('provenance has no repository root');
  } else if (resolve(metadata.repoRoot) !== resolve(root)) {
    reasons.push('repository root differs from stored provenance');
  }

  // A declared source in a shape we cannot parse is still a declared source.
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
    const rootReal = await realpath(root).catch(() => resolve(root));

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

      // Resolve symlinks before reading: a link inside the root must not become
      // a read outside it.
      if (!isInside(rootReal, sourceReal)) {
        reasons.push(`source path is outside repository: ${source.path}`);
        continue;
      }

      try {
        const current = sha256(await readCappedFile(sourceReal));
        if (current !== source.sha256) reasons.push(`source changed: ${source.path}`);
      } catch (err) {
        // A file too large to hash is unverifiable, not missing.
        const tooLarge = /exceeds \d+ bytes/.test(errorMessage(err));
        reasons.push(`${tooLarge ? 'source too large to verify' : 'source missing'}: ${source.path}`);
      }
    }
  }

  if (verifiable && hashes.length === 0) {
    if (typeof metadata.gitHead === 'string') {
      const liveHead = await resolveHead(root);
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

function tokenize(query) {
  return [...new Set(query.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1))];
}

function searchableText(record) {
  // Provenance bookkeeping must not make a record match its own query.
  const { [METADATA_KEY]: _ignored, ...rest } = record;
  return JSON.stringify(rest).toLocaleLowerCase();
}

/**
 * Read the declared sources without losing information: anything unparseable
 * sets `malformed` so a record can never look source-free and be called fresh.
 */
function declaredSources(sources) {
  if (sources === undefined || sources === null) return { paths: [], malformed: false };
  if (!Array.isArray(sources)) return { paths: [], malformed: true };

  const paths = [];
  let malformed = false;

  for (const source of sources) {
    if (typeof source === 'string' && source.trim() !== '') paths.push(source);
    else if (isRecord(source) && typeof source.path === 'string' && source.path.trim() !== '') paths.push(source.path);
    else malformed = true;
  }

  return { paths, malformed };
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
