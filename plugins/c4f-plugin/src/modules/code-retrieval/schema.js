export const TOOL_NAME = 'code_retrieval';

export const DESCRIPTION = [
  "Semantic search over this repository's code, config and docs by symbol or technical keyword.",
  'Use this BEFORE any grep/read/shell exploration when: the question asks HOW/WHY/WHERE something works;',
  'it describes a behavior without naming the implementation; it spans multiple components; or it touches',
  'config, migrations or infrastructure files — even if it sounds operational. Also retrieve first for',
  'anything involving schema, permissions, scheduling, tokens or providers.',
  'Rewrite a business-level question into technical terms before querying, and start with top_k: 8.',
  'Skip only for trivial edits to files you already know or questions outside this repository.',
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
