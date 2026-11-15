const MAX_DETAIL = 900;

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text, limit = MAX_DETAIL) {
  const value = String(text ?? '').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function syncSummary(stats) {
  if (!stats) return 'index: not synced';
  return `index: ${stats.indexed} updated, ${stats.skipped} unchanged, ${stats.removed} removed`;
}

export function renderSearch(payload, options = {}) {
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  const root = payload?.root ?? '';
  const degradedNote = options.degraded ? ' — index not refreshed: sync timed out' : '';
  const lines = [
    `**${hits.length} hit(s)** for \`${oneLine(payload?.query)}\` in \`${root}\` — ${syncSummary(payload?.index)}${degradedNote}`,
  ];

  if (hits.length === 0) {
    lines.push('', 'No matching chunk. Try a different symbol or technical term (index may not cover this file type).');
    return lines.join('\n');
  }

  lines.push('', '| # | Score | Symbol | Location | Lines |', '| --- | --- | --- | --- | --- |');
  hits.forEach((hit, index) => {
    lines.push(
      `| ${index + 1} | ${Number(hit.score).toFixed(2)} | \`${hit.symbol}\` | \`${hit.file_path}\` | ${hit.start_line}-${hit.end_line} |`,
    );
  });
  lines.push('', 'Read the file at the returned line range for full context; excerpts are omitted to keep this output small.');
  return lines.join('\n');
}

export function renderIndex(payload, root) {
  return [
    `Index synced for \`${root}\`: ${payload.indexed} updated, ${payload.skipped} unchanged, ${payload.removed} removed.`,
    `DB: \`${payload.db}\``,
  ].join('\n');
}

export function renderNotInitialized({ root, dbPath }) {
  return [
    `**NOT_INITIALIZED** Retrieval is not enabled for \`${root}\` (no index at \`${dbPath}\`).`,
    '',
    'A search never creates an index. To opt in, call this tool with `action: "index"` (the user asks to init retrieval), then search again.',
  ].join('\n');
}

export function renderFailure({ message, detail, hint }) {
  const lines = [`**ERROR** ${message}`];
  if (detail) lines.push('', '```text', truncate(detail), '```');
  if (hint) lines.push('', hint);
  return lines.join('\n');
}
