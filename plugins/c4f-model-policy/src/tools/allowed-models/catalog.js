// Single data source for every view: join the allowlist (tier, trigger) with
// the registry snapshot (prices, variants) and attach the policy decision.

import { baseId, DECISION, policyDecision } from '../../policy/index.js';

/** Provider label for an authorized entry the registry cannot place. */
export const UNKNOWN_PROVIDER = '-';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPricingLoaded = (snapshot) =>
  isPlainObject(snapshot) && snapshot.pricing instanceof Map && snapshot.pricingStatus === 'loaded';

const tierOf = (entry) => (Number.isFinite(entry?.cost) ? entry.cost : null);
const triggerOf = (entry) =>
  Array.isArray(entry?.trigger) ? entry.trigger.filter((tag) => typeof tag === 'string' && tag.trim() !== '') : null;
const variantsOf = (registry) => (Array.isArray(registry?.variants) ? registry.variants : null);

/**
 * Rows, one per (registry model × provider) plus one placeholder per authorized
 * model the registry does not contain. Each row carries `decision`, so views
 * only filter and project — they never re-derive policy.
 */
export function buildCatalog(snapshot) {
  if (!isPlainObject(snapshot) || !(snapshot.authorized instanceof Map)) return [];
  const inScope = snapshot.filteredProviders instanceof Set ? snapshot.filteredProviders : new Set();
  const rows = [];
  const registered = new Set();

  if (isPricingLoaded(snapshot)) {
    for (const entry of snapshot.pricing.values()) {
      if (!isPlainObject(entry)) continue;
      const provider = typeof entry.providerID === 'string' ? entry.providerID : '';
      const model = typeof entry.id === 'string' ? baseId(entry.id) : '';
      if (provider === '' || model === '') continue;
      if (!inScope.has(provider)) continue;

      const decision = policyDecision(snapshot, { providerID: provider, id: model });
      const authorized = decision === DECISION.AUTHORIZED ? snapshot.authorized.get(model) : undefined;
      registered.add(model);

      rows.push({
        model,
        provider,
        class: entry.classification,
        input: entry.input,
        output: entry.output,
        tier: tierOf(authorized),
        variants: variantsOf(entry),
        trigger: triggerOf(authorized),
        decision,
        priced: true,
      });
    }
  }

  for (const [key, entry] of snapshot.authorized) {
    const model = baseId(typeof entry?.id === 'string' ? entry.id : key);
    if (model === '' || registered.has(model)) continue;

    rows.push({
      model,
      provider: UNKNOWN_PROVIDER,
      class: 'UNPRICED',
      input: null,
      output: null,
      tier: tierOf(entry),
      variants: null,
      trigger: triggerOf(entry),
      decision: snapshot.banned instanceof Set && snapshot.banned.has(model) ? DECISION.BANNED : DECISION.AUTHORIZED,
      priced: false,
    });
  }

  return rows.sort(compareRows);
}

/** Keep rows whose Class matches the requested paid type (`NONE` keeps all). */
export function filterByClass(rows, paidType) {
  return paidType === 'NONE' ? rows : rows.filter((row) => row.class === paidType);
}

/** Message for a view that needs price evidence the snapshot does not have. */
export function pricingUnavailableMessage(snapshot) {
  const detail = snapshot?.pricingError ? ` (${snapshot.pricingError})` : '';
  return `registry pricing unavailable${detail}; class cannot be verified, so no rows are returned`;
}

/** Tier ascending (missing tier last), then provider (unknown last), then model. */
export function compareRows(a, b) {
  const left = Number.isFinite(a?.tier) ? a.tier : Number.POSITIVE_INFINITY;
  const right = Number.isFinite(b?.tier) ? b.tier : Number.POSITIVE_INFINITY;
  if (left !== right) return left < right ? -1 : 1;

  const providerA = a?.provider === UNKNOWN_PROVIDER ? '\uffff' : String(a?.provider ?? '');
  const providerB = b?.provider === UNKNOWN_PROVIDER ? '\uffff' : String(b?.provider ?? '');
  if (providerA !== providerB) return providerA < providerB ? -1 : 1;

  const modelA = String(a?.model ?? '');
  const modelB = String(b?.model ?? '');
  return modelA < modelB ? -1 : modelA > modelB ? 1 : 0;
}
