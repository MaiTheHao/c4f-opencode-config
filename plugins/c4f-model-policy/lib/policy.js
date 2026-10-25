// Pure policy core: allowlist parsing, loading, and model classification.
// Importing this module has no side effects and it must never be able to spawn
// a process: only `node:fs/promises` may be imported here (asserted in
// test/policy.test.js).

import { readFile } from 'node:fs/promises';

const DEFAULT_FREE_SUFFIX = '-free';
const DEFAULT_ALLOWLIST_FILE = new URL('../allowed_models.json', import.meta.url);

/** Convert a provider-qualified / variant model identifier to its base id. */
export function baseId(id) {
  const last = id.trim().split('/').pop() ?? '';
  const hash = last.indexOf('#');
  return (hash === -1 ? last : last.slice(0, hash)).toLowerCase();
}

/** A price is real only when it is a finite number — never a coerced string. */
export function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parse allowed_models.json content into `{ authorized, banned }` base-id sets.
 * Fails closed: every malformed entry throws an `allowlist …` error instead of
 * being skipped or coerced.
 */
export function parseAllowlist(raw) {
  const { authorized, banned } = parseEntries(raw);
  return { authorized: new Set(authorized.keys()), banned };
}

/**
 * Read the allowlist and return what both consumers need: `authorized` (base id
 * → entry metadata), `banned` (set of base ids) and the optional `free` block.
 * `file` is a test override. Missing or invalid input throws (fail closed).
 */
export async function loadAllowlist(file = DEFAULT_ALLOWLIST_FILE) {
  return parseEntries(await readAllowlistFile(file));
}

/** Load the enforcement snapshot: base-id sets plus the free suffix. */
export async function loadSnapshot({ file = DEFAULT_ALLOWLIST_FILE, freeSuffix } = {}) {
  const { authorized, banned } = parseAllowlist(await readAllowlistFile(file));
  return { authorized, banned, freeSuffix, loadedAt: Date.now() };
}

/**
 * Pricing-aware classification used by the CLI: a priced id is free only when
 * input AND output are both real numeric zeros; a non-numeric price is a
 * pricing error, never a "paid" verdict; an unpriced id falls back to the
 * free suffix.
 */
export function isFree(modelId, pricing, freeSuffix = DEFAULT_FREE_SUFFIX) {
  const cost = pricing.get(modelId);
  if (cost === undefined) return modelId.endsWith(freeSuffix);

  // A missing axis counts as full price (not free).
  const axes = { input: cost.input ?? 1, output: cost.output ?? 1 };

  // Zero must be a real numeric 0: Number('') and Number('0x0') are also 0,
  // and coercing them would mark a paid model FREE.
  for (const [axis, value] of Object.entries(axes)) {
    if (!isMoney(value)) {
      throw new TypeError(
        `PRICING CACHE ERROR: ${modelId} cost.${axis} must be a finite number, got ${JSON.stringify(value)}`,
      );
    }
  }

  return axes.input === 0 && axes.output === 0;
}

/** CLI order: banned → authorized → free → unauthorized. */
export function classify(modelId, allowed, pricing, freeSuffix = DEFAULT_FREE_SUFFIX) {
  const id = baseId(modelId);

  if (allowed.banned.has(id)) return 'BANNED';
  if (allowed.authorized.has(id)) return 'AUTHORIZED';
  if (isFree(modelId, pricing, freeSuffix)) return 'FREE';
  return 'UNAUTHORIZED';
}

/**
 * Enforcement predicate: banned → authorized → free suffix → deny.
 *
 * Deliberately independent of `classify` and of the pricing cache: `classify`
 * may return FREE for a zero-priced model missing from the allowlist, and
 * enforcement must stay strictly narrower than that. Do not unify the two.
 */
export function isAllowed(snapshot, ref) {
  try {
    if (snapshot === null || typeof snapshot !== 'object') return false;
    if (ref === null || typeof ref !== 'object' || typeof ref.id !== 'string') return false;

    const base = baseId(ref.id);
    if (base === '' || snapshot.banned.has(base)) return false;
    if (snapshot.authorized.has(base)) return true;

    const suffix = snapshot.freeSuffix;
    return typeof suffix === 'string' && suffix !== '' && base.endsWith(suffix);
  } catch {
    return false;
  }
}

async function readAllowlistFile(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`allowlist: cannot read ${file}: ${errorMessage(err)}`);
  }
}

function parseEntries(raw) {
  const parsed = parseJsonObject(raw);
  return {
    authorized: validateAuthorized(parsed),
    banned: validateBanned(parsed),
    free: parsed.free ?? undefined,
  };
}

function parseJsonObject(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`allowlist: invalid JSON: ${errorMessage(err)}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const got = Array.isArray(parsed) ? 'array' : typeof parsed;
    throw new Error(`allowlist: expected a JSON object, got ${got}`);
  }

  return parsed;
}

/** Validate `authorized`, returning a Map of base id → entry metadata. */
function validateAuthorized({ authorized }) {
  if (!Array.isArray(authorized)) {
    throw new Error(`allowlist: "authorized" must be an array, got ${typeof authorized}`);
  }
  if (authorized.length === 0) {
    throw new Error('allowlist: "authorized" must be a non-empty array');
  }

  const entries = new Map();
  for (const entry of authorized) {
    const isObject = entry !== null && typeof entry === 'object';
    const id = typeof entry === 'string' ? entry : isObject ? entry.id : undefined;

    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error(
        'allowlist: each authorized entry must be a string or an object with a non-empty string id',
      );
    }
    entries.set(baseId(id), typeof entry === 'string' ? { id: entry } : entry);
  }

  return entries;
}

/** Validate `banned`, returning a set of base ids. Never String()-coerces. */
function validateBanned({ banned }) {
  const ids = new Set();
  if (banned === undefined) return ids;

  if (!Array.isArray(banned)) {
    throw new Error(`allowlist: "banned" must be an array, got ${typeof banned}`);
  }

  for (const entry of banned) {
    if (typeof entry !== 'string') {
      throw new Error('allowlist: each banned entry must be a string');
    }
    ids.add(baseId(entry));
  }

  return ids;
}
