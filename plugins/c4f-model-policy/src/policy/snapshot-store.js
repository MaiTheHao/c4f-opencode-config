// Holds the live policy snapshot and refreshes it on an interval.
// `get()` returns null when the last load failed; enforcement then follows
// policy.onSnapshotFailure.

import { errorMessage } from '../shared/errors.js';
import { loadSnapshot } from './allowlist.js';
import { baseId, normalizeProviderID } from './ids.js';
import { attachPricing } from './pricing.js';

function registryKey(model) {
  const provider = normalizeProviderID(model?.providerID);
  const raw = typeof model?.id === 'string' ? model.id : model?.modelID;
  const id = typeof raw === 'string' ? baseId(raw) : '';
  return provider === '' || id === '' ? '' : `${provider}\0${id}`;
}

/**
 * Union of registry records across refreshes. L1 removes denied models from the
 * live list, so a plain re-read would shrink the raw pricing view down to the
 * allowed set. Later records win; merged ids only feed views, never enforcement.
 */
export function mergeRegistry(previous, models) {
  const merged = new Map();
  for (const model of Array.isArray(previous) ? previous : []) {
    const key = registryKey(model);
    if (key !== '') merged.set(key, model);
  }
  for (const model of Array.isArray(models) ? models : []) {
    const key = registryKey(model);
    if (key !== '') merged.set(key, model);
  }
  return [...merged.values()];
}

export function createSnapshotStore(ctx) {
  let snapshot = null;
  let registry = null;
  let refreshing = false;
  let timer;

  // `ctx.model.list()` may be stale or not yet settled. It only feeds the
  // policy heuristic; never a billing source, and its failure never
  // invalidates the policy config.
  async function listRegistry() {
    try {
      const listed = await ctx.model.list();
      if (Array.isArray(listed?.data) && listed.data.length > 0) return { models: listed.data, error: null };
      return { models: null, error: 'registry returned no model data' };
    } catch (err) {
      return { models: null, error: errorMessage(err) };
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      let base;
      try {
        base = await loadSnapshot();
      } catch {
        snapshot = null;
        return;
      }

      const listed = await listRegistry();
      if (listed.models === null) {
        // A failed read must stay a failure: never serve cached prices as fresh.
        snapshot = attachPricing(base, listed);
        return;
      }

      registry = mergeRegistry(registry, listed.models);
      snapshot = attachPricing(base, { models: registry });
    } finally {
      refreshing = false;
    }
  }

  return {
    get: () => snapshot,
    refresh,
    start(intervalMs) {
      if (!(intervalMs > 0)) return;
      timer = setInterval(refresh, intervalMs);
      timer.unref?.();
    },
    stop: () => clearInterval(timer),
  };
}
