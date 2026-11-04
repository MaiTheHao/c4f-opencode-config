export const TOOL_NAME = 'model_insights';

export const DESCRIPTION = [
  'Inspect models currently available in the OpenCode runtime.',
  'Actions: list (discover available models), inspect (details for one model), pricing (runtime pricing and FREE/PAID/UNPRICED classification), variants (runtime variants for a model).',
  'Each model includes configured triggers: task tags that describe when an agent should consider that model. Use these as selection guidance, not as a forced routing decision.',
  'Optional filters: provider, paid_type (ALL, PAID, FREE, UNPRICED), trigger (exact configured trigger), and limit.',
  'Triggers and costTier come from local metadata; pricing, enabled status and variants come from the current Runtime registry.',
  'The tool refreshes the Runtime registry before every action and excludes models marked enabled=false. If live refresh fails, it withholds stale model data.',
  'Read-only: this tool never filters, blocks, enables, disables, or modifies OpenCode model availability.',
].join(' ');

export const INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'inspect', 'pricing', 'variants'],
      description: 'Insight operation. Defaults to list.',
    },
    model: {
      type: 'string',
      description: 'Model ID, or provider/model ID, required by inspect and variants.',
    },
    provider: {
      type: 'string',
      description: 'Optional provider ID filter; also disambiguates a model shared by providers.',
    },
    paid_type: {
      type: 'string',
      enum: ['ALL', 'PAID', 'FREE', 'UNPRICED'],
      description: 'Optional pricing classification filter for list and pricing. Defaults to ALL.',
    },
    trigger: {
      type: 'string',
      description: 'Optional exact task trigger from model metadata, e.g. architecture, bulk-edit, or tests.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 500,
      description: 'Maximum number of rows returned. Defaults to 100.',
    },
  },
  required: [],
  additionalProperties: false,
});
