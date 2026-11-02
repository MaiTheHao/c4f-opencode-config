// Policy verdicts. Order is config-driven: first matching predicate wins.

import { DEFAULT_DECISION } from './bootstrap.js';
import { baseId, normalizeProviderID, pricingKey } from './ids.js';

export const DECISION = Object.freeze({
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  BANNED: 'BANNED',
  AUTHORIZED: 'AUTHORIZED',
  FREE: 'FREE',
  DENIED: 'DENIED',
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const PREDICATES = Object.freeze({
  OUT_OF_SCOPE: (snapshot, providerID) => !snapshot.filteredProviders.has(providerID),
  BANNED: (snapshot, providerID, id) => snapshot.banned.has(id),
  AUTHORIZED: (snapshot, providerID, id) => snapshot.authorized.has(id),
  FREE: (snapshot, providerID, id) => {
    if (!(snapshot.pricing instanceof Map)) return false;
    const entry = snapshot.pricing.get(pricingKey(providerID, id));
    return isPlainObject(entry) && entry.classification === 'FREE';
  },
  DENIED: () => true,
});

/** Never throws: any malformed input yields DENIED. */
export function policyDecision(snapshot, ref) {
  try {
    if (!isPlainObject(snapshot)) return DECISION.DENIED;
    if (!isPlainObject(ref) || typeof ref.id !== 'string') return DECISION.DENIED;
    if (!(snapshot.filteredProviders instanceof Set)) return DECISION.DENIED;

    const providerID = normalizeProviderID(ref.providerID);
    const id = baseId(ref.id);
    if (providerID === '' || id === '') return DECISION.DENIED;

    const order = snapshot?.decision?.order ?? DEFAULT_DECISION.order;
    for (const token of order) {
      const predicate = PREDICATES[token];
      if (typeof predicate !== 'function') continue;
      if (predicate(snapshot, providerID, id)) return token;
    }
    return DECISION.DENIED;
  } catch {
    return DECISION.DENIED;
  }
}

/** Enforcement predicate. Never throws. */
export function isAllowed(snapshot, ref) {
  try {
    const allowed = new Set(snapshot?.decision?.allowed ?? DEFAULT_DECISION.allowed);
    return allowed.has(policyDecision(snapshot, ref));
  } catch {
    return false;
  }
}
