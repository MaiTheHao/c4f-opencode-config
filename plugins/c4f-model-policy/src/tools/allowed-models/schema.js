export const TOOL_NAME = 'allowed_models';

export const NAMESPACE = Object.freeze({
  name: 'c4f-model-policy',
  description: 'Query C4F model policy and routing rules.',
});

export const DESCRIPTION = [
  'Query the active C4F model policy before selecting a model.',
  'Actions: allowed (permitted models), pricing (full registry), banned (refused models), check (classify one model).',
  'Filter allowed/pricing results by model_paid_type: NONE, PAID or FREE.',
  'Results are returned as a Markdown table; pricing may be stale or unavailable.',
].join(' ');

export const INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'Policy query: allowed, pricing, banned or check.',
    },
    model: {
      type: 'string',
      description: 'Provider/model ID to classify when action is check.',
    },
    model_paid_type: {
      type: 'string',
      description: 'Filter allowed or pricing results by NONE, PAID or FREE.',
    },
  },
  required: [],
  additionalProperties: false,
});
