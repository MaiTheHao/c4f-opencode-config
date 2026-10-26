// `allowed_models` tool: read-only view of the policy snapshot this session enforces.
// It describes only the snapshot that L1/L2 enforce and never re-reads the config file,
// so a tool call cannot widen what enforcement applies.

import { errorMessage } from '../../shared/errors.js';
import { DESCRIPTION, INPUT_SCHEMA, NAMESPACE, TOOL_NAME } from './schema.js';
import { renderAllowed } from './render-allowed.js';
import { renderBanned } from './render-banned.js';
import { renderCheck } from './render-check.js';
import { renderPricing } from './render-pricing.js';
import { renderStatusTable } from './table.js';

const ACTIONS = ['allowed', 'pricing', 'banned', 'check'];
const PAID_TYPES = ['NONE', 'PAID', 'FREE'];

export function registerAllowedModelsTool({ ctx, snapshot, policy }) {
  if (typeof ctx?.tool?.transform !== 'function') return undefined;

  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  const actions = {
    allowed: (model, paidType) => renderAllowed(snapshot(), failClosed, paidType),
    pricing: (model, paidType) => renderPricing(snapshot(), failClosed, paidType),
    banned: () => renderBanned(snapshot(), failClosed),
    check: (model) => renderCheck(snapshot(), model, failClosed),
  };

  const run = (action, model, paidType) => {
    const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;
    return handler
      ? handler(model, paidType)
      : renderStatusTable('ERROR', `unknown action "${action}". Valid actions: ${ACTIONS.join(' | ')}`);
  };

  return ctx.tool.transform((editor) => {
    if (typeof editor?.namespace === 'function') editor.namespace(NAMESPACE);

    editor.add({
      name: TOOL_NAME,
      options: { namespace: NAMESPACE.name, codemode: true },
      description: DESCRIPTION,
      input: INPUT_SCHEMA,
      execute: async (input) => {
        const action = String(input?.action ?? 'allowed').trim().toLowerCase();
        const paidType = String(input?.model_paid_type ?? 'NONE').trim().toUpperCase();

        try {
          if (!PAID_TYPES.includes(paidType)) {
            return {
              content: renderStatusTable(
                'ERROR',
                `unknown model_paid_type "${paidType}". Valid values: ${PAID_TYPES.join(' | ')}`,
              ),
            };
          }

          return { content: run(action, String(input?.model ?? ''), paidType) };
        } catch (err) {
          // Incomplete data must never read as "everything is allowed".
          return {
            content: renderStatusTable(
              'ERROR',
              `cannot build the allowlist view (${errorMessage(err)}); the policy snapshot is unchanged, keep using models already known to be authorized`,
            ),
          };
        }
      },
    });
  });
}
