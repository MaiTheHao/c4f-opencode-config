# c4f-plugin

OpenCode plugin for C4F repository hygiene. Features live under `src/modules/`; each module is
independent and is registered in `src/modules/registry.js`.

| Module | Purpose |
| --- | --- |
| `codeRetrieval` | Native `code_retrieval` tool: Tree-sitter AST + BM25 code/docs search |
| `updateCheck` | Background probe of both C4F config repos, surfaced as a TUI toast |

## Module: code-retrieval

Registers one Code Mode tool, `code_retrieval`, backed by the Python indexer in
`src/modules/code-retrieval/scripts/` (the scripts ship with the plugin — there is no separate skill).

| Action | Purpose |
| --- | --- |
| `search` (default) | Ranked code chunks for a symbol name or technical keyword. |
| `index` | Build/refresh the index. This is the "init retrieval" step the user must request. |

Arguments: `query` (required for search), `top_k` (1–50, default 5), `root` (defaults to the session
directory), `sync` (refresh before search; defaults to true only when the index already exists).

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

The startup warm-up is the exception: it warms the location known at setup. After a workspace switch
the first search refreshes the new workspace itself (`--sync`), so results are still current; only the
pre-warm is skipped.

### Opt-in flag: the database file

The tool does not maintain its own sync flag. The **index database is the flag**:

- `<root>/local/agents/retrieval/code_bm25.db` missing → `search` returns `NOT_INITIALIZED` and no
  Python process is spawned. A session that never touches code never pays for a repository scan.
- Database present (created by an explicit `action=index`) → `search` refreshes it incrementally
  first.
- `C4F_RETRIEVAL_DB` / `codeRetrieval.db` relocate the database if needed.

`local/` is gitignored in the target repos, so initialization is per checkout and per worktree.

### Incremental vocabulary rebuilds

The postings and BM25 vocabulary share one transaction. The vocabulary is rebuilt when indexing
changes postings or when its saved state is missing/unknown. An unchanged sync reuses the existing
vocabulary. To repair a hand-edited database, run
`python3 src/modules/code-retrieval/scripts/index.py index --root <root> --rebuild`.
The index remains under the gitignored `local/agents/retrieval/` directory.

On an unchanged synthetic tree of 3,000 files (13.6 MB), a no-op sync measured 0.18–0.24 s end to
end across repeated runs (interpreter startup and imports included) and 0.11 s for the scan itself.
A ~90-file repository resyncs in ~0.09 s end to end. A no-op sync neither rewrites postings nor
rebuilds the vocabulary, and it never imports the Tree-sitter grammars.

### Startup warm-up

`autoSync` (default `true`) refreshes initialized repositories once in the background after setup,
capped by `warmupTimeoutMs` (default 5 s). It never blocks startup and never runs for repositories
without a database. `C4F_RETRIEVAL_AUTOSYNC=0` disables it, `C4F_RETRIEVAL_TOOL=0` disables the tool.

| Option (`ctx.options.codeRetrieval`) | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Register the tool at all |
| `autoSync` | `true` | Background refresh for initialized repos |
| `timeoutMs` | `120000` | Per tool call timeout |
| `warmupTimeoutMs` | `5000` | Startup warm-up timeout |
| `python` | `python3` | Interpreter (falls back to `python`) |
| `scriptsDir` | `<module>/scripts` | Python indexer location |
| `root` | session directory | Default project root |
| `db` | `<root>/local/agents/retrieval/code_bm25.db` | Explicit database file |
| `codemode` | `true` | Code Mode tool; `false` exposes a first-class tool |

Failures are returned as tool content, never thrown: a search sync timeout retries against the
existing index and labels the hits `index not refreshed: sync timed out`. Other timeout and failure
cases keep the error output; missing interpreter, non-zero exit, invalid JSON and missing `tree-sitter`
modules carry the command that fixes them.

## Module: check-for-update

Two parts, one cache file. The server module only probes and writes state; the TUI part only reads it.
Nothing here reaches the model unless the user asks for an update.

The server module runs once at setup and never blocks startup:

