export const TOOL_NAME = 'code_retrieval';

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
    action: {
      type: 'string',
      enum: ['search', 'index'],
      description: 'Retrieval operation. Defaults to search.',
    },
    query: {
      type: 'string',
      description: 'Symbol name or technical keywords, required for search (e.g. "jwt validate").',
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
    sync: {
      type: 'boolean',
      description: 'Refresh the index before searching. Defaults to true when the index already exists; a search never creates one.',
    },
  },
  required: [],
  additionalProperties: false,
});
