import { filterCatalog } from '../../../insights/catalog.js';
import { LIST_COLUMNS } from '../columns.js';
import { renderTable } from '../table.js';

export function handleList(snapshot, args) {
  const rows = filterCatalog(snapshot.models, args).slice(0, args.limit);
  return renderTable(LIST_COLUMNS, rows);
}
