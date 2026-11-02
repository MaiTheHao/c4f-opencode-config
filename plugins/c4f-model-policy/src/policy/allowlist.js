// Allowlist file loading and validation. Missing or invalid input throws (fail closed).
// Only `node:fs/promises` may be imported here: this module must never spawn a process.

import { readFile } from 'node:fs/promises';
import { errorMessage } from '../shared/errors.js';
import {
  BOOTSTRAP_RUNTIME,
  DEFAULT_CLASSIFICATION,
  DEFAULT_DECISION,
  VERDICT_TOKENS,
} from './bootstrap.js';
import { baseId, normalizeProviderID } from './ids.js';

const DEFAULT_ALLOWLIST_FILE = new URL('../../allowed_models.json', import.meta.url);
const OVERRIDE_FILE = new URL('../../allowed_models.override.json', import.meta.url);

/**
 * Read the allowlist and return the policy-only snapshot.
 * `file` is a test override: when given, exactly that file is read (no cascade).
 * Otherwise the override file is tried first; any read/parse/validation failure
 * falls back to the default file and records `overrideError`. The `runtime`
 * block is NOT validated here: it is boot-only config owned by `loadRuntime`.
 */
export async function loadSnapshot({ file = undefined, overrideFile = OVERRIDE_FILE } = {}) {
  const { parsed, source, overrideError } = await loadValidated({ file, overrideFile });
  const envelope = validateEnvelope(parsed);
  return {
    filteredProviders: validateFilteredProviders(parsed),
    authorized: validateAuthorized(parsed),
    banned: validateBanned(parsed),
    decision: envelope.decision,
    classification: envelope.classification,
    configSource: source,
    overrideError,
    pricing: new Map(),
    pricingStatus: 'unavailable',
    pricingLoadedAt: null,
    pricingError: null,
    loadedAt: Date.now(),
  };
}

async function readAllowlistFile(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`allowlist: cannot read ${file}: ${errorMessage(err)}`);
  }
}

function validateParsed(raw) {
  const parsed = parseJsonObject(raw);
  validateFilteredProviders(parsed);
  validateAuthorized(parsed);
  validateBanned(parsed);
  validateEnvelope(parsed);
  return parsed;
}

async function loadValidated({ file = undefined, overrideFile = OVERRIDE_FILE } = {}) {
  if (file !== undefined) {
    const parsed = validateParsed(await readAllowlistFile(file));
    return { parsed, source: 'default', overrideError: null };
  }
  let overrideError = null;
  try {
    const parsed = validateParsed(await readAllowlistFile(overrideFile));
    return { parsed, source: 'override', overrideError: null };
  } catch (err) {
    overrideError = errorMessage(err);
  }
  const parsed = validateParsed(await readAllowlistFile(DEFAULT_ALLOWLIST_FILE));
  return { parsed, source: 'default', overrideError };
}

/**
 * Never throws: a broken override falls back to the default file's runtime,
 * a broken default returns BOOTSTRAP_RUNTIME by identity.
 */
