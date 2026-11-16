import { createProbe, defaultStateFile, defaultTargets, isFresh, needsAction, DEFAULT_TTL_MS, DEFAULT_FETCH_TIMEOUT_MS } from './probe.js';
import { advisorySignature, buildInstruction, MARKER } from './warn.js';

const MAX_TRACKED_SESSIONS = 500;

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
 * Append the advisory to the admitted prompt. The block becomes part of the
 * canonical user input, so it reaches the model without touching the system
 * prompt. A session is told once per advisory signature.
 */
function advise(event, state, advised) {
  const text = event?.prompt?.text;
  if (typeof text !== 'string' || text.includes(MARKER)) return false;

  const signature = advisorySignature(state);
  if (!signature) return false;

  const instruction = buildInstruction(state);
  if (!instruction) return false;

  const sessionID = event?.sessionID;
  if (sessionID && advised.get(sessionID) === signature) return false;

  event.prompt.text = `${text.trimEnd()}\n\n${instruction}`;
  if (sessionID) {
    if (advised.size >= MAX_TRACKED_SESSIONS) advised.clear();
    advised.set(sessionID, signature);
  }
  return true;
}

/**
 * Module entry point: probe the C4F repos, cache the result, and append one
 * advisory block to a session's prompt while a repo needs action. The probe
 * never runs git writes and nothing here reaches the system prompt.
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

  const advised = new Map();
  let registration;
  if (typeof ctx?.session?.hook === 'function') {
    try {
      registration = await ctx.session.hook('prompt', (event) => {
        try {
          const state = probe.get();
          if (!needsAction(state)) {
            // Nothing pending: a later regression with the same counts must notify again.
            advised.clear();
            return;
          }
          advise(event, state, advised);
        } catch {
          // An advisory must never block prompt admission.
        }
      });
    } catch {
      // Older runtimes may not expose this hook; the probe still refreshes the cache.
    }
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
      try {
        await registration?.dispose?.();
      } catch {
        // Cleanup errors must not affect OpenCode shutdown.
      }
    },
  };
}
