// `allowed_models` tool: read-only view of the policy snapshot this session enforces.
// It describes only the snapshot that L1/L2 enforce and never re-reads the config file,
// so a tool call cannot widen what enforcement applies.

import { baseId, DECISION, errorMessage, isMoney, normalizeProviderID, policyDecision, pricingKey } from './policy.js';

const DESCRIPTION = [
  'Query the C4F model policy this session enforces. Use it before picking or routing to a model.',
  'Actions: "allowed" (default) lists authorized models with registry variants, routing tier, trigger tags and strengths; "pricing" lists registry prices with FREE/PAID/UNPRICED classification; "banned" lists refused ids; "check" classifies one provider/model.',
  'The policy applies only to providers in filteredProviders; other providers are neither filtered nor interrupted. Matching is by base id (provider prefix and #variant stripped, case-insensitive). Banned wins; an unlisted model is allowed only when registry pricing proves every price axis is zero.',
  'Pricing comes from a registry snapshot and may be stale; it is not billing data.',
].join(' ');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['allowed', 'pricing', 'banned', 'check'],
      description: 'allowed | pricing | banned | check (default "allowed")',
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

  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  const run = (action, model) => {
    switch (action) {
      case 'pricing': return renderPricing(snapshot(), failClosed);
      case 'banned': return renderBanned(snapshot(), failClosed);
      case 'check': return renderCheck(snapshot(), model, failClosed);
      case 'allowed': return renderAllowed(snapshot(), failClosed);
      default: return `ERROR: unknown action "${action}". Valid actions: allowed | pricing | banned | check.`;
    }
  };

  return ctx.tool.transform((editor) => {
    if (typeof editor?.namespace === 'function') {
      editor.namespace({
        name: 'c4f-model-policy',
        description: 'C4F model policy: enforced allowlist, pricing and routing view',
      });
    }

    editor.add({
      name: 'allowed_models',
      options: { namespace: 'c4f-model-policy', codemode: true },
      description: DESCRIPTION,
      input: INPUT_SCHEMA,
      execute: async (input) => {
        const action = String(input?.action ?? 'allowed')
          .trim()
          .toLowerCase();

        try {
          return { content: run(action, String(input?.model ?? '')) };
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

function renderAllowed(current, failClosed) {
  if (current === null) return degradedNotice('allowed', failClosed);

  const rows = [...current.authorized.values()]
    .map((entry) => ({ entry, base: baseId(entry.id) }))
    .sort((a, b) => costOf(a.entry) - costOf(b.entry) || a.base.localeCompare(b.base));
  const SEPARATOR = `|${['---', '---', '---', '---:', '---', '---'].join('|')}|`;
  const lines = ['| Model | Provider | Variants | Routing tier | Trigger | Strengths |', SEPARATOR];

  const rendered = [];
  for (const { entry, base } of rows) {
    const registryRows = current.pricing instanceof Map && current.pricingStatus === 'loaded'
      ? [...current.pricing.values()].filter((row) => row.id === base).sort((a, b) => (a.providerID < b.providerID ? -1 : a.providerID > b.providerID ? 1 : 0))
      : [];
    if (registryRows.length === 0) {
      rendered.push({ tier: costOf(entry), provider: '', model: base, entry, variants: null });
    } else {
      for (const row of registryRows) {
        rendered.push({ tier: costOf(entry), provider: row.providerID, model: base, entry, variants: row.variants });
      }
    }
  }
  rendered.sort((a, b) => a.tier - b.tier || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));

  for (const { entry, provider, variants } of rendered) {
    if (provider === '') {
      const fallback = current.pricingStatus !== 'loaded' ? 'n/a (registry unavailable)' : 'n/a (not in registry)';
      lines.push(
        `| \`${cell(entry.id)}\` | n/a | ${fallback} | ${cell(entry.cost)} | ${cell(entry.trigger ?? entry.role)} | ${cell(entry.strengths, '')} |`,
      );
    } else {
      const variantCell = Array.isArray(variants) && variants.length > 0 ? cell(variants) : 'none';
      lines.push(
        `| \`${cell(entry.id)}\` | \`${cell(provider)}\` | ${variantCell} | ${cell(entry.cost)} | ${cell(entry.trigger ?? entry.role)} | ${cell(entry.strengths, '')} |`,
      );
    }
  }

  const scope = [...current.filteredProviders].sort().map((id) => `\`${id}\``).join(', ');
  lines.push(
    '',
    'Routing tier is a relative routing weight (lower = cheaper), not a token price.',
    'Variants and prices are read from the live registry per provider, not from the policy config; they may be stale.',
    'Rows are ordered by routing tier, then provider.',
    `Policy scope (filteredProviders): ${scope}. Models from other providers are neither filtered nor interrupted.`,
  );

  return lines.join('\n');
}

function renderPricing(current, failClosed) {
  if (current === null) return degradedNotice('pricing', failClosed);

  if (current.pricingStatus !== 'loaded') {
    const first = current.pricingError ? `PRICING UNAVAILABLE: ${current.pricingError}` : 'PRICING UNAVAILABLE';
    return [
      first,
      'Only authorized models are allowed; FREE-by-price cannot be verified from registry pricing.',
      'Banned ids from filteredProviders are still refused.',
    ].join('\n');
  }

  const lines = ['| Model | Provider | Input price | Output price | Class |', '|---|---|---|---|---|'];
  const rows = [...current.pricing.values()].sort(
    (a, b) => (a.providerID < b.providerID ? -1 : a.providerID > b.providerID ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );

  if (rows.length === 0) {
    lines.push('| _none_ | - | - | - | - |');
  }

  for (const entry of rows) {
    const input = isMoney(entry.input) ? `${entry.input} USD/M tokens` : 'n/a';
    const output = isMoney(entry.output) ? `${entry.output} USD/M tokens` : 'n/a';
    lines.push(`| \`${entry.id}\` | \`${entry.providerID}\` | ${input} | ${output} | ${entry.classification} |`);
  }

  lines.push(
    '',
    'FREE = every price axis (input, output, cache read/write, across all tiers) confirmed 0. PAID = at least one axis > 0. UNPRICED = missing or untrusted pricing; never treated as FREE.',
    `Source: OpenCode registry snapshot loaded at ${new Date(current.pricingLoadedAt).toISOString()}; it may be stale and is not billing data.`,
  );

  return lines.join('\n');
}

function renderBanned(current, failClosed) {
  if (current === null) return degradedNotice('banned', failClosed);

  const scope = [...current.filteredProviders].sort().map((id) => `\`${id}\``).join(', ');
  const note = `Applies only to providers in filteredProviders: ${scope}.`;

  const ids = [...current.banned].sort();
  if (ids.length === 0) return ['No models are banned.', '', note].join('\n');

  return [
    'BANNED models (never select, never route to, always refuse):',
    ...ids.map((id) => `- \`${id}\``),
    '',
    note,
  ].join('\n');
}

function renderCheck(current, modelID, failClosed) {
  const input = modelID.trim();
  if (input === '') {
    return 'ERROR: action="check" requires args.model (a model id, e.g. "opencode-go/deepseek-v4.1-flash").';
  }

  const cut = input.indexOf('/');
  const providerID = cut > 0 ? normalizeProviderID(input.slice(0, cut)) : '';
  const idPart = cut > 0 ? input.slice(cut + 1) : input;
  const id = baseId(idPart);
  const header = [`input: \`${input}\``, `base id: \`${id}\``];

  if (current === null) {
    const status = failClosed ? 'DENIED' : 'UNKNOWN';
    return [`STATUS: ${status}`, ...header, '', degradedNotice('check', failClosed)].join('\n');
  }

  if (providerID === '') {
    const authorized = current.authorized.has(id) ? 'yes' : 'no';
    const banned = current.banned.has(id) ? 'yes' : 'no';
    return [
      'STATUS: PROVIDER REQUIRED',
      ...header,
      'provider: not provided',
      `authorized: ${authorized} | banned: ${banned} (banned applies only within filteredProviders)`,
      '',
      'Enforcement and FREE-by-price depend on the provider: the same base id can be authorized or priced differently per provider. Re-run with "provider/model".',
    ].join('\n');
  }

  const provider = `provider: \`${providerID}\``;
  const ref = { providerID, id: idPart };
  const decision = policyDecision(current, ref);
  const priced = current.pricing instanceof Map ? current.pricing.get(pricingKey(providerID, idPart)) : undefined;

  if (decision === DECISION.OUT_OF_SCOPE) {
    return [
      'STATUS: OUT OF SCOPE',
      provider,
      ...header,
      '',
      `\`${providerID}\` is not in filteredProviders; the plugin neither filters nor interrupts this provider.`,
    ].join('\n');
  }

  if (decision === DECISION.BANNED) {
    return [
      'STATUS: BANNED',
      provider,
      ...header,
      '',
      'This model is banned for the filtered providers. Never select it; pick a model from action="allowed".',
    ].join('\n');
  }

  if (decision === DECISION.AUTHORIZED) {
    const authEntry = current.authorized.get(id);
    const registry = current.pricing instanceof Map && current.pricingStatus === 'loaded' ? current.pricing.get(pricingKey(providerID, idPart)) : undefined;
    const variants = Array.isArray(registry?.variants) && registry.variants.length > 0 ? registry.variants.join(', ') : null;
    const fallback = current.pricingStatus !== 'loaded' ? 'n/a (registry unavailable)' : 'n/a (not in registry)';
    return [
      'STATUS: AUTHORIZED',
      provider,
      ...header,
      `variants: ${variants ?? fallback} | routing tier: ${cell(authEntry?.cost)}`,
      `trigger: ${cell(authEntry?.trigger ?? authEntry?.role)}`,
      `strengths: ${cell(authEntry?.strengths, '-')}`,
    ].join('\n');
  }

  if (decision === DECISION.FREE) {
    const inputPrice = isMoney(priced?.input) ? `${priced.input} USD/M tokens` : 'n/a';
    const outputPrice = isMoney(priced?.output) ? `${priced.output} USD/M tokens` : 'n/a';
    return [
      'STATUS: FREE',
      provider,
      ...header,
      `input price: ${inputPrice} | output price: ${outputPrice}`,
      '',
      'Allowed because registry pricing confirms every price axis is 0. Pricing may be stale and is not billing data.',
    ].join('\n');
  }

  let reason;
  if (priced !== null && typeof priced === 'object' && priced.classification === 'PAID') {
    reason = 'reason: pricing is PAID';
  } else if (priced !== null && typeof priced === 'object' && priced.classification !== undefined) {
    reason = 'reason: pricing is UNPRICED — missing or untrusted, never proof of zero';
  } else {
    reason = `reason: no registry pricing in snapshot${current.pricingStatus !== 'loaded' ? '; pricing snapshot unavailable' : ''}`;
  }

  return [
    'STATUS: DENIED',
    provider,
    ...header,
    reason,
    '',
    'Pick an AUTHORIZED model (action="allowed").',
  ].join('\n');
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
