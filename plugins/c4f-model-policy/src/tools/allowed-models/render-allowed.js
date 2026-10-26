import { DECISION } from '../../policy/index.js';
import { buildCatalog, filterByClass, pricingUnavailableMessage } from './catalog.js';
import { ALLOWED_COLUMNS } from './columns.js';
import { renderSnapshotFailure, renderStatusTable, renderTable } from './table.js';

/** Decisions that let a request through: everything else is absent from the view. */
const PERMITTED = new Set([DECISION.AUTHORIZED, DECISION.FREE]);

export function renderAllowed(snapshot, failClosed, paidType) {
  if (snapshot === null) return renderSnapshotFailure('allowed', failClosed);

  // Without registry pricing there is no FREE-by-price set and no Class evidence,
  // so filtering by class would silently drop authorized models.
  if (paidType !== 'NONE' && snapshot.pricingStatus !== 'loaded') {
    return renderStatusTable('PRICING_UNAVAILABLE', pricingUnavailableMessage(snapshot));
  }

  const rows = buildCatalog(snapshot).filter((row) => PERMITTED.has(row.decision));
  return renderTable(ALLOWED_COLUMNS, filterByClass(rows, paidType));
}
