// Code outline: class / interface / enum / function / method declarations with
// 1-based start/end lines. Pure text parsing (approximate, not an AST): no
// interpreter, no tree-sitter, no process spawn.
//
// Languages (selected by file extension):
//   python      .py .pyi                              indentation based
//   java        .java                                 brace based
//   typescript  .ts .tsx .mts .cts .js .jsx .mjs .cjs  brace based
//
// To add a language: add an entry to LANGUAGES with its extensions and a
// `parse(content)` returning [{ name, qualname, kind, start, end }] (0-based lines).

import { extname } from 'node:path';

const TYPE_KINDS = { class: 'class', record: 'class', interface: 'interface', '@interface': 'interface', enum: 'enum', namespace: 'namespace' };
const TYPE_KIND_SET = new Set(['class', 'interface', 'enum', 'namespace']);

/* ---------- public API ---------- */

/** Language descriptor for a path, or null when the extension is unsupported. */
export function languageFor(path) {
  return typeof path === 'string' ? (BY_EXTENSION.get(extname(path).toLowerCase()) ?? null) : null;
}

export const OUTLINE_EXTENSIONS = () => [...BY_EXTENSION.keys()];

/**
 * @param {object} input
 * @param {string} input.path     Used to pick the language; echoed back.
 * @param {string} input.content  Full file text.
 * @param {number} [input.startLine=1]
 * @param {string} [input.nameContains] Case-insensitive filter on the qualified name.
 * @returns {{ path: string, language: string, declarations: Array<{ name: string, qualname: string, kind: 'class'|'interface'|'enum'|'namespace'|'function'|'method', start_line: number, end_line: number }> }}
 */
export function extractOutline({ path, content, startLine = 1, nameContains }) {
  if (typeof content !== 'string') throw new Error('content must be a string');

  const language = languageFor(path);
  if (language === null) throw new Error(`unsupported file type; supported: ${OUTLINE_EXTENSIONS().join(' ')}`);

  const filter = typeof nameContains === 'string' && nameContains !== '' ? nameContains.toLowerCase() : null;

  const declarations = language
    .parse(content)
    .filter((item) => filter === null || item.qualname.toLowerCase().includes(filter))
    .map((item) => ({
      name: item.name,
      qualname: item.qualname,
      kind: item.kind,
      start_line: startLine + item.start,
      end_line: startLine + item.end,
    }));

  return { path, language: language.id, declarations };
}

/* ---------- Python (indentation) ---------- */

const PY_DECL = /^([ \t]*)(?:async[ \t]+)?(def|class)[ \t]+([A-Za-z_]\w*)/;

function outlinePython(content) {
  const lines = content.split(/\r?\n/);
  const logical = markLogicalLines(lines);
  const result = [];
  const stack = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!logical[i]) continue;
    const match = PY_DECL.exec(lines[i]);
    if (!match) continue;

    const indent = match[1].length;
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();

    const parent = stack[stack.length - 1];
    const name = match[3];
    const qualname = parent ? `${parent.qualname}.${name}` : name;
    const kind = match[2] === 'class' ? 'class' : parent?.kind === 'class' ? 'method' : 'function';

    stack.push({ indent, qualname, kind });
    result.push({ name, qualname, kind, start: i, end: pythonBodyEnd(lines, logical, i, indent) });
  }
  return result;
}

/** Last code line of the declaration at `start` (trailing blanks/comments excluded). */
function pythonBodyEnd(lines, logical, start, indent) {
  let last = start;
  for (let j = start + 1; j < lines.length; j += 1) {
    const text = lines[j];
    const trimmed = text.trim();
    if (trimmed === '') continue;
    if (logical[j]) {
      if (trimmed.startsWith('#')) continue;
      if (text.length - text.trimStart().length <= indent) break;
    }
    last = j;
  }
  return last;
}

/**
 * A line is "logical" when it begins a statement: not inside a triple-quoted
 * string, not inside brackets, not after a backslash continuation.
 */
function markLogicalLines(lines) {
  const logical = new Array(lines.length).fill(false);
  let triple = null;
  let depth = 0;
  let continued = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    logical[i] = triple === null && depth === 0 && !continued;
    continued = false;
    let quote = null;

    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];

      if (triple !== null) {
        if (ch === '\\') j += 1;
        else if (line.startsWith(triple, j)) {
          triple = null;
          j += 2;
        }
        continue;
      }
      if (quote !== null) {
        if (ch === '\\') j += 1;
        else if (ch === quote) quote = null;
        continue;
      }

      if (ch === '#') break;
      if (ch === '"' || ch === "'") {
        if (line.startsWith(ch.repeat(3), j)) {
          triple = ch.repeat(3);
          j += 2;
        } else {
          quote = ch;
        }
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
      } else if (ch === '\\' && j === line.length - 1) {
        continued = true;
      }
    }
  }
  return logical;
}