export async function loadRuntime({ file = undefined, overrideFile = OVERRIDE_FILE } = {}) {
  const { parsed } = await loadValidated({ file, overrideFile }).catch(() => ({ parsed: null }));
  if (parsed === null) return BOOTSTRAP_RUNTIME;
  try {
    return validateRuntimeValue(parsed.runtime);
  } catch {
    if (file !== undefined) return BOOTSTRAP_RUNTIME;
    try {
      const raw = await readAllowlistFile(DEFAULT_ALLOWLIST_FILE);
      return validateRuntimeValue(parseJsonObject(raw).runtime);
    } catch {
      return BOOTSTRAP_RUNTIME;
    }
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateEnvelope(parsed) {
  const { schemaVersion, decision, classification } = parsed;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new Error(`allowlist: "schemaVersion" must be 1, got ${JSON.stringify(schemaVersion)}`);
  }
  let order = DEFAULT_DECISION.order;
  let allowed = undefined;
  if (decision !== undefined) {
    if (!isPlainRecord(decision)) {
      throw new Error(`allowlist: "decision" must be an object, got ${typeof decision}`);
    }
    if (decision.order !== undefined) order = decision.order;
    if (decision.allowed !== undefined) allowed = decision.allowed;
  }
  if (!Array.isArray(order)) {
    throw new Error(`allowlist: "decision.order" must be an array, got ${typeof order}`);
  }
  for (const token of order) {
    if (!VERDICT_TOKENS.has(token)) {
      throw new Error(`allowlist: "decision.order" has unknown token ${JSON.stringify(token)}`);
    }
  }
  if (new Set(order).size !== order.length) {
    throw new Error('allowlist: "decision.order" must not contain duplicates');
  }
  if (order[order.length - 1] !== 'DENIED') {
    throw new Error('allowlist: "decision.order" must end with "DENIED"');
  }
  let allowedList = allowed;
  if (allowedList === undefined) {
    allowedList = order.filter((t) => DEFAULT_DECISION.allowed.includes(t));
  }
  if (!Array.isArray(allowedList)) {
    throw new Error(`allowlist: "decision.allowed" must be an array, got ${typeof allowedList}`);
  }
  if (allowedList.length === 0) {
    throw new Error('allowlist: "decision.allowed" must be a non-empty array');
  }
  for (const token of allowedList) {
    if (!VERDICT_TOKENS.has(token)) {
      throw new Error(`allowlist: "decision.allowed" has unknown token ${JSON.stringify(token)}`);
    }
    if (!order.includes(token)) {
      throw new Error(`allowlist: "decision.allowed" token ${JSON.stringify(token)} is not in "decision.order"`);
    }
    if (token === 'DENIED' || token === 'BANNED') {
      throw new Error(`allowlist: "decision.allowed" must exclude ${JSON.stringify(token)}`);
    }
  }
  if (classification !== undefined && !isPlainRecord(classification)) {
    throw new Error(`allowlist: "classification" must be an object, got ${typeof classification}`);
  }
  const free = classification === undefined ? undefined : classification.free;
  const invalidTier = classification === undefined ? undefined : classification.invalidTier;
  const freeValue = free === undefined ? DEFAULT_CLASSIFICATION.free : free;
  const invalidTierValue = invalidTier === undefined ? DEFAULT_CLASSIFICATION.invalidTier : invalidTier;
  if (freeValue !== 'all-zero' && freeValue !== 'any-zero') {
    throw new Error(`allowlist: "classification.free" must be "all-zero" or "any-zero", got ${JSON.stringify(freeValue)}`);
  }
  if (invalidTierValue !== 'unpriced' && invalidTierValue !== 'ignore') {
    throw new Error(`allowlist: "classification.invalidTier" must be "unpriced" or "ignore", got ${JSON.stringify(invalidTierValue)}`);
  }
  return {
    decision: Object.freeze({ order: Object.freeze([...order]), allowed: Object.freeze([...allowedList]) }),
    classification: Object.freeze({ free: freeValue, invalidTier: invalidTierValue }),
  };
}

function validateRuntimeValue(raw) {
  if (raw === undefined) return BOOTSTRAP_RUNTIME;
  if (!isPlainRecord(raw)) {
    throw new Error(`allowlist: "runtime" must be an object, got ${typeof raw}`);
  }
  const enabled = raw.enabled === undefined ? BOOTSTRAP_RUNTIME.enabled : raw.enabled;
  const gate = raw.gate === undefined ? BOOTSTRAP_RUNTIME.gate : raw.gate;
  const onSnapshotFailure = raw.onSnapshotFailure === undefined ? BOOTSTRAP_RUNTIME.onSnapshotFailure : raw.onSnapshotFailure;
  const refreshMs = raw.refreshMs === undefined ? BOOTSTRAP_RUNTIME.refreshMs : raw.refreshMs;
  if (typeof enabled !== 'boolean') {
    throw new Error(`allowlist: "runtime.enabled" must be a boolean, got ${typeof enabled}`);
  }
  if (gate !== 'interrupt' && gate !== 'off') {
    throw new Error(`allowlist: "runtime.gate" must be "interrupt" or "off", got ${JSON.stringify(gate)}`);
  }
  if (onSnapshotFailure !== 'fail-closed' && onSnapshotFailure !== 'fail-open') {
    throw new Error(`allowlist: "runtime.onSnapshotFailure" must be "fail-closed" or "fail-open", got ${JSON.stringify(onSnapshotFailure)}`);
  }
  if (typeof refreshMs !== 'number') {
    throw new Error(`allowlist: "runtime.refreshMs" must be a finite number, got ${JSON.stringify(refreshMs)}`);
  }
  if (!Number.isFinite(refreshMs) || refreshMs < 0) {
    return Object.freeze({ enabled, gate, onSnapshotFailure, refreshMs: 0 });
  }
  return Object.freeze({ enabled, gate, onSnapshotFailure, refreshMs });
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
