// Allowlist file loading and validation. Missing or invalid input throws (fail closed).
// Only `node:fs/promises` may be imported here: this module must never spawn a process.

import { readFile } from 'node:fs/promises';
import { errorMessage } from '../shared/errors.js';
import { baseId, normalizeProviderID } from './ids.js';

const DEFAULT_ALLOWLIST_FILE = new URL('../../allowed_models.json', import.meta.url);

/**
 * Read the allowlist and return the policy-only snapshot.
 * `file` is a test override.
 */
export async function loadSnapshot({ file = DEFAULT_ALLOWLIST_FILE } = {}) {
  const parsed = parseJsonObject(await readAllowlistFile(file));
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
