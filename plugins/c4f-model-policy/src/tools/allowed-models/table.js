// Markdown table rendering. Every tool action returns exactly one table:
// header row plus data rows, with no prose, captions or trailing notes.

const NONE = '-';

/** Single-cell text: no pipes or line breaks, `-` when empty. */
export function cellText(value) {
  if (value === undefined || value === null) return NONE;
  if (Array.isArray(value)) {
    const items = value.map((item) => cellText(item)).filter((item) => item !== NONE);
    return items.length === 0 ? NONE : items.join(', ');
  }
  const text = String(value).replaceAll('|', '/').replaceAll('\r', ' ').replaceAll('\n', ' ').trim();
  return text === '' ? NONE : text;
}

/** Render one table; empty rows still produce the header and separator. */
export function renderTable(columns, rows) {
  const lines = [headerRow(columns), separatorRow(columns)];
  for (const item of rows) lines.push(dataRow(columns, item));
  return lines.join('\n');
}

/** Error / degraded state: a single-row `| status | message |` table. */
export function renderStatusTable(status, message) {
  return renderTable(STATUS_COLUMNS, [{ status, message }]);
}

/** Degraded snapshot, phrased by the configured failure policy. */
export function renderSnapshotFailure(action, failClosed) {
  return renderStatusTable(
    failClosed ? 'DENIED' : 'FAIL-OPEN',
    failClosed
      ? `policy snapshot failed to load and onSnapshotFailure is "fail-closed": every model is denied, so no ${action} data is available`
      : `policy snapshot failed to load and enforcement follows "fail-open", so no ${action} data is available`,
  );
}

const STATUS_COLUMNS = [
  { key: 'status', header: 'status', get: (item) => item.status },
  { key: 'message', header: 'message', get: (item) => item.message },
];

function valueOf(column, item) {
  const value = column.get(item);
  return column.format ? column.format(value) : value;
}

function headerRow(columns) {
  return `| ${columns.map((column) => column.header).join(' | ')} |`;
}

function separatorRow(columns) {
  return `|${columns.map((column) => (column.align === 'right' ? '---:' : '---')).join('|')}|`;
}

function dataRow(columns, item) {
  return `| ${columns.map((column) => cellText(valueOf(column, item))).join(' | ')} |`;
}
