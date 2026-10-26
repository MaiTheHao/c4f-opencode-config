import {
  baseId, DECISION, normalizeProviderID, policyDecision, pricingKey,
} from '../../policy/index.js';
import { CHECK_COLUMNS } from './columns.js';
import { renderSnapshotFailure, renderStatusTable, renderTable } from './table.js';

const isPricingLoaded = (snapshot) =>
  snapshot?.pricing instanceof Map && snapshot.pricingStatus === 'loaded';

function renderRow(row) {
  return renderTable(CHECK_COLUMNS, [row]);
}

export function renderCheck(snapshot, modelID, failClosed) {
  const input = modelID.trim();
  if (input === '') {
    return renderStatusTable('ERROR', 'action="check" requires args.model');
  }
  if (snapshot === null) return renderSnapshotFailure('check', failClosed);

  const cut = input.indexOf('/');
  const providerID = cut > 0 ? normalizeProviderID(input.slice(0, cut)) : '';
  const idPart = cut > 0 ? input.slice(cut + 1) : input;
  const model = baseId(idPart);

  const authorized = snapshot.authorized instanceof Map ? snapshot.authorized.get(model) : undefined;
  const registry = isPricingLoaded(snapshot) ? snapshot.pricing.get(pricingKey(providerID, idPart)) : undefined;
  const row = {
    model,
    provider: providerID === '' ? '-' : providerID,
    class: registry?.classification ?? 'UNPRICED',
    tier: Number.isFinite(authorized?.cost) ? authorized.cost : null,
    variants: Array.isArray(registry?.variants) ? registry.variants : null,
    status: 'DENIED',
    reason: '',
  };

  if (providerID === '') {
    const isAuthorized = authorized !== undefined ? 'yes' : 'no';
    const isBanned = snapshot.banned instanceof Set && snapshot.banned.has(model) ? 'yes' : 'no';
    return renderRow({
      ...row,
      status: 'PROVIDER REQUIRED',
      reason: `authorized: ${isAuthorized}; banned: ${isBanned}`,
    });
  }

  const decision = policyDecision(snapshot, { providerID, id: idPart });

  switch (decision) {
    case DECISION.OUT_OF_SCOPE:
      return renderRow({
        ...row,
        status: 'OUT OF SCOPE',
        reason: `provider "${providerID}" is not in filteredProviders`,
      });

    case DECISION.BANNED:
      return renderRow({
        ...row,
        status: 'BANNED',
        reason: 'banned id; never select or route to it',
      });

    case DECISION.AUTHORIZED:
      return renderRow({
        ...row,
        status: 'AUTHORIZED',
        reason: 'listed in the allowlist',
      });

    case DECISION.FREE:
      return renderRow({
        ...row,
        status: 'FREE',
        reason: 'registry pricing confirms every price axis is 0',
      });

    default:
      return renderRow({
        ...row,
        status: 'DENIED',
        reason: registry?.classification === 'PAID'
          ? 'registry pricing is PAID and the model is not in the allowlist'
          : 'no trusted FREE pricing and the model is not in the allowlist',
      });
  }
}
