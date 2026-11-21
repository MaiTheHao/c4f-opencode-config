# c4f-plugin

OpenCode plugin for C4F repository hygiene. Features live under `src/modules/`; each module is
independent and is registered in `src/modules/registry.js`.

| Module | Purpose |
| --- | --- |
| `codeRetrieval` | Native `code_retrieval` tool: Tree-sitter AST + BM25 code/docs search |
| `updateCheck` | Background probe of both C4F config repos, surfaced as an advisory in the next prompt |

## Module: code-retrieval

Registers one Code Mode tool, `code_retrieval`, backed by the Python indexer in
`src/modules/code-retrieval/scripts/` (the scripts ship with the plugin — there is no separate skill).
Reads go through a readonly FTS5 store; indexing happens exclusively via the
indexer CLI (`scripts/index.py`, incl. `--watch`).

| Action | Purpose |
| --- | --- |
| `search` (only) | Ranked code chunks for a symbol name or technical keyword. To build or refresh the index, run the indexer CLI once, then search again. |

Arguments: `query` (required for search), `top_k` (1–50, default 5), `root` (defaults to the session
directory).

### Supported file types

| Type | Extensions | Chunking |
| --- | --- | --- |
| Java | `.java` | Tree-sitter AST (class, interface, enum, method, constructor) |
| TypeScript / JavaScript | `.ts`, `.js` | Tree-sitter AST (function, class, method, interface, type, arrow function) |
| Python | `.py` | Tree-sitter AST (`class`, `def`, decorated def) when `tree-sitter-python` is installed; otherwise indentation-based `class`/`def` blocks with decorators |
| YAML | `.yml`, `.yaml` | Top-level keys |
| Markdown | `.md`, `.markdown` | Headings (fenced code blocks ignored), preamble before the first heading |
| JSON | `.json` | Top-level object members or array items |
| HTML | `.html`, `.htm` | Semantic containers (`section`, `article`, `main`, `header`, `footer`, `nav`, `aside`, `form`, `table`, `dialog`, `template`, `script`, `style`, and `div` with an id/class), plus fragments outside containers |
| CSS | `.css` | Rules and at-rules (`@media`, `@supports`, `@keyframes` are indexed recursively) |
| XML | `.xml` | Direct children of the root element (for example each bean in a Spring context) |

Java/TypeScript/JavaScript need the base Tree-sitter grammars. The YAML/Markdown/JSON/HTML/CSS/XML
chunkers use the format's own structure and need no extra grammar; Python without
`tree-sitter-python` falls back to indentation parsing. A file that yields no structured chunk is
indexed as one `file_module` chunk, so nothing is silently skipped.

### Workspace changes

The project root is resolved **per tool call**: explicit `root` > plugin option/env > the session's
current location (`session.get(sessionID).location.directory`) > the plugin setup location. Moving a
session to another workspace therefore searches that workspace immediately — the setup location is
only a fallback for runtimes without session lookup.

The startup path does nothing in the background: there is no warm-up, no sync and
no spawned process. After a workspace switch the first search reads the new
workspace's database immediately.

### Opt-in flag: the database file

The tool does not maintain its own sync flag. The **index database is the flag**:

- `<root>/local/agents/retrieval/code_bm25.db` missing → `search` returns `NOT_INITIALIZED` and no
  Python process is spawned. A session that never touches code never pays for a repository scan.
- Database present (created by an explicit indexer CLI run) → `search` reads it directly.
- `C4F_RETRIEVAL_DB` / `codeRetrieval.db` relocate the database if needed.

`local/` is gitignored in the target repos, so initialization is per checkout and per worktree.

### Indexing with the CLI

The postings live in one FTS5 table (`fts_chunks`); the indexer CLI owns all writes.
To repair a hand-edited or stale database, run
`python3 src/modules/code-retrieval/scripts/index.py --root <root> --rebuild`.
The index remains under the gitignored `local/agents/retrieval/` directory.

A no-op indexer pass over an unchanged tree imports no Tree-sitter grammars
(the parser loads lazily only when a file hash actually changed).

### Startup behavior

There is no warm-up and no background sync: setup registers the tool and never
spawns the indexer. `C4F_RETRIEVAL_TOOL=0` disables the tool.

| Option (`ctx.options.codeRetrieval`) | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Register the tool at all |
| `scriptsDir` | `<module>/scripts` | Python indexer location |
| `root` | session directory | Default project root |
| `db` | `<root>/local/agents/retrieval/code_bm25.db` | Explicit database file |
| `codemode` | `true` | Code Mode tool; `false` exposes a first-class tool |

Failures are returned as tool content, never thrown. A search against a missing
index explains how to build it; a stale index names the rebuild command; without
a SQLite FTS5 driver the tool reports which runtime to use.

## Module: check-for-update

One cache file, one hook. The module probes the C4F repos and appends a single advisory block to the
next admitted prompt, so the model learns about an outdated config through the conversation. The
system prompt is never rewritten and there is no UI notification.

