const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidTier(tier) {
  return isRecord(tier)
    && tier.type === 'context'
    && Number.isInteger(tier.size)
    && tier.size > 0;
}

/** Classify runtime pricing as FREE, PAID or UNPRICED without coercion. */
export function classifyCost(cost) {
  if (!Array.isArray(cost) || cost.length === 0) return 'UNPRICED';

  let hasPositive = false;
  for (const entry of cost) {
    if (!isRecord(entry)) return 'UNPRICED';
    if (entry.tier !== undefined && !isValidTier(entry.tier)) return 'UNPRICED';
    if (!isRecord(entry.cache)) return 'UNPRICED';

    for (const value of [entry.input, entry.output, entry.cache.read, entry.cache.write]) {
      if (!isMoney(value)) return 'UNPRICED';
      if (value > 0) hasPositive = true;
    }
  }

  return hasPositive ? 'PAID' : 'FREE';
}

/** The first registry cost tier is the display row; classification uses all tiers. */
export function extractPrice(cost) {
  if (!Array.isArray(cost) || cost.length === 0 || !isRecord(cost[0])) {
    return { input: null, output: null };
  }
  return {
    input: isMoney(cost[0].input) ? cost[0].input : null,
    output: isMoney(cost[0].output) ? cost[0].output : null,
  };
}
