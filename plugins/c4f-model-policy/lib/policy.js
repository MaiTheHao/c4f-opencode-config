// Pure policy core: allowlist parsing, loading, and pricing classification.
// Importing this module has no side effects and it must never be able to spawn
// a process: only `node:fs/promises` may be imported here.

import { readFile } from 'node:fs/promises';

const DEFAULT_ALLOWLIST_FILE = new URL('../allowed_models.json', import.meta.url);

/** Separator joining provider and model parts of a pricing key. */
export const PRICING_KEY_SEP = '\0';

/** Policy verdicts returned by `policyDecision`. */
export const DECISION = Object.freeze({
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  BANNED: 'BANNED',
  AUTHORIZED: 'AUTHORIZED',
  FREE: 'FREE',
  DENIED: 'DENIED',
});

/** Convert a provider-qualified / variant model identifier to its base id. */
export function baseId(id) {
  const last = id.trim().split('/').pop() ?? '';
  const hash = last.indexOf('#');
  return (hash === -1 ? last : last.slice(0, hash)).toLowerCase();
}

/** Normalize a provider id for exact comparison: trim + lowercase. */
export function normalizeProviderID(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** A price is real only when it is a finite number — never a coerced string. */
export function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Extract a message from any thrown value. */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Join normalized provider and base model ids, or '' when either part is empty. */
export function pricingKey(providerID, modelID) {
  const provider = normalizeProviderID(providerID);
  const id = typeof modelID === 'string' ? baseId(modelID) : '';
  if (provider === '' || id === '') return '';
  return `${provider}${PRICING_KEY_SEP}${id}`;
}

/**
 * Classify a registry `cost` array as FREE, PAID, or UNPRICED.
 * Prices are USD per million tokens; only real numeric zeros count as FREE.
 */
export function classifyCost(cost) {
  if (!Array.isArray(cost) || cost.length === 0) return 'UNPRICED';
  let hasPositive = false;
  for (const entry of cost) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return 'UNPRICED';
    if (entry.tier !== undefined && !isValidTier(entry.tier)) return 'UNPRICED';
    if (entry.cache === null || typeof entry.cache !== 'object' || Array.isArray(entry.cache)) {
      return 'UNPRICED';
    }
    const values = [entry.input, entry.output, entry.cache.read, entry.cache.write];
    for (const value of values) {
      if (!isMoney(value)) return 'UNPRICED';
      if (value < 0) return 'UNPRICED';
      if (value > 0) hasPositive = true;
    }
  }
  return hasPositive ? 'PAID' : 'FREE';
}

/**
 * Read the allowlist and return the policy-only snapshot.
 * `file` is a test override. Missing or invalid input throws (fail closed).
 */
export async function loadSnapshot({ file = DEFAULT_ALLOWLIST_FILE } = {}) {
  const raw = await readAllowlistFile(file);
  const parsed = parseJsonObject(raw);
  return {
    filteredProviders: validateFilteredProviders(parsed),
    authorized: validateAuthorized(parsed),
    banned: validateBanned(parsed),
    pricing: new Map(),
    pricingStatus: 'unavailable',
    pricingLoadedAt: null,
    pricingError: null,
    loadedAt: Date.now(),
  };
}

/**
 * Attach registry pricing to a snapshot, returning a NEW snapshot.
 * Out-of-scope providers are not priced. Never mutates the input snapshot.
 */