The probe runs once at setup and never blocks startup:

- Probes both C4F repos with `git fetch` + ahead/behind (4 s timeout each, in parallel).
- Resolves the upstream from `@{u}` and fetches that remote, so remotes other than `origin` are supported. When a branch has no upstream set (for example after `git init` + `git pull`), it falls back to `origin/<branch>` if that ref exists.
- Caches the result in `~/.cache/opencode/c4f-update-state.json` for 30 minutes, so repeated starts do not hit the network.
- Aligns the next refresh with `checkedAt + ttlMs`, so a warm cache refreshes when it expires instead of one full TTL after startup.
- Keeps the last known state for each repo when `git fetch` fails (offline or timeout), and marks it `offline`.
- Writes the cache atomically (temp file + rename), so a concurrent read never sees partial JSON.

`scripts/c4f_update.py install` drops the entries of the repos it cloned or pulled, so a repo that was
just updated is not announced as behind on the next start. A running server keeps its in-memory state
until it restarts.

The `prompt` hook (`ctx.session.hook('prompt', …)`) is the only channel:

- Runs at prompt admission, before attachment and skill resolution and durable inbox admission, so the edit becomes the canonical persisted user input.
- Appends a `<c4f-update-check>` block listing every repo that is `behind` or `not-installed`, including its last known count when the fetch was offline.
- Injects once per session per advisory signature (`repo:state:behind`), so the 30-minute refresh never repeats the block for the same counts.
- Clears the per-session memory when nothing is pending, so a later regression with the same counts notifies again.
- Skips prompts that already carry the marker, which keeps retries and concurrent admissions idempotent.
- Degrades to probe-only when the runtime does not expose `session.hook`.

Because the block is appended to the user's message, the user sees it in the transcript. It never runs
`git pull`, edits files or bypasses approval. After the user agrees, the agent loads the `c4f-update`
skill and runs `scripts/c4f_update.py install`.

There is no slash command: the user triggers an update by asking the agent in plain language (for
example "update my C4F config"). Child sessions are sessions too, so a subagent can receive one block;
the text tells the model not to act on its own.

| Option (`ctx.options.updateCheck`) | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Disable the whole check |
| `ttlMs` | `1800000` | Cache lifetime and background refresh interval |
| `fetchTimeoutMs` | `4000` | Per-repo git timeout |
| `repos` | the two C4F repos | Override the probe targets |
| `stateFile` | `~/.cache/opencode/c4f-update-state.json` | Cache location |

`C4F_UPDATE_CHECK=0` disables the check without touching configuration.

## Layout

```text
c4f-plugin/
├── index.js                          # Server part: Plugin.define({ id: 'c4f-plugin', setup })
├── src/
│   ├── setup.js                      # Sequential registry runner + lifecycle
│   └── modules/
│       ├── registry.js               # Ordered module registry
│       ├── code-retrieval/           # Native tool + Python indexer
│       │   ├── index.js              # run(ctx, options) + tool registration
│       │   ├── config.js             # Options, root/db/scripts resolution
│       │   ├── store.js              # Readonly FTS5 store (node:sqlite, bun:sqlite fallback)
│       │   ├── tokenize.js           # Tokenizer (mirrors the Python side)
│       │   ├── render.js             # Markdown output
│       │   ├── schema.js             # Tool name, description, input schema
│       │   └── scripts/              # Python indexer (config, index, parser, storage, tokenizer)
│       │       └── parsers/          # Một file cho mỗi định dạng (code AST, python, yaml, markdown, json, html, css, xml)
│       └── check-for-update/         # run(ctx, options) → probe + prompt advisory
│           ├── index.js              # Probe scheduler + prompt hook
│           ├── probe.js              # git probe + state file
│           └── warn.js               # Advisory block + signature
└── test/
```

## Module interface

Every directory under `src/modules/` is one module and exposes exactly one entry point:

```js
export async function run(ctx, options) {
  // ...
}
```

`run` may return a handle with `dispose()`; setup collects handles and disposes them in reverse order.
Modules run sequentially in `registry.js` declaration order, and each registry key is the module's
option namespace under `ctx.options` (for example `ctx.options.updateCheck`).

To add a feature:

1. Create `src/modules/<name>/index.js` with `export async function run(ctx, options)`.
2. Import it into `src/modules/registry.js` in the desired execution order.

## Installation

For a global installation, place this directory at `~/.config/opencode/plugins/c4f-plugin/`. For a
project-local installation, use `.opencode/plugins/c4f-plugin/`. OpenCode loads local plugin package
directories from these directories at startup.

## Development

```bash
npm test
npm run check
```

The indexer can also be used directly:

```bash
python3 src/modules/code-retrieval/scripts/index.py --root /path/to/repo
python3 src/modules/code-retrieval/scripts/index.py --root /path/to/repo --rebuild
```
