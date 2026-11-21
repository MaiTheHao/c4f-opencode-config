import { access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 50;

// Must match scripts/config.py (DEFAULT_DB_REL_PATH).
export const DEFAULT_DB_REL_PATH = 'local/agents/retrieval/code_bm25.db';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// The Python indexer ships inside this module; there is no separate skill copy.
export const DEFAULT_SCRIPTS_DIR = resolve(MODULE_DIR, 'scripts');

export class RetrievalConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RetrievalConfigError';
    this.details = details;
  }
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
    root: String(input.root ?? env.C4F_RETRIEVAL_ROOT ?? ''),
    db: String(input.db ?? env.C4F_RETRIEVAL_DB ?? ''),
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

/** Pin a path to its canonical location, resolving symlinks where possible. */
function canonicalize(dbPath) {
  try {
    return realpathSync(dbPath);
  } catch {
    // The database file typically does not exist yet: realpath the nearest
    // existing ancestor and re-attach the remainder.
  }
  let current = dbPath;
  const tail = [];
  for (;;) {
    const parent = dirname(current);
    if (parent === current) return dbPath;
    tail.unshift(basename(current));
    try {
      return resolve(realpathSync(parent), ...tail);
    } catch {
      current = parent;
    }
  }
}

/** Index database for a root; mirrors the Python precedence (--db, env, project local/). */
export function resolveDbPath({ options, root }) {
  const configured = String(options?.db ?? '');
  const candidate = !configured
    ? resolve(root, DEFAULT_DB_REL_PATH)
    : isAbsolute(configured)
      ? configured
      : resolve(root, configured);
  return canonicalize(candidate);
}

/** The database is the opt-in flag: it exists only after an explicit index. */
export async function indexExists(dbPath) {
  try {
    await access(dbPath);
    return true;
  } catch {
    return false;
  }
}

/** Fail early with an actionable message instead of a missing-file search. */
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
