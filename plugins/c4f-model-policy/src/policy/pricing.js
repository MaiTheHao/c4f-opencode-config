// Registry pricing: classification (FREE / PAID / UNPRICED) and snapshot enrichment.

import { baseId, normalizeProviderID, pricingKey } from './ids.js';

/** A price is real only when it is a finite number — never a coerced string. */
export function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A tier is valid only when `{ type: 'context', size: <positive int> }`. */
function isValidTier(tier) {
  return isPlainObject(tier) && tier.type === 'context' && Number.isInteger(tier.size) && tier.size > 0;
}

/**
 * Classify a registry `cost` array as FREE, PAID, or UNPRICED.
 * Prices are USD per million tokens; only real numeric zeros count as FREE.
 */
export function classifyCost(cost) {
  if (!Array.isArray(cost) || cost.length === 0) return 'UNPRICED';

  let hasPositive = false;
  for (const entry of cost) {
    if (!isPlainObject(entry)) return 'UNPRICED';
    if (entry.tier !== undefined && !isValidTier(entry.tier)) return 'UNPRICED';
    if (!isPlainObject(entry.cache)) return 'UNPRICED';

    for (const value of [entry.input, entry.output, entry.cache.read, entry.cache.write]) {
      if (!isMoney(value) || value < 0) return 'UNPRICED';
      if (value > 0) hasPositive = true;
    }
  }
  return hasPositive ? 'PAID' : 'FREE';
}

/** Registry variant ids: strings only, trimmed, de-duplicated, order preserved. */
function variantIDs(variants) {
  if (!Array.isArray(variants)) return [];

  const ids = [];
  for (const variant of variants) {
    const raw = typeof variant === 'string'
      ? variant
      : isPlainObject(variant) && typeof variant.id === 'string' ? variant.id : '';
    const id = raw.trim();
    if (id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function unavailable(snapshot, error) {
  return {
    ...snapshot,
    pricing: new Map(),
    pricingStatus: 'unavailable',
    pricingLoadedAt: null,
    pricingError: error ?? 'registry model list unavailable',
  };
}

/**
 * Attach registry pricing to a snapshot, returning a NEW snapshot.
 * Out-of-scope providers are not priced. Never mutates the input snapshot.
 */
export function attachPricing(snapshot, { models, error = null } = {}) {
  if (!isPlainObject(snapshot)) return snapshot;
  if (error !== null || !Array.isArray(models)) return unavailable(snapshot, error);

  const pricing = new Map();
  for (const model of models) {
    if (!isPlainObject(model)) continue;

    const providerID = normalizeProviderID(model.providerID);
    const rawId = typeof model.id === 'string' ? model.id : typeof model.modelID === 'string' ? model.modelID : '';
    const key = pricingKey(providerID, rawId);
    if (key === '') continue;
    if (!(snapshot.filteredProviders instanceof Set) || !snapshot.filteredProviders.has(providerID)) continue;

    const first = Array.isArray(model.cost) && model.cost.length > 0 ? model.cost[0] : null;
    const firstObj = isPlainObject(first) ? first : null;

    pricing.set(key, {
      providerID,
      id: baseId(rawId),
      input: firstObj !== null && isMoney(firstObj.input) ? firstObj.input : null,
      output: firstObj !== null && isMoney(firstObj.output) ? firstObj.output : null,
      variants: variantIDs(model.variants),
      classification: classifyCost(model.cost),
    });
  }

  return { ...snapshot, pricing, pricingStatus: 'loaded', pricingLoadedAt: Date.now(), pricingError: null };
}
