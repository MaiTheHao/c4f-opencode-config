const NONE = '-';

export function cellText(value) {
  if (value === undefined || value === null) return NONE;
  if (Array.isArray(value)) {
    const items = value.map(cellText).filter((item) => item !== NONE);
    return items.length ? items.join(', ') : NONE;
  }
  const output = String(value).replaceAll('|', '/').replaceAll('\r', ' ').replaceAll('\n', ' ').trim();
  return output || NONE;
}

export function renderTable(columns, rows) {
  const lines = [
    `| ${columns.map((column) => column.header).join(' | ')} |`,
    `|${columns.map((column) => column.align === 'right' ? '---:' : '---').join('|')}|`,
  ];
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => cellText(column.get(row))).join(' | ')} |`);
  }
  return lines.join('\n');
}

export function renderStatus(status, message) {
  return renderTable([
    { header: 'status', get: (row) => row.status },
    { header: 'message', get: (row) => row.message },
  ], [{ status, message }]);
}
