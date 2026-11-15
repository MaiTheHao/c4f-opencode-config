import {
  DEFAULT_TOP_K,
  MAX_TOP_K,
  RetrievalConfigError,
  indexExists,
  normalizeOptions,
  resolveDbPath,
  resolveRoot,
  resolveScriptsDir,
} from './config.js';
import { createPythonRunner } from './python.js';
import { renderFailure, renderIndex, renderNotInitialized, renderSearch } from './render.js';
import { DESCRIPTION, INPUT_SCHEMA, TOOL_NAME } from './schema.js';

const ACTIONS = new Set(['search', 'index']);

const PYTHON_HINT = 'Install the Python dependencies: pip install tree-sitter tree-sitter-java tree-sitter-javascript tree-sitter-typescript (optional: tree-sitter-python for AST-level Python chunks; Python falls back to indentation parsing without it)';

const MISSING_PYTHON_HINT = 'Python 3.10+ is required. Set codeRetrieval.python or C4F_RETRIEVAL_PYTHON to an interpreter that has tree-sitter installed.';

export class RetrievalArgsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetrievalArgsError';
  }
}

export function normalizeArgs(input = {}) {
  const action = String(input.action ?? 'search').trim().toLowerCase();
  if (!ACTIONS.has(action)) {
    throw new RetrievalArgsError(`unknown action ${JSON.stringify(action)}; valid actions: search | index`);
  }

  const query = String(input.query ?? '').trim();
  if (action === 'search' && !query) {
    throw new RetrievalArgsError('query is required for action=search (symbol name or technical terms)');
  }

  const topK = input.top_k === undefined ? DEFAULT_TOP_K : input.top_k;
  if (!Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K) {
    throw new RetrievalArgsError(`top_k must be an integer between 1 and ${MAX_TOP_K}`);
  }

  return {
    action,
    query,
    topK,
    // undefined = auto: only re-sync when the index database already exists.
    sync: typeof input.sync === 'boolean' ? input.sync : undefined,
    root: String(input.root ?? '').trim(),
  };
}

export function buildArgs({ options, args, root, sync }) {
  const shared = ['--root', root, '--json'];
  if (options.db) shared.push('--db', options.db);

  if (args.action === 'index') return ['index', ...shared];

  const cliArgs = ['search', args.query, '--top-k', String(args.topK), ...shared];
  if (sync) cliArgs.push('--sync');
  return cliArgs;
}

function parseStdout(result) {
  const text = String(result?.stdout ?? '').trim();
  if (!text) throw new Error('indexer produced no output');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`indexer returned invalid JSON: ${text.slice(0, 300)}`);
  }
}

function failureContent({ result, options, error }) {
  if (error instanceof RetrievalConfigError || error instanceof RetrievalArgsError) {
    return renderFailure({ message: error.message });
  }
  if (error) {
    return renderFailure({ message: error.message });
  }

  if (result?.spawnError?.code === 'ENOENT') {
    return renderFailure({
      message: `Python interpreter not found (${options.python}).`,
      hint: MISSING_PYTHON_HINT,
    });
  }
  if (result?.timedOut) {
    return renderFailure({
      message: `Indexer timed out after ${options.timeoutMs} ms.`,
      hint: 'Raise codeRetrieval.timeoutMs or narrow the repository root.',
    });
  }

  const stderr = String(result?.stderr ?? '').trim();
  const hint = /ModuleNotFoundError|No module named/.test(stderr) ? PYTHON_HINT : undefined;
  return renderFailure({
    message: `Indexer exited with code ${result?.code ?? 'unknown'}${result?.aborted ? ' (aborted)' : ''}.`,
    detail: stderr || String(result?.stdout ?? '').trim(),
    hint,
  });
}

/**
 * Registers the native `code_retrieval` tool.
 *
 * Opt-in model: the SQLite database is the flag. `search` never creates an
 * index — it reports NOT_INITIALIZED instead, so a repository is only indexed
 * after an explicit `action=index` ("init retrieval"). Once the database
 * exists, searches refresh it incrementally, and the startup warm-up may run
 * too (see `run`).
 */