/* ---------- brace languages (Java, TypeScript/JavaScript) ---------- */

const ANNOTATIONS = String.raw`(?:@\w+(?:\([^)\n]*\))?[ \t]+)*`;
const JAVA_MODIFIERS = 'public|protected|private|abstract|static|final|sealed|non-sealed|strictfp|synchronized|native|default';

/** Words that look like `type name(` or `name(` but are statements. */
const NOT_A_TYPE = new Set(['return', 'new', 'throw', 'else', 'case', 'yield', 'assert', 'await', 'delete', 'typeof', 'import', 'package', 'extends', 'implements']);
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'synchronized', 'return', 'new', 'throw', 'super', 'this', 'else', 'do', 'function', 'with', 'await', 'typeof']);

const JAVA = {
  templates: false,
  textBlocks: true,
  rules: [
    {
      mode: 'type',
      regex: new RegExp(String.raw`^[ \t]*${ANNOTATIONS}(?:(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp)[ \t]+)*(class|interface|enum|record|@interface)[ \t]+([A-Za-z_$][\w$]*)`),
      kind: (m) => TYPE_KINDS[m[1]],
      name: 2,
    },
    {
      mode: 'callable',
      back: 1,
      regex: new RegExp(String.raw`^[ \t]*${ANNOTATIONS}(?:(?:${JAVA_MODIFIERS})[ \t]+)*(?:<[^>\n]*>[ \t]+)?(?:([\w.$]+(?:<[^\n(]*?>)?(?:\[\])*)[ \t]+)?([A-Za-z_$][\w$]*)[ \t]*\(`),
      kind: () => 'function',
      name: 2,
      reject: (m) => NOT_A_TYPE.has(m[1]) || CONTROL.has(m[2]),
    },
  ],
};

