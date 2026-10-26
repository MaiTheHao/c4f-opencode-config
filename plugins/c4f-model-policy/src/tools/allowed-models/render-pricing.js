import { buildCatalog, filterByClass, pricingUnavailableMessage } from './catalog.js';
import { PRICING_COLUMNS } from './columns.js';
import { renderSnapshotFailure, renderStatusTable, renderTable } from './table.js';

/**
 * Raw registry view: every priced model in filteredProviders, including rows the
 * policy denies or bans. Debug surface; `allowed` is the routing view.
 */
export function renderPricing(snapshot, failClosed, paidType) {
  if (snapshot === null) return renderSnapshotFailure('pricing', failClosed);
  if (snapshot.pricingStatus !== 'loaded') {
    return renderStatusTable('PRICING_UNAVAILABLE', pricingUnavailableMessage(snapshot));
  }

  const rows = buildCatalog(snapshot).filter((row) => row.priced);
  return renderTable(PRICING_COLUMNS, filterByClass(rows, paidType));
}
