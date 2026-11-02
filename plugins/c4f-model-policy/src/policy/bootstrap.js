// Fail-safe floor plus today's semantics, not policy. Config overlays these.
export const BOOTSTRAP_RUNTIME = Object.freeze({
  enabled: true,
  gate: 'interrupt',
  onSnapshotFailure: 'fail-closed',
  refreshMs: 60_000,
});
export const DEFAULT_DECISION = Object.freeze({
  order: Object.freeze(['OUT_OF_SCOPE', 'BANNED', 'AUTHORIZED', 'FREE', 'DENIED']),
  allowed: Object.freeze(['OUT_OF_SCOPE', 'AUTHORIZED', 'FREE']),
});
export const DEFAULT_CLASSIFICATION = Object.freeze({
  free: 'all-zero',
  invalidTier: 'unpriced',
});
export const VERDICT_TOKENS = Object.freeze(
  new Set(['OUT_OF_SCOPE', 'BANNED', 'AUTHORIZED', 'FREE', 'DENIED']),
);