const TYPESCRIPT = {
  templates: true,
  textBlocks: false,
  rules: [
    {
      mode: 'type',
      regex: /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:declare[ \t]+)?(?:abstract[ \t]+)?(class|interface|enum|namespace)[ \t]+([A-Za-z_$][\w$]*)/,
      kind: (m) => TYPE_KINDS[m[1]],
      name: 2,
    },
    {
      mode: 'callable',
      back: 1,
      regex: /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:declare[ \t]+)?(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*[<(]/,
      kind: () => 'function',
      name: 1,
    },
    {
      // const f = (...) => {   const f = function ...   class field: handler = (e) => {
      mode: 'arrow',
      regex: /^[ \t]*(?:export[ \t]+)?(?:(?:const|let|var|public|private|protected|static|readonly|override)[ \t]+)*([A-Za-z_$#][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*/,
      kind: () => 'function',
      name: 1,
    },
    {
      // class / object methods, constructors, get/set, decorated members
      mode: 'callable',
      back: 1,
      regex: new RegExp(
        String.raw`^[ \t]*${ANNOTATIONS}(?:(?:public|protected|private|static|abstract|override|readonly|async|get|set|declare|export|default)[ \t]+)*\*?[ \t]*([A-Za-z_$#][\w$]*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(`,
      ),
      kind: () => 'function',
      name: 1,
      reject: (m) => CONTROL.has(m[1]),
    },
  ],
};

/** After the parameter list, a newline may only continue a signature, not start a new statement. */
const CONTINUATION = /^\s*(?:\{|throws\b|extends\b|implements\b|:)/;

function outlineBraces(content, language) {
  const text = maskCode(content, language);
  const lines = text.split('\n');
  const offsets = [];
  let position = 0;
  for (const line of lines) {
    offsets.push(position);
    position += line.length + 1;
  }
  const pairs = matchBraces(text);

  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;

    for (const rule of language.rules) {
      const match = rule.regex.exec(line);
      if (!match) continue;
      if (rule.reject?.(match)) break;

      const from = offsets[index] + match[0].length - (rule.back ?? 0);
      let mode = rule.mode;
      if (mode === 'arrow' && /^(?:async[ \t]+)?function\b/.test(text.slice(from, from + 24))) mode = 'callable';

      const open = findBody(text, from, mode);
      if (open >= 0) {
        const close = pairs.get(open) ?? text.length - 1;
        found.push({
          name: match[rule.name],
          kind: rule.kind(match),
          start: offsets[index],
          close,
          startLine: index,
          endLine: lineOf(offsets, close),
        });
      }
      break; // first matching rule decides, whether or not it has a body
    }
  }

  // Keep only declarations whose nearest accepted ancestor is a type (or none):
  // locals, lambdas and nested helpers inside function bodies are noise.
  const result = [];
  const stack = [];
  for (const item of found) {
    while (stack.length > 0 && stack[stack.length - 1].close < item.start) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent && !TYPE_KIND_SET.has(parent.kind)) continue;

    const isType = TYPE_KIND_SET.has(item.kind);
    const kind = !isType && parent ? 'method' : item.kind;
    const qualname = parent ? `${parent.qualname}.${item.name}` : item.name;

    const entry = { ...item, kind, qualname };
    stack.push(entry);
    result.push({ name: item.name, qualname, kind, start: item.startLine, end: item.endLine });
  }
  return result;
}

/**
 * Offset of the `{` that opens a declaration's body, or -1 when it has none
 * (abstract/interface method, call statement, plain assignment).
 * `mode`: 'type' (class header), 'callable' (params then body), 'arrow' (`=> {`).
 */
function findBody(text, from, mode) {
  let depth = 0;
  let closedParams = false;
  let sawArrow = false;

  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '(' || ch === '[') {
      depth += 1;
    } else if (ch === ')' || ch === ']') {
      depth -= 1;
      if (depth < 0) return -1;
      if (depth === 0 && ch === ')') closedParams = true;
    } else if (depth > 0) {
      continue;
    } else if (ch === ';' || ch === '}') {
      return -1;
    } else if (ch === '{') {
      return mode === 'arrow' && !sawArrow ? -1 : i;
    } else if (ch === '=') {
      if (text[i + 1] !== '>') {
        if (mode !== 'type') return -1;
      } else {
        sawArrow = true;
        i += 1;
        if (mode === 'arrow') {
          let j = i + 1;
          while (j < text.length && /\s/.test(text[j])) j += 1;
          return text[j] === '{' ? j : -1;
        }
      }
    } else if (ch === '\n') {
      if (mode === 'arrow' && !sawArrow) return -1;
      if (mode === 'callable' && closedParams && !CONTINUATION.test(text.slice(i + 1, i + 160))) return -1;
    }
  }
  return -1;
}

/** Open-brace offset -> matching close-brace offset (on masked text). */
function matchBraces(text) {
  const pairs = new Map();
  const stack = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') stack.push(i);
    else if (ch === '}') {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, i);
    }
  }
  return pairs;
}

function lineOf(offsets, offset) {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Copy of the source with comment and string *contents* blanked, same length,
 * newlines preserved. Braces, parentheses and keywords inside strings or
 * comments therefore cannot confuse matching. An unterminated quote ends at the
 * line end, so one stray apostrophe (JSX text, regex literal) cannot swallow
 * the rest of the file.
 */
function maskCode(source, { templates, textBlocks }) {
  const out = source.split('');
  const length = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };

  let i = 0;
  while (i < length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end < 0) end = length;
      blank(i, end);
      i = end;
    } else if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close < 0 ? length : close + 2;
      blank(i, end);
      i = end;
    } else if (textBlocks && source.startsWith('"""', i)) {
      const close = source.indexOf('"""', i + 3);
      const end = close < 0 ? length : close + 3;
      blank(i + 3, Math.max(i + 3, end - 3));
      i = end;
    } else if (ch === '"' || ch === "'" || (templates && ch === '`')) {
      let j = i + 1;
      while (j < length && source[j] !== ch) {
        if (source[j] === '\\') j += 1;
        else if (source[j] === '\n' && ch !== '`') break;
        j += 1;
      }
      blank(i + 1, Math.min(j, length));
      i = source[j] === ch ? j + 1 : j;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/* ---------- registry ---------- */

const LANGUAGES = [
  { id: 'python', extensions: ['.py', '.pyi'], parse: outlinePython },
  { id: 'java', extensions: ['.java'], parse: (content) => outlineBraces(content, JAVA) },
  {
    id: 'typescript',
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    parse: (content) => outlineBraces(content, TYPESCRIPT),
  },
];

const BY_EXTENSION = new Map(LANGUAGES.flatMap((language) => language.extensions.map((ext) => [ext, language])));