export async function registerCodeRetrievalTool({ ctx, options, runner }) {
  if (typeof ctx?.tool?.transform !== 'function') return undefined;

  const runPython = runner ?? createPythonRunner({ python: options.python });
  const lastSyncedAt = new Map();

  const transformResult = await ctx.tool.transform((editor) => {
    editor.add({
      name: TOOL_NAME,
      options: { codemode: options.codemode },
      description: DESCRIPTION,
      input: INPUT_SCHEMA,
      execute: async (input, context) => {
        try {
          const args = normalizeArgs(input);
          const root = await resolveRoot({ options, ctx, input: args, sessionID: context?.sessionID });
          const dbPath = resolveDbPath({ options, root });
          const initialized = await indexExists(dbPath);

          if (args.action === 'search' && !initialized) {
            return {
              content: renderNotInitialized({ root, dbPath }),
              metadata: { action: 'search', root, db: dbPath, initialized: false },
            };
          }

          const scriptsDir = await resolveScriptsDir(options);
          const sync = args.action === 'index' ? false : (args.sync ?? initialized);
          const result = await runPython({
            args: [`${scriptsDir}/index.py`, ...buildArgs({ options, args, root, sync })],
            cwd: root,
            timeoutMs: options.timeoutMs,
            signal: context?.signal,
          });

          if (!result.ok) return { content: failureContent({ result, options }) };

          const payload = parseStdout(result);
          if (args.action === 'index') {
            lastSyncedAt.set(root, Date.now());
            return {
              content: renderIndex(payload, root),
              metadata: { action: 'index', root, db: payload.db, indexed: payload.indexed, initialized: true },
            };
          }

          if (payload?.index) lastSyncedAt.set(root, Date.now());
          return {
            content: renderSearch(payload),
            metadata: {
              action: 'search',
              root,
              db: payload?.db ?? dbPath,
              hits: Array.isArray(payload?.hits) ? payload.hits.length : 0,
              initialized: true,
            },
          };
        } catch (error) {
          return { content: failureContent({ options, error }) };
        }
      },
    });
  });

  return {
    lastSyncedAt,
    async dispose() {
      if (typeof transformResult === 'function') {
        await transformResult();
      } else {
        await transformResult?.dispose?.();
      }
    },
  };
}

/**
 * Module entry point.
 *
 * Nothing is scanned until the repository has an index database. The startup
 * warm-up therefore only fires for repositories the user already initialized,
 * and `C4F_RETRIEVAL_AUTOSYNC=0` turns even that off.
 */
export async function run(ctx, input = {}, deps = {}) {
  const options = normalizeOptions(input, ctx?.env ?? process.env);
  if (!options.enabled) {
    return { options, dispose: async () => {} };
  }

  const registration = await registerCodeRetrievalTool({ ctx, options, runner: deps.runner });

  if (options.autoSync && registration) {
    // Fire-and-forget warm-up: never block or fail plugin setup.
    void warmUp({ ctx, options, registration, runner: deps.runner }).catch(() => {});
  }

  return {
    options,
    async dispose() {
      await registration?.dispose?.();
    },
  };
}

async function warmUp({ ctx, options, registration, runner }) {
  const root = await resolveRoot({ options, ctx });
  if (registration.lastSyncedAt.has(root)) return;

  const dbPath = resolveDbPath({ options, root });
  if (!(await indexExists(dbPath))) return; // not initialized: the user never asked for retrieval

  const scriptsDir = await resolveScriptsDir(options);
  const runPython = runner ?? createPythonRunner({ python: options.python });
  const result = await runPython({
    args: [`${scriptsDir}/index.py`, 'index', '--root', root, '--json'],
    cwd: root,
    timeoutMs: Math.min(options.timeoutMs, options.warmupTimeoutMs),
  });
  if (result.ok) registration.lastSyncedAt.set(root, Date.now());
}
