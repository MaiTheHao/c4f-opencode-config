// retrieval — OpenCode v2 plugin.
//
// Registers the four retrieval capabilities that no native tool provides:
// Python declaration outlines, and the verified-context store (lookup, upsert,
// invalidate). Repository listing, text search, ranged reads, and Git state are
// deliberately absent: native `glob`, `grep`, `read` and `shell` already cover
// them, are faster, and honour permission rules.
//
// Everything here is read-only except the context store, which writes one JSONL
// file inside the project workspace it is asked about.

import { resolve } from 'node:path';

import { extractPythonSymbols } from './lib/pysym.js';
import { readTextFile, resolveRoot } from './lib/repo.js';
import { createStore } from './lib/store.js';

// One store per workspace. The MCP-era file
// (`<cwd>/local/agents/retrieval_agent/context.jsonl`) is deliberately NOT
// migrated: this release starts each project with an empty store. Point
// `options.contextFile` at an old file to read it, or copy its lines across.
const DEFAULT_CONTEXT_PATH = 'local/agents/retrieval_context.json';
const NAMESPACE = 'retrieval';

export default {
  id: 'c4f-retrieval',

  async setup(ctx) {
    // Missing editor API: register nothing rather than breaking startup.
    if (typeof ctx?.tool?.transform !== 'function') return undefined;

    // Lazy store: its path depends on the session location, and setup must
    // succeed even when the host cannot provide one yet. Resolving on the first
    // execute turns a missing location into a tool error, not a load failure.
    let store;
    const getStore = () => {
      if (store === undefined) store = createStore({ file: contextFile(ctx) });
      return store;
    };

    const registration = await ctx.tool.transform((editor) => {
      if (typeof editor?.namespace === 'function') {
        editor.namespace({
          name: NAMESPACE,
          description: 'Verified repository context and Python outlines',
        });
      }

      for (const tool of [
        pythonSymbolsTool(ctx),
        contextLookupTool(ctx, getStore),
        contextUpsertTool(ctx, getStore),
        contextInvalidateTool(getStore),
      ]) {
        // Same namespace and Code Mode placement as the MCP server this replaces,
        // so existing tool references keep resolving.
        editor.add({ ...tool, options: { namespace: NAMESPACE, codemode: true } });
      }
    });

    return async () => {
      try {
        await registration?.dispose?.();
      } catch {
        // Disposal is best-effort; the process may already be shutting down.
      }
    };
  },
};

/**
 * Store path for one session: the project workspace, never the config root and
 * never the process CWD. A relative `contextFile` option resolves against the
 * workspace; an absolute one is taken as-is.
 */
function contextFile(ctx) {
  const root = resolveRoot(ctx);
  const override = ctx?.options?.contextFile;
  if (typeof override === 'string' && override.trim() !== '') return resolve(root, override);
  return resolve(root, DEFAULT_CONTEXT_PATH);
}

/* ---------- tools ---------- */

function pythonSymbolsTool(ctx) {
  return {
    name: 'python_symbols',
    description: [
      'Outline the Python `class`, `def` and `async def` declarations in one file, with 1-based start/end lines.',
      'An end line may run one past the last real line when the file ends with a newline, and always includes trailing blank or comment lines before the next declaration.',
      'Use it to navigate a large module without reading it. For file contents, text search, or non-Python files use native read, grep, and glob instead.',
    ].join(' '),
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repository-relative path to a .py file.' },
        repo_root: {
          type: 'string',
          description: 'Optional repository root. Normally omit; the session location is used.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (typeof args.path !== 'string' || !args.path.toLowerCase().endsWith('.py')) {
        throw new Error('path must identify a .py file');
      }

      const root = resolveRoot(ctx, args.repo_root);
      const file = await readTextFile(root, args.path);
      return { content: JSON.stringify(extractPythonSymbols(file)) };
    },
  };
}

function contextLookupTool(ctx, getStore) {
  return {
    name: 'context_lookup',
    description: [
      'Search the persistent verified-context store and report how fresh each hit still is.',
      'Start here instead of re-deriving knowledge that a previous session already recorded. Records match on their own fields only; provenance bookkeeping is never matched.',
    ].join(' '),
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Repository concept, symbol, flow, or component.' },
        max_results: { type: 'integer', description: 'Maximum number of hits. Default 10.' },
        repo_root: {
          type: 'string',
          description: 'Optional repository root. Normally omit; the session location is used.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (typeof args.query !== 'string') throw new Error('query must be a string');

      const limit = Number.isInteger(args.max_results) && args.max_results > 0 ? args.max_results : 10;
      const result = await getStore().lookup(args.query, resolveRoot(ctx, args.repo_root), limit);
      return { content: JSON.stringify(result) };
    },
  };
}

function contextUpsertTool(ctx, getStore) {
  return {
    name: 'context_upsert',
    description: [
      'Store one verified context record, replacing the record with the same key. Provenance (timestamp, repository HEAD, SHA-256 of each source) is stamped for you.',
      'Only write facts you confirmed from source; freshness checks later compare those hashes and the recorded HEAD.',
    ].join(' '),
    input: {
      type: 'object',
      properties: {
        record: {
          type: 'object',
          description: 'Verified context record. Include id, summary, sources, and relations when known.',
          additionalProperties: true,
        },
        key: { type: 'string', description: "Identity field. Default 'id'." },
        repo_root: {
          type: 'string',
          description: 'Optional repository root. Normally omit; the session location is used.',
        },
      },
      required: ['record'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (typeof args.record !== 'object' || args.record === null || Array.isArray(args.record)) {
        throw new Error('record must be an object');
      }

      const key = typeof args.key === 'string' && args.key !== '' ? args.key : 'id';
      const result = await getStore().upsert(args.record, key, resolveRoot(ctx, args.repo_root));
      return { content: JSON.stringify(result) };
    },
  };
}

function contextInvalidateTool(getStore) {
  return {
    name: 'context_invalidate',
    description:
      'Mark context records stale by id without deleting them, keeping the reason for later readers. Use it when you learn a recorded fact is no longer true.',
    input: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Record ids to invalidate.' },
        reason: { type: 'string', description: 'Why the records are no longer trusted.' },
      },
      required: ['ids'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (!Array.isArray(args.ids) || args.ids.some((id) => typeof id !== 'string')) {
        throw new Error('ids must be an array of strings');
      }

      const result = await getStore().invalidate(args.ids, typeof args.reason === 'string' ? args.reason : '');
      return { content: JSON.stringify(result) };
    },
  };
}
