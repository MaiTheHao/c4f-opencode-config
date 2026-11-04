import { filterCatalog } from '../../../insights/catalog.js';
import { PRICING_COLUMNS } from '../columns.js';
import { renderTable } from '../table.js';

export function handlePricing(snapshot, args) {
  const rows = filterCatalog(snapshot.models, args).slice(0, args.limit);
  return renderTable(PRICING_COLUMNS, rows);
}
