import { access } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_WARMUP_TIMEOUT_MS = 5_000;
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;

// Must match scripts/config.py (DEFAULT_DB_REL_PATH).
export const DEFAULT_DB_REL_PATH = 'local/agents/retrieval/code_bm25.db';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// The Python indexer ships inside this module; there is no separate skill copy.
export const DEFAULT_SCRIPTS_DIR = resolve(MODULE_DIR, 'scripts');

export const DEFAULT_PYTHON = 'python3';
export const FALLBACK_PYTHON = 'python';

export class RetrievalConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RetrievalConfigError';
    this.details = details;
  }
}

function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Plugin options (ctx.options.codeRetrieval) with environment fallbacks.
 * Paths are resolved lazily at tool-call time because a session can move to
 * another directory or worktree after setup.
 */
export function normalizeOptions(input = {}, env = process.env) {
  return {
    enabled: input.enabled !== false && env.C4F_RETRIEVAL_TOOL !== '0',
    scriptsDir: String(input.scriptsDir ?? env.C4F_RETRIEVAL_SCRIPTS ?? DEFAULT_SCRIPTS_DIR),
    python: String(input.python ?? env.C4F_RETRIEVAL_PYTHON ?? DEFAULT_PYTHON),
    root: String(input.root ?? env.C4F_RETRIEVAL_ROOT ?? ''),
    db: String(input.db ?? env.C4F_RETRIEVAL_DB ?? ''),
    timeoutMs: positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS),
    warmupTimeoutMs: positiveInt(input.warmupTimeoutMs, DEFAULT_WARMUP_TIMEOUT_MS),
    // The index database itself is the opt-in flag: no database, no scan.
    // C4F_RETRIEVAL_AUTOSYNC=0 still disables the startup warm-up entirely.
    autoSync: input.autoSync !== false && env.C4F_RETRIEVAL_AUTOSYNC !== '0',
    // Code Mode keeps parity with model_insights; set codemode: false for a first-class tool.
    codemode: input.codemode !== false,
  };
}

/**
 * Directory of the session that is calling the tool.
 *
 * `ctx.location` is fixed when the plugin is set up (process/location startup),
 * but a session can be moved to another workspace afterwards. `session.get`
 * returns the session's current location, so the tool always searches the
 * workspace the session is actually in.
 */
async function sessionDirectory(ctx, sessionID) {
  if (!sessionID || typeof ctx?.session?.get !== 'function') return undefined;
  try {
    const info = await ctx.session.get({ sessionID });
    const directory = info?.location?.directory;
    return typeof directory === 'string' && directory ? directory : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Project root, resolved per tool call:
 * explicit argument > plugin option/env > the session's current location >
 * the plugin setup location.
 */
export async function resolveRoot({ options, ctx, input = {}, sessionID } = {}) {
  const sessionDir = await sessionDirectory(ctx, sessionID);
  const base = sessionDir ?? ctx?.location?.directory ?? process.cwd();
  const candidate = String(input.root ?? options?.root ?? '');
  if (!candidate) return base;
  return isAbsolute(candidate) ? candidate : resolve(base, candidate);
}

/** Index database for a root; mirrors the Python precedence (--db, env, project local/). */
export function resolveDbPath({ options, root }) {
  const configured = String(options?.db ?? '');
  if (!configured) return resolve(root, DEFAULT_DB_REL_PATH);
  return isAbsolute(configured) ? configured : resolve(root, configured);
}

/** The database is the opt-in flag: it exists only after an explicit `action=index`. */
export async function indexExists(dbPath) {
  try {
    await access(dbPath);
    return true;
  } catch {
    return false;
  }
}

/** Fail early with an actionable message instead of a Python traceback. */
export async function resolveScriptsDir(options) {
  const scriptsDir = options.scriptsDir;
  const entry = resolve(scriptsDir, 'index.py');
  try {
    await access(entry);
  } catch {
    throw new RetrievalConfigError(
      `Retrieval indexer not found at ${entry}. The plugin ships scripts/ beside its module; set codeRetrieval.scriptsDir or C4F_RETRIEVAL_SCRIPTS only for a custom location.`,
      { scriptsDir, entry },
    );
  }
  return scriptsDir;
}
