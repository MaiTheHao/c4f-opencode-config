import { resolveModel } from '../../../insights/catalog.js';
import { INSPECT_COLUMNS } from '../columns.js';
import { renderStatus, renderTable } from '../table.js';

export function handleInspect(snapshot, args) {
  const resolved = resolveModel(snapshot.models, args.model, args.provider);
  if (resolved.error) return renderStatus('ERROR', resolved.error);
  if (resolved.matches.length === 0) return renderStatus('NOT_FOUND', `no runtime model matched ${JSON.stringify(args.model)}`);
  if (resolved.ambiguous) return renderStatus('AMBIGUOUS', 'model ID exists under multiple providers; supply provider or use provider/model');
  return renderTable(INSPECT_COLUMNS, resolved.matches);
}