- Probes both C4F repos with `git fetch` + ahead/behind (4 s timeout each, in parallel).
- Resolves the upstream from `@{u}` and fetches that remote, so remotes other than `origin` are supported. When a branch has no upstream set (for example after `git init` + `git pull`), it falls back to `origin/<branch>` if that ref exists.
- Caches the result in `~/.cache/opencode/c4f-update-state.json` for 30 minutes, so repeated starts do not hit the network.
- Aligns the next refresh with `checkedAt + ttlMs`, so a warm cache refreshes when it expires instead of one full TTL after startup.
- Keeps the last known state for each repo when `git fetch` fails (offline or timeout), and marks it `offline`.
- Writes the cache atomically (temp file + rename), so a concurrent read never sees partial JSON.
- `index.js` returns `{ state, refresh, dispose }` and no hook registrations: there is no system-prompt injection and no synthetic banner, so a behind repo costs zero tokens.

The TUI part (`tui.js`) is what the user sees:

- Reads the cache every `pollMs` (default 60 s) and shows one toast per distinct advisory state (`repo:state:behind`), so the 30-minute refresh never re-toasts for the same counts.
- Registers the `/c4f-update` slash command. It prompts the running session to load the `c4f-update` skill, so the model learns about the update only when the user runs the command.
- Passes the current session to the toast, so it can offer to open that session when its family is not focused.
- Needs a TUI: a headless server or `opencode run` still writes the cache, but shows nothing.

It never runs `git pull`, edits files or bypasses approval. After the user agrees, the agent loads the `c4f-update` skill and runs `scripts/c4f_update.py install`.

| Option (`ctx.options.updateCheck`) | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Disable the whole check (server probe and TUI part) |
| `ttlMs` | `1800000` | Cache lifetime and background refresh interval |
| `fetchTimeoutMs` | `4000` | Per-repo git timeout |
| `repos` | the two C4F repos | Override the probe targets |
| `stateFile` | `~/.cache/opencode/c4f-update-state.json` | Cache location shared with the TUI part |
| `pollMs` | `60000` | TUI-only: how often the toast reads the cache |

`C4F_UPDATE_CHECK=0` disables the check without touching configuration.

## Layout

```text
c4f-plugin/
├── index.js                          # Server part: Plugin.define({ id: 'c4f-plugin', setup })
├── tui.js                            # TUI part: toast + /c4f-update command
├── src/
│   ├── setup.js                      # Sequential registry runner + lifecycle
│   └── modules/
│       ├── registry.js               # Ordered module registry
│       ├── code-retrieval/           # Native tool + Python indexer
│       │   ├── index.js              # run(ctx, options) + tool registration
│       │   ├── config.js             # Options, root/db/scripts resolution
│       │   ├── python.js             # Spawn wrapper (timeout, abort, fallback)
│       │   ├── render.js             # Markdown output
│       │   ├── schema.js             # Tool name, description, input schema
│       │   └── scripts/              # Python indexer (config, index, parser, searcher, storage, tokenizer)
│       │       └── parsers/          # Một file cho mỗi định dạng (code AST, python, yaml, markdown, json, html, css, xml)
│       └── check-for-update/         # run(ctx, options) → probe + cache
│           ├── index.js              # Probe scheduler (no model hooks)
│           ├── probe.js              # git probe + state file
│           ├── warn.js               # Toast text
│           └── notify.js             # Toast/session helpers shared with tui.js
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

## TUI part

`tui.js` is a second entrypoint in the same package. OpenCode resolves the `tui` subpath beside the
server entrypoint when the plugin directory is discovered (`<global-config>/plugins/c4f-plugin/tui.js`),
so no extra registration is needed:

```js
import { Plugin } from '@opencode/plugin/tui';

export default Plugin.define({
  id: 'c4f-plugin.tui',
  setup(context) {
    context.ui.toast.show({ message: 'Ready', variant: 'success' });
  },
});
```

Only the TUI part can show a toast (`context.ui.toast.show`) or a desktop notification
(`context.ui.attention.notify`). The server part has no UI API — its only user-facing channels are
session messages and the model context, which is why `check-for-update` uses neither. The TUI part reads
the same cache file and shows the toast, and the toast text points at `/c4f-update`; the model is only
involved when the user runs that command.

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
python3 src/modules/code-retrieval/scripts/index.py index --root /path/to/repo
python3 src/modules/code-retrieval/scripts/index.py search "jwt validate" --root /path/to/repo --top-k 5
```
