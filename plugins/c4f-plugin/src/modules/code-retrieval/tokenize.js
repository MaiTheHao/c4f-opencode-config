// TypeScript-mirror of scripts/tokenizer.py (Python is the source of truth).
// Must match the golden fixture plugins/c4f-plugin/test/fixtures/tokenizer_cases.json.
// TOKENIZER_VERSION must equal scripts/tokenizer.py TOKENIZER_VERSION.

export const TOKENIZER_VERSION = 1;

const CODE_STOPWORDS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'void', 'class',
  'interface', 'extends', 'implements', 'return', 'new', 'this', 'super',
  'import', 'package', 'from', 'export', 'default', 'const', 'let', 'var',
  'function', 'async', 'await', 'if', 'else', 'for', 'while', 'switch',
  'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws',
  'true', 'false', 'null', 'undefined', 'boolean', 'int', 'long', 'double',
  'float', 'string', 'number', 'any', 'override',
  // Python keywords / literals.
  'def', 'self', 'cls', 'none', 'elif', 'except', 'lambda', 'pass', 'with',
  'as', 'yield', 'raise', 'assert', 'del', 'global', 'nonlocal', 'in', 'is',
  'not', 'and', 'or',
  // Common noise in HTML/XML/CSS.
  'html', 'head', 'href', 'src', 'xmlns', 'doctype', 'px', 'rgba', 'rgb',
]);

/** Split query/code text into search tokens. Mirrors Python tokenize_code exactly. */
export function normalizeTokens(text) {
  const rawIdentifiers = String(text ?? '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const tokens = [];

  for (const ident of rawIdentifiers) {
    const lowerIdent = ident.toLowerCase();
    if (lowerIdent.length > 1 && !CODE_STOPWORDS.has(lowerIdent)) {
      tokens.push(lowerIdent);
    }

    const snakeParts = ident.split('_').filter((p) => p.length > 0);
    for (const part of snakeParts) {
      const camelSplit = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
      const camelParts = camelSplit.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/\s+/);

      if (camelParts.length > 1 || snakeParts.length > 1) {
        for (const sub of camelParts) {
          const subLower = sub.toLowerCase();
          if (subLower.length > 1 && !CODE_STOPWORDS.has(subLower)) {
            tokens.push(subLower);
          }
        }
      }
    }
  }

  return tokens;
}
