// Policy verdicts. Order: scope → banned → authorized → priced FREE → deny.

import { baseId, normalizeProviderID, pricingKey } from './ids.js';

export const DECISION = Object.freeze({
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  BANNED: 'BANNED',
  AUTHORIZED: 'AUTHORIZED',
  FREE: 'FREE',
  DENIED: 'DENIED',
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Never throws: any malformed input yields DENIED. */
export function policyDecision(snapshot, ref) {
  try {
    if (!isPlainObject(snapshot)) return DECISION.DENIED;
    if (!isPlainObject(ref) || typeof ref.id !== 'string') return DECISION.DENIED;
    if (!(snapshot.filteredProviders instanceof Set)) return DECISION.DENIED;

    const providerID = normalizeProviderID(ref.providerID);
    const id = baseId(ref.id);
    if (providerID === '' || id === '') return DECISION.DENIED;

    if (!snapshot.filteredProviders.has(providerID)) return DECISION.OUT_OF_SCOPE;
    if (snapshot.banned.has(id)) return DECISION.BANNED;
    if (snapshot.authorized.has(id)) return DECISION.AUTHORIZED;

    if (snapshot.pricing instanceof Map) {
      const entry = snapshot.pricing.get(pricingKey(providerID, id));
      if (isPlainObject(entry) && entry.classification === 'FREE') return DECISION.FREE;
    }
    return DECISION.DENIED;
  } catch {
    return DECISION.DENIED;
  }
}

const ALLOWED_DECISIONS = new Set([DECISION.OUT_OF_SCOPE, DECISION.AUTHORIZED, DECISION.FREE]);

/** Enforcement predicate. Never throws. */
export function isAllowed(snapshot, ref) {
  try {
    return ALLOWED_DECISIONS.has(policyDecision(snapshot, ref));
  } catch {
    return false;
  }
}
