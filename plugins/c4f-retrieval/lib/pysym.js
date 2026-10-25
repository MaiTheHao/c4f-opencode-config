// Python declaration extraction — a faithful port of the MCP implementation.
// Pure text parsing: no Python interpreter, no tree-sitter, no process spawn.

/**
 * Extract `class` / `def` / `async def` declarations from Python source.
 *
 * @param {object} input
 * @param {string} input.path   Path echoed back in the result.
 * @param {string} input.content Full file text.
 * @param {number} [input.startLine=1] Line number of `content`'s first line.
 * @returns {{ path: string, symbols: Array<{ name: string, kind: 'class'|'function', start_line: number, end_line: number }> }}
 */
export function extractPythonSymbols({ path, content, startLine = 1 }) {
  if (typeof content !== 'string') throw new Error('content must be a string');

  const lines = content.split('\n');
  const declarations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)\b/.exec(lines[index]);
    if (!match) continue;

    declarations.push({
      name: match[3],
      kind: match[2] === 'class' ? 'class' : 'function',
      start_line: startLine + index,
      end_line: startLine + lines.length - 1,
      indent: match[1].length,
    });
  }

  for (let i = 0; i < declarations.length; i += 1) {
    const current = declarations[i];

    // A body ends at the first non-blank, non-comment line at or left of its own indent.
    for (let lineIndex = current.start_line - startLine + 1; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= current.indent) {
        current.end_line = startLine + lineIndex - 1;
        break;
      }
    }

    // A sibling declaration is a boundary even when blank/comment lines intervene.
    const next = declarations[i + 1];
    if (next && next.indent <= current.indent) {
      current.end_line = Math.min(current.end_line, next.start_line - 1);
    }
  }

  return {
    path,
    symbols: declarations.map(({ name, kind, start_line, end_line }) => ({ name, kind, start_line, end_line })),
  };
}
