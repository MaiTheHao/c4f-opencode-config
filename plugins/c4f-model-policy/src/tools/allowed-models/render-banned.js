import { BANNED_COLUMNS } from './columns.js';
import { renderSnapshotFailure, renderTable } from './table.js';

export function renderBanned(snapshot, failClosed) {
  if (snapshot === null) return renderSnapshotFailure('banned', failClosed);

  const rows = [...snapshot.banned].sort().map((model) => ({ model }));
  return renderTable(BANNED_COLUMNS, rows);
}
