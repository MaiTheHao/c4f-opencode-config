import {
  DEFAULT_TOP_K,
  MAX_TOP_K,
  RetrievalConfigError,
  normalizeOptions,
  resolveDbPath,
  resolveRoot,
  resolveScriptsDir,
} from './config.js';
import {
  renderFailure,
  renderNotInitialized,
  renderSearch,
  renderStaleIndex,
  renderUnsupported,
} from './render.js';
import { DESCRIPTION, INPUT_SCHEMA, MAX_QUERY_LENGTH, TOOL_NAME } from './schema.js';
import { disposeSearchStores, openSearchStore } from './store.js';

export class RetrievalArgsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetrievalArgsError';
  }
}

export function normalizeArgs(input = {}) {
  const query = String(input.query ?? '').trim();
  if (!query) {
    throw new RetrievalArgsError('query is required (symbol name or technical terms)');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new RetrievalArgsError(`query must be at most ${MAX_QUERY_LENGTH} characters`);
  }

  const topK = input.top_k === undefined ? DEFAULT_TOP_K : input.top_k;
  if (!Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K) {
    throw new RetrievalArgsError(`top_k must be an integer between 1 and ${MAX_TOP_K}`);
  }

  return {
    query,
    topK,
    root: String(input.root ?? '').trim(),
  };
}

function failureContent({ options, error }) {
  if (error instanceof RetrievalConfigError || error instanceof RetrievalArgsError) {
    return renderFailure({ message: error.message });
  }
  return renderFailure({ message: error?.message ?? 'Unknown retrieval failure.' });
}

/**
 * Registers the native `code_retrieval` tool (search-only).
 *
 * Reads go through the readonly FTS5 store; indexing happens exclusively via
 * the Python CLI (`scripts/index.py`, incl. `--watch`). `openStore` is
 * injectable for tests and defaults to {@link openSearchStore}.
 */
export async function registerCodeRetrievalTool({ ctx, options, openStore = openSearchStore }) {
  if (typeof ctx?.tool?.transform !== 'function') return undefined;

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
          const store = await openStore(dbPath);

          if (store.status === 'NOT_INITIALIZED') {
            const scriptsDir = await resolveScriptsDir(options);
            return {
              content: renderNotInitialized({ root, dbPath, scriptsDir }),
              metadata: { root, db: dbPath, initialized: false, hits: 0 },
            };
          }
          if (store.status === 'STALE_INDEX') {
            const scriptsDir = await resolveScriptsDir(options);
            return {
              content: renderStaleIndex({ root, dbPath, scriptsDir }),
              metadata: { root, db: dbPath, initialized: false, hits: 0, stale: true },
            };
          }
          if (store.status === 'DRIVER_UNSUPPORTED') {
            return {
              content: renderUnsupported(),
              metadata: { root, db: dbPath, initialized: true, hits: 0 },
            };
          }
          if (store.status !== 'OK') {
            return { content: failureContent({ options, error: new Error(`Search store is ${store.status}.`) }) };
          }

          const result = await store.search(args.query, args.topK);
          if (result.status !== 'OK') {
            return { content: failureContent({ options, error: new Error(`Search failed with status ${result.status}.`) }) };
          }
          const { hits } = result;
          return {
            content: renderSearch({ query: args.query, root, hits }),
            metadata: { root, db: dbPath, initialized: true, hits: hits.length },
          };
        } catch (error) {
          return { content: failureContent({ options, error }) };
        }
      },
    });
  });

  return {
    async dispose() {
      if (typeof transformResult === 'function') {
        await transformResult();
      } else {
        await transformResult?.dispose?.();
      }
      await disposeSearchStores();
    },
  };
}

/** Module entry point: search-only, no warm-up, no sync, no spawned processes. */
export async function run(ctx, input = {}, deps = {}) {
  const options = normalizeOptions(input, ctx?.env ?? process.env);
  if (!options.enabled) {
    return { options, dispose: async () => {} };
  }

  const registration = await registerCodeRetrievalTool({
    ctx,
    options,
    openStore: deps.openStore,
  });

  return {
    options,
    async dispose() {
      await registration?.dispose?.();
    },
  };
}
