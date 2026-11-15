import { createProbe, defaultStateFile, defaultTargets, isFresh, DEFAULT_TTL_MS, DEFAULT_FETCH_TIMEOUT_MS } from './probe.js';

function normalizeOptions(input = {}, env = process.env) {
  const repos = Array.isArray(input.repos) && input.repos.length > 0 ? input.repos : defaultTargets();
  const ttlMs = Number.isFinite(input.ttlMs) && input.ttlMs > 0 ? input.ttlMs : DEFAULT_TTL_MS;
  return {
    enabled: input.enabled !== false && env.C4F_UPDATE_CHECK !== '0',
    ttlMs,
    fetchTimeoutMs: Number.isFinite(input.fetchTimeoutMs) && input.fetchTimeoutMs > 0 ? input.fetchTimeoutMs : DEFAULT_FETCH_TIMEOUT_MS,
    repos,
    stateFile: input.stateFile ?? defaultStateFile(),
  };
}

/**
 * Module entry point: probe the C4F repos and cache the result for the TUI
 * notification. The state file is the only output, so this module never
 * touches the model context and never runs git writes.
 */
export async function run(ctx, input = {}) {
  const options = normalizeOptions(input, ctx?.env ?? process.env);
  if (!options.enabled) {
    return { options, state: () => undefined, refresh: async () => undefined, dispose: async () => {} };
  }

  const probe = createProbe({
    targets: options.repos,
    stateFile: options.stateFile,
    fetchTimeoutMs: options.fetchTimeoutMs,
  });
  const cached = await probe.load();

  let disposed = false;
  let timer;

  const schedule = (delay) => {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refreshSoon();
    }, Math.max(0, Math.min(options.ttlMs, delay)));
    timer.unref?.();
  };

  const refreshSoon = async () => {
    if (disposed) return;
    try {
      await probe.refresh();
    } catch {
      // Keep the scheduler alive; the next attempt may succeed.
    } finally {
      if (!disposed) schedule(options.ttlMs);
    }
  };

  if (isFresh(cached, options.ttlMs)) {
    // Align the next refresh with the cache age, not with process start time.
    schedule(cached.checkedAt + options.ttlMs - Date.now());
  } else {
    void refreshSoon();
  }

  return {
    options,
    state: () => probe.get(),
    refresh: () => probe.refresh(),
    dispose: async () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
