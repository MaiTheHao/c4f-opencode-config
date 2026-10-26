// retrieval
// Adds code outlines and verified-context storage.
// File listing, search, ranged reads and Git state use native tools.
// Only the context store writes to the project workspace.

import { resolve } from 'node:path';

import { extractOutline, languageFor, OUTLINE_EXTENSIONS } from './lib/outline.js';
import { readTextFile, resolveRoot } from './lib/repo.js';
import { createStore } from './lib/store.js';

const DEFAULT_CONTEXT_PATH = 'local/agents/retrieval_context.jsonl';
const NAMESPACE = 'c4f-retrieval';

const REPO_ROOT_PROP = {
  type: 'string',
  description: 'Optional repository root; defaults to the session location.',
};

export default {
  id: 'c4f-retrieval',

  async setup(ctx) {
    if (typeof ctx?.tool?.transform !== 'function') return undefined;

    let store;
    const getStore = () => {
      if (store === undefined) store = createStore({ file: contextFile(ctx) });
      return store;
    };

    const registration = await ctx.tool.transform((editor) => {
      if (typeof editor?.namespace === 'function') {
        editor.namespace({
          name: NAMESPACE,
          description: 'Verified context and code outlines',
        });
      }

      for (const tool of [codeOutlineTool(ctx), contextLookupTool(ctx, getStore), contextUpsertTool(ctx, getStore), contextInvalidateTool(getStore)]) {
        editor.add({ ...tool, options: { namespace: NAMESPACE, codemode: true } });
      }
    });

    return async () => {
      try {
        await registration?.dispose?.();
      } catch {
        // Ignore shutdown errors.
      }
    };
  },
};

function contextFile(ctx) {
  const root = resolveRoot(ctx);
  const override = ctx?.options?.contextFile;
  if (typeof override === 'string' && override.trim() !== '') return resolve(root, override);
  return resolve(root, DEFAULT_CONTEXT_PATH);
}

/* ---------- tools ---------- */

function codeOutlineTool(ctx) {
  return {
    name: 'code_outline',
    description: 'Extract declarations and line ranges from a supported source file.',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repository-relative source file path.' },
        name_contains: { type: 'string', description: 'Filter declarations by qualified name.' },
        repo_root: REPO_ROOT_PROP,
      },
      required: ['path'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (typeof args.path !== 'string' || languageFor(args.path) === null) {
        throw new Error(`path must have one of these extensions: ${OUTLINE_EXTENSIONS().join(' ')}`);
      }

      const root = resolveRoot(ctx, args.repo_root);
      const file = await readTextFile(root, args.path);
      const nameContains = typeof args.name_contains === 'string' ? args.name_contains : undefined;
      return { content: JSON.stringify(extractOutline({ ...file, nameContains })) };
    },
  };
}

function contextLookupTool(ctx, getStore) {
  return {
    name: 'context_lookup',
    description: 'Search verified repository context by record values.',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Repository concept, symbol, flow or component to search.' },
        max_results: { type: 'integer', description: 'Maximum results; defaults to 10, capped at 50.' },
        repo_root: REPO_ROOT_PROP,
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (typeof args.query !== 'string') throw new Error('query must be a string');

      const result = await getStore().lookup(args.query, resolveRoot(ctx, args.repo_root), args.max_results);
      return { content: JSON.stringify(result) };
    },
  };
}

function contextUpsertTool(ctx, getStore) {
  return {
    name: 'context_upsert',
    description: 'Save or replace a verified repository context record.',
    input: {
      type: 'object',
      properties: {
        record: {
          type: 'object',
          description: 'Context record to save or replace.',
          additionalProperties: true,
        },
        key: { type: 'string', description: 'Record identity field; defaults to id.' },
        repo_root: REPO_ROOT_PROP,
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
    description: 'Invalidate repository context records by identity.',
    input: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Record IDs to invalidate.' },
        reason: { type: 'string', description: 'Reason for invalidation.' },
        key: { type: 'string', description: 'Record identity field; defaults to id.' },
      },
      required: ['ids'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input ?? {};
      if (!Array.isArray(args.ids) || args.ids.some((id) => typeof id !== 'string')) {
        throw new Error('ids must be an array of strings');
      }

      const key = typeof args.key === 'string' && args.key !== '' ? args.key : 'id';
      const reason = typeof args.reason === 'string' ? args.reason : '';
      return { content: JSON.stringify(await getStore().invalidate(args.ids, reason, key)) };
    },
  };
}
