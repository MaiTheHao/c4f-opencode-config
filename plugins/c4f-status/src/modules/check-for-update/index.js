import { createProbe, defaultStateFile, defaultTargets, isFresh, needsAction, DEFAULT_TTL_MS, DEFAULT_FETCH_TIMEOUT_MS } from './probe.js';
import { buildBanner, buildInstruction, MARKER } from './warn.js';

function normalizeOptions(input = {}, env = process.env) {
  const repos = Array.isArray(input.repos) && input.repos.length > 0 ? input.repos : defaultTargets();
  const ttlMs = Number.isFinite(input.ttlMs) && input.ttlMs > 0 ? input.ttlMs : DEFAULT_TTL_MS;
  return {
    enabled: input.enabled !== false && env.C4F_UPDATE_CHECK !== '0',
    ttlMs,
    fetchTimeoutMs: Number.isFinite(input.fetchTimeoutMs) && input.fetchTimeoutMs > 0 ? input.fetchTimeoutMs : DEFAULT_FETCH_TIMEOUT_MS,
    repos,
    stateFile: input.stateFile ?? defaultStateFile(),
    banner: input.banner !== false,
  };
}

const MAX_TRACKED_SESSIONS = 500;

/**
 * Module entry point: probe the C4F repos, inject a WARN into the system
 * prompt while they are behind, and show one banner per session. It never
 * runs git writes.
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

  const registrations = [];
  const seenSessions = new Set();

  const register = async (name, callback) => {
    if (typeof ctx?.session?.hook !== 'function') return;
    try {
      const registration = await ctx.session.hook(name, callback);
      if (registration) registrations.push(registration);
    } catch {
      // Older runtimes may not expose this hook; degrade to the other signals.
    }
  };

  await register('context', (request) => {
    const state = probe.get();
    if (!needsAction(state)) return;
    const text = buildInstruction(state);
    if (!text) return;
    if (!Array.isArray(request?.system)) return;
    if (request.system.some((part) => typeof part?.text === 'string' && part.text.includes(MARKER))) return;
    request.system.push({ type: 'text', text });
  });

  if (options.banner) {
    await register('prompt', async (input_) => {
      const state = probe.get();
      if (!needsAction(state)) return;
      if (!input_?.sessionID || seenSessions.has(input_.sessionID)) return;
      if (seenSessions.size >= MAX_TRACKED_SESSIONS) seenSessions.clear();
      seenSessions.add(input_.sessionID);
      const text = buildBanner(state);
      if (!text) return;
      try {
        await ctx.session.synthetic({
          sessionID: input_.sessionID,
          text,
          description: 'c4f-update',
        });
      } catch {
        // The banner is advisory; a failed post must not affect the turn.
      }
    });
  }

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
      for (const registration of registrations) {
        try {
          await registration?.dispose?.();
        } catch {
          // Cleanup errors must not affect OpenCode shutdown.
        }
      }
      registrations.length = 0;
    },
  };
}
