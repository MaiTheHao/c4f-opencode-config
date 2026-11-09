import { errorMessage } from '../../shared/errors.js';
import { handleInspect } from './handlers/inspect.js';
import { handleList } from './handlers/list.js';
import { handlePricing } from './handlers/pricing.js';
import { handleVariants } from './handlers/variants.js';
import { DESCRIPTION, INPUT_SCHEMA, TOOL_NAME } from './schema.js';
import { renderStatus } from './table.js';

const ACTIONS = Object.freeze({
  list: handleList,
  inspect: handleInspect,
  pricing: handlePricing,
  variants: handleVariants,
});

function normalizeArgs(input = {}) {
  const action = String(input.action ?? 'list').trim().toLowerCase();
  const paidType = String(input.paid_type ?? 'CONFIGURED').trim().toUpperCase();
  const limit = input.limit === undefined ? 100 : input.limit;
  if (!Object.hasOwn(ACTIONS, action)) {
    throw new Error(`unknown action ${JSON.stringify(action)}; valid actions: ${Object.keys(ACTIONS).join(' | ')}`);
  }
  if (!['CONFIGURED', 'ALL', 'PAID', 'FREE', 'UNPRICED'].includes(paidType)) {
    throw new Error(`unknown paid_type ${JSON.stringify(paidType)}; valid values: CONFIGURED | ALL | PAID | FREE | UNPRICED`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('limit must be an integer between 1 and 500');
  }
  return {
    action,
    model: String(input.model ?? ''),
    provider: String(input.provider ?? ''),
    paidType,
    trigger: String(input.trigger ?? ''),
    limit,
  };
}

function statusForRuntime(current) {
  if (current?.runtimeStatus === 'stale') {
    const lastSuccess = current.runtimeLoadedAt
      ? new Date(current.runtimeLoadedAt).toISOString()
      : 'unknown';
    return renderStatus('STALE', `Live availability could not be verified. Last successful refresh: ${lastSuccess}. Last-known model data is withheld to avoid recommending unavailable models.`);
  }
  const detail = current?.runtimeError ? `: ${current.runtimeError}` : '';
  return renderStatus('UNAVAILABLE', `OpenCode model registry is unavailable${detail}`);
}

export async function registerModelInsightsTool({ ctx, snapshot, refresh }) {
  if (typeof ctx?.tool?.transform !== 'function') return undefined;

  const transformResult = await ctx.tool.transform((editor) => {
    editor.add({
      name: TOOL_NAME,
      options: { codemode: true },
      description: DESCRIPTION,
      input: INPUT_SCHEMA,
      execute: async (input) => {
        try {
          // A fresh registry read on every tool call ensures availability and
          // variants are evaluated against the current OpenCode location.
          const args = normalizeArgs(input);
          if (typeof refresh === 'function') await refresh();
          const current = snapshot();
          if (!current || current.runtimeStatus !== 'loaded') {
            return { content: statusForRuntime(current) };
          }

          const content = ACTIONS[args.action](current, args);
          const warnings = [];
          if (current.unavailableModelCount > 0) {
            warnings.push(`excluded ${current.unavailableModelCount} model(s) not explicitly enabled by Runtime`);
          }
          if (current.metadataStatus !== 'loaded') warnings.push(`metadata unavailable${current.metadataError ? `: ${current.metadataError}` : ''}`);
          if (current.overrideError) warnings.push(`metadata override ignored: ${current.overrideError}`);
          if ((args.action === 'list' || args.action === 'pricing')
            && ['CONFIGURED', 'PAID', 'UNPRICED'].includes(args.paidType)) {
            const hidden = current.models.filter((model) => !model.configured && model.enabled).length;
            if (hidden > 0) warnings.push(`${hidden} model(s) hidden outside configured metadata; pass paid_type=ALL to see all runtime models`);
          }
          const note = warnings.length ? `\n\n_NOTE: ${warnings.join('; ')}._` : '';
          return { content: `${content}${note}` };
        } catch (error) {
          return { content: renderStatus('ERROR', errorMessage(error)) };
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
    },
  };
}
