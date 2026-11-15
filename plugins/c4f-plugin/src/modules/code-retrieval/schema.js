export const TOOL_NAME = 'code_retrieval';

export const DESCRIPTION = [
  'Search this repository\'s code, config and docs by symbol or keyword.'
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
