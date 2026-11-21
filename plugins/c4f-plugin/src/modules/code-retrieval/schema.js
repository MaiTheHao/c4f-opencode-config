export const TOOL_NAME = 'code_retrieval';

// Independent of the store-side token cap: overlong input is rejected here
// (OpenCode layer) and again in normalizeArgs (direct calls), never indexed.
export const MAX_QUERY_LENGTH = 256;

// NOTE: tool catalogs truncate descriptions (~140 chars visible). The first
// sentence(s) below MUST carry the retrieval trigger rule so the rule survives
// truncation; the rest reinforces. Agents can read the full text via
// search({ query: "code_retrieval" }).
export const DESCRIPTION = [
  'Semantic code+config+docs search. Use BEFORE grep/read/shell for HOW/WHY/WHERE,',
  'unnamed behaviors, multi-component flows, config/migration/infra topics,',
  'and anything touching schema, permissions, scheduling, tokens or providers.',
  'Rewrite business questions into technical terms, start with top_k: 8.',
  'Skip only trivial edits to files you already know or non-repo questions.'
].join(' ');

export const INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    query: {
      type: 'string',
      maxLength: MAX_QUERY_LENGTH,
      description: 'Symbol name or technical keywords to search (e.g. "jwt validate").',
    },
    top_k: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      description: 'Maximum number of ranked chunks. Defaults to 5.',
    },
    root: {
      type: 'string',
      description: 'Project root to search. Defaults to the session directory.',
    },
  },
  required: [],
  additionalProperties: false,
});