export function attachPricing(snapshot, { models, error = null } = {}) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot;
  }
  if (error !== null || !Array.isArray(models)) {
    return {
      ...snapshot,
      pricing: new Map(),
      pricingStatus: 'unavailable',
      pricingLoadedAt: null,
      pricingError: error ?? 'registry model list unavailable',
    };
  }
  const pricing = new Map();
  for (const model of models) {
    if (model === null || typeof model !== 'object' || Array.isArray(model)) continue;
    const providerID = normalizeProviderID(model.providerID);
    const rawId = typeof model.id === 'string'
      ? model.id
      : typeof model.modelID === 'string' ? model.modelID : '';
    const key = pricingKey(providerID, rawId);
    if (key === '') continue;
    if (!(snapshot.filteredProviders instanceof Set) || !snapshot.filteredProviders.has(providerID)) {
      continue;
    }
    const classification = classifyCost(model.cost);
    const first = Array.isArray(model.cost) && model.cost.length > 0 ? model.cost[0] : null;
    const firstObj = first !== null && typeof first === 'object' && !Array.isArray(first) ? first : null;
    pricing.set(key, {
      providerID,
      id: baseId(rawId),
      input: firstObj !== null && isMoney(firstObj.input) ? firstObj.input : null,
      output: firstObj !== null && isMoney(firstObj.output) ? firstObj.output : null,
      variants: variantIDs(model.variants),
      classification,
    });
  }
  return {
    ...snapshot,
    pricing,
    pricingStatus: 'loaded',
    pricingLoadedAt: Date.now(),
    pricingError: null,
  };
}

/**
 * Policy order: scope → banned → authorized → priced FREE → deny.
 * Never throws: any malformed input yields DENIED.
 */
export function policyDecision(snapshot, ref) {
  try {
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return DECISION.DENIED;
    }
    if (ref === null || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.id !== 'string') {
      return DECISION.DENIED;
    }
    if (!(snapshot.filteredProviders instanceof Set)) return DECISION.DENIED;
    const providerID = normalizeProviderID(ref.providerID);
    const id = baseId(ref.id);
    if (providerID === '' || id === '') return DECISION.DENIED;
    if (!snapshot.filteredProviders.has(providerID)) return DECISION.OUT_OF_SCOPE;
    if (snapshot.banned.has(id)) return DECISION.BANNED;
    if (snapshot.authorized.has(id)) return DECISION.AUTHORIZED;
    if (snapshot.pricing instanceof Map) {
      const entry = snapshot.pricing.get(pricingKey(providerID, id));
      if (entry !== null && typeof entry === 'object' && entry.classification === 'FREE') {
        return DECISION.FREE;
      }
    }
    return DECISION.DENIED;
  } catch {
    return DECISION.DENIED;
  }
}

/**
 * Enforcement predicate: OUT_OF_SCOPE, AUTHORIZED, or FREE are allowed.
 * Never throws.
 */
export function isAllowed(snapshot, ref) {
  try {
    const decision = policyDecision(snapshot, ref);
    return decision === DECISION.OUT_OF_SCOPE
      || decision === DECISION.AUTHORIZED
      || decision === DECISION.FREE;
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

/** Validate `filteredProviders`, returning a Set of normalized provider ids. */
function validateFilteredProviders({ filteredProviders }) {
  if (filteredProviders === undefined) {
    throw new Error('allowlist: "filteredProviders" is required');
  }
  if (!Array.isArray(filteredProviders)) {
    throw new Error(`allowlist: "filteredProviders" must be an array, got ${typeof filteredProviders}`);
  }
  if (filteredProviders.length === 0) {
    throw new Error('allowlist: "filteredProviders" must be a non-empty array');
  }
  const ids = new Set();
  for (const entry of filteredProviders) {
    if (typeof entry !== 'string') {
      throw new Error('allowlist: "filteredProviders" entries must be strings');
    }
    const normalized = normalizeProviderID(entry);
    if (normalized === '') {
      throw new Error('allowlist: "filteredProviders" entries must be non-empty provider ids');
    }
    ids.add(normalized);
  }
  return ids;
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

/** A tier is valid only when omitted or `{ type: 'context', size: <positive int> }`. */
function isValidTier(tier) {
  if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) return false;
  if (tier.type !== 'context') return false;
  return Number.isInteger(tier.size) && tier.size > 0;
}

/** Registry variant ids: strings only, trimmed, de-duplicated, order preserved. */
function variantIDs(variants) {
  if (!Array.isArray(variants)) return [];
  const ids = [];
  for (const variant of variants) {
    const raw = typeof variant === 'string'
      ? variant
      : variant !== null && typeof variant === 'object' && typeof variant.id === 'string' ? variant.id : '';
    const id = raw.trim();
    if (id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
