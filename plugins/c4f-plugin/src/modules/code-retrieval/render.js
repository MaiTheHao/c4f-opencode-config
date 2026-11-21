const MAX_DETAIL = 900;

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text, limit = MAX_DETAIL) {
  const value = String(text ?? '').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

/** Escape one markdown table cell: pipes, backticks and line breaks. */
function sanitizeCell(text) {
  return String(text ?? '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'");
}

/** Pure renderer: search hits as a rank/symbol/file/lines table, best (lowest bm25) first. */
export function renderSearch({ query, root, hits }) {
  const ordered = [...(Array.isArray(hits) ? hits : [])].sort((a, b) => a.score - b.score);
  const lines = [
    `**${ordered.length} hit(s)** for \`${sanitizeCell(oneLine(query))}\` in \`${sanitizeCell(root)}\``,
  ];

  if (ordered.length === 0) {
    lines.push('', 'No matching chunk. Try a different symbol or technical term (index may not cover this file type).');
    return lines.join('\n');
  }

  lines.push('', '| # | Score | Symbol | Location | Lines |', '| --- | --- | --- | --- | --- |');
  ordered.forEach((hit, index) => {
    lines.push(
      `| ${index + 1} | ${Number(hit.score).toFixed(2)} | \`${sanitizeCell(hit.symbol)}\` | \`${sanitizeCell(hit.file_path)}\` | ${hit.start_line}-${hit.end_line} |`,
    );
  });
  lines.push('', 'Read the file at the returned line range for full context; excerpts are omitted to keep this output small.');
  return lines.join('\n');
}

export function renderNotInitialized({ root, dbPath, scriptsDir }) {
  return [
    `**NOT_INITIALIZED** Retrieval is not enabled for \`${root}\` (no index at \`${dbPath}\`).`,
    '',
    'A search never creates an index. To opt in, build it once with the indexer CLI, then search again:',
    '',
    '```sh',
    `python3 ${scriptsDir}/index.py --root ${root}`,
    '```',
  ].join('\n');
}

export function renderStaleIndex({ root, dbPath, scriptsDir, detail }) {
  return [
    `**STALE_INDEX** The index at \`${dbPath}\` was built with an incompatible version (schema, tokenizer or indexer version mismatch${detail ? `: ${detail}` : ''}).`,
    '',
    'Rebuild it with the indexer CLI, then search again:',
    '',
    '```sh',
    `python3 ${scriptsDir}/index.py --root ${root} --rebuild`,
    '```',
  ].join('\n');
}

export function renderUnsupported() {
  return [
    '**DRIVER_UNSUPPORTED** No SQLite FTS5 driver is available.',
    '',
    'The search hot path needs `bun:sqlite` (Bun) or `node:sqlite` (Node >= 22.13). Run this tool under one of those runtimes.',
  ].join('\n');
}

export function renderFailure({ message, detail, hint }) {
  const lines = [`**ERROR** ${message}`];
  if (detail) lines.push('', '```text', truncate(detail), '```');
  if (hint) lines.push('', hint);
  return lines.join('\n');
}
