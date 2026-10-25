// `allowed_models` tool: read-only view of the allowlist this session enforces.
// It never mutates the snapshot, so a tool call cannot widen what L1/L2 enforce.

import { baseId, errorMessage, loadAllowlist } from './policy.js';

const DESCRIPTION = [
  'Query the C4F model allowlist that this session enforces. Use it before picking or routing to a model.',
  'Actions: "allowed" (default) lists authorized models with variants, relative cost tier, trigger tags and strengths; "free" describes the free-model policy; "banned" lists refused ids; "check" classifies one model id.',
  'Matching is by base id (provider prefix and #variant stripped, case-insensitive); banned always wins; an unlisted id ending in the free suffix is FREE; a degraded snapshot denies everything when fail-closed.',
].join(' ');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['allowed', 'free', 'banned', 'check'],
      description: 'allowed | free | banned | check (default "allowed")',
    },
    model: {
      type: 'string',
      description:
        'Model id to classify (required for action="check"), e.g. deepseek-v4.1-flash or opencode-go/deepseek-v4.1-flash',
    },
  },
  required: [],
  additionalProperties: false,
};

export function registerAllowedModelsTool({ ctx, snapshot, policy }) {
  if (typeof ctx?.tool?.transform !== 'function') return undefined;

  const { freeSuffix } = policy;
  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  const run = async (action, model) => {
    switch (action) {
      case 'check': {
        const current = snapshot();
        const id = baseId(model);
        // Classification follows the live snapshot; display metadata is optional.
        const entry = current?.authorized.has(id) ? await lookupEntry(id) : undefined;
        return renderCheck(current, model, failClosed, entry);
      }
      case 'banned':
        return renderBanned(snapshot(), failClosed);
      case 'free':
        return renderFree((await loadAllowlist()).free, freeSuffix);
      case 'allowed':
        return renderAllowed(await loadAllowlist(), freeSuffix);
      default:
        return `ERROR: unknown action "${action}". Valid actions: allowed | free | banned | check.`;
    }
  };

  return ctx.tool.transform((editor) => {
    editor.add({
      name: 'allowed_models',
      description: DESCRIPTION,
      input: INPUT_SCHEMA,
      execute: async (input) => {
        const action = String(input?.action ?? 'allowed')
          .trim()
          .toLowerCase();

        try {
          return { content: await run(action, String(input?.model ?? '')) };
        } catch (err) {
          // Incomplete data must never read as "everything is allowed".
          return {
            content: `ERROR: cannot build the allowlist view (${errorMessage(err)}). The policy snapshot is unchanged; keep using models that are already known to be authorized.`,
          };
        }
      },
    });
  });
}

function renderAllowed({ authorized, free }, freeSuffix) {
  const rows = [...authorized.values()].sort((a, b) => costOf(a) - costOf(b));
  const lines = ['| Model | Variants | Cost | Trigger | Strengths |', '|---|---|---:|---|---|'];

  for (const entry of rows) {
    lines.push(
      `| \`${cell(entry.id)}\` | ${cell(entry.variants, 'provider-dependent')} | ${cell(entry.cost)} | ${cell(entry.trigger ?? entry.role)} | ${cell(entry.strengths, '')} |`,
    );
  }

  if (free !== undefined) {
    lines.push(
      `| \`*${freeSuffix}\` | provider-dependent | ${cell(free.cost, '0')} | ${cell(free.trigger ?? free.role)} | ${cell(free.strengths, '')} |`,
    );
  }

  lines.push(
    '',
    'Cost is a relative routing tier (lower = cheaper), not a real price.',
    `Any model id ending in "${freeSuffix}" that is not banned is also allowed at zero cost — call with action="free" for the policy.`,
  );

  return lines.join('\n');
}

function renderFree(free, freeSuffix) {
  if (free === undefined) {
    return `No "free" block is configured. A model id ending in "${freeSuffix}" that is not banned still counts as FREE.`;
  }

  return [
    'FREE model policy',
    '-----------------',
    `Any model id ending in "${freeSuffix}" that is NOT in the banned list counts as FREE and is allowed.`,
    '',
    '| Cost | Trigger tags | Strengths |',
    '|---:|---|---|',
    `| ${cell(free.cost, '0')} | ${cell(free.trigger ?? free.role)} | ${cell(free.strengths, '')} |`,
    '',
    'Use available free models only when explicitly requested or when a FREE fallback is required.',
  ].join('\n');
}

function renderBanned(current, failClosed) {
  if (current === null) return degradedNotice('banned', failClosed);

  const ids = [...current.banned].sort();
  if (ids.length === 0) return 'No models are banned.';

  return [
    'BANNED models (never select, never route to, always refuse):',
    ...ids.map((id) => `- \`${id}\``),
  ].join('\n');
}

function renderCheck(current, modelID, failClosed, entry) {
  const input = modelID.trim();
  if (input === '') {
    return 'ERROR: action="check" requires args.model (a model id, e.g. "opencode-go/deepseek-v4.1-flash").';
  }

  const id = baseId(input);
  const header = [`input: \`${input}\``, `base id: \`${id}\``];

  if (current === null) {
    const status = failClosed ? 'DENIED' : 'UNKNOWN';
    return [`STATUS: ${status}`, ...header, '', degradedNotice('check', failClosed)].join('\n');
  }

  if (current.banned.has(id)) {
    return [
      'STATUS: BANNED',
      ...header,
      '',
      'This model is banned. Never select it; pick a model from action="allowed".',
    ].join('\n');
  }

  if (current.authorized.has(id)) {
    return [
      'STATUS: AUTHORIZED',
      ...header,
      `variants: ${cell(entry?.variants, 'provider-dependent')} | cost: ${cell(entry?.cost)}`,
      `trigger: ${cell(entry?.trigger ?? entry?.role)}`,
      `strengths: ${cell(entry?.strengths, '-')}`,
    ].join('\n');
  }

  const { freeSuffix } = current;
  if (typeof freeSuffix === 'string' && freeSuffix !== '' && id.endsWith(freeSuffix)) {
    return ['STATUS: FREE', ...header, '', `Allowed because the id ends in "${freeSuffix}".`].join(
      '\n',
    );
  }

  return [
    'STATUS: UNAUTHORIZED',
    ...header,
    '',
    'Not in the allowlist. Pick an AUTHORIZED model instead (action="allowed").',
  ].join('\n');
}

/** Display metadata for one authorized base id; undefined when the file is unreadable. */
async function lookupEntry(id) {
  try {
    return (await loadAllowlist()).authorized.get(id);
  } catch {
    return undefined;
  }
}

function degradedNotice(action, failClosed) {
  return failClosed
    ? `ERROR: the policy snapshot failed to load and onSnapshotFailure is "fail-closed", so every model is currently denied. No ${action} data is available.`
    : `WARNING: the policy snapshot failed to load; enforcement currently follows "fail-open". No ${action} data is available.`;
}

function costOf(entry) {
  return Number.isFinite(entry?.cost) ? entry.cost : Number.POSITIVE_INFINITY;
}

// Table cell: arrays join, pipes are neutralized so a value cannot break the row.
function cell(value, none = 'n/a') {
  if (value === undefined || value === null) return none;
  if (Array.isArray(value))
    return value.map((item) => String(item).replaceAll('|', '/')).join(', ');
  return String(value).replaceAll('|', '/');
}
