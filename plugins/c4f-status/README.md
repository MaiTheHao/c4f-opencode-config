# c4f-status

An independent OpenCode plugin for C4F repository status. Features live under `src/modules/`; today there is one.

## Module: check-for-update

The check runs once at setup and never blocks startup:

- Probes both C4F repos with `git fetch` + ahead/behind (4 s timeout each, in parallel).
- Resolves the upstream from `@{u}` and fetches that remote, so remotes other than `origin` are supported.
- Caches the result in `~/.cache/opencode/c4f-update-state.json` for 30 minutes, so repeated starts do not hit the network.
- Aligns the next refresh with `checkedAt + ttlMs`, so a warm cache refreshes when it expires instead of one full TTL after startup.
- Keeps the last known state for each repo when `git fetch` fails (offline or timeout), and marks it `offline`.
- Writes the cache atomically (temp file + rename), so a concurrent read never sees partial JSON.
- While a repo is behind or missing, appends one `<c4f-update-check>` system part per request: the model tells the user once, in their language, and offers the update.
- Posts one synthetic banner per session, so the suggestion is visible in the transcript.
- Tells the model to load the `c4f-update` skill with the skill tool when the user accepts. Skill discovery is left entirely to the runtime.

It never runs `git pull`, edits files or bypasses approval. After the user agrees, the agent loads the `c4f-update` skill and runs `scripts/c4f_update.py install`.

| Option (`ctx.options.updateCheck`) | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Disable the whole check |
| `ttlMs` | `1800000` | Cache lifetime and background refresh interval |
| `fetchTimeoutMs` | `4000` | Per-repo git timeout |
| `banner` | `true` | Synthetic session banner |
| `repos` | the two C4F repos | Override the probe targets |

`C4F_UPDATE_CHECK=0` disables the check without touching configuration.

## Layout

```text
c4f-status/
├── index.js                    # Plugin.define({ id: 'c4f-status', setup })
├── src/
│   ├── setup.js                # Sequential registry runner + lifecycle
│   └── modules/
│       ├── registry.js         # Ordered module registry
│       └── check-for-update/   # run(ctx, options)
└── test/
```

## Module interface

Every directory under `src/modules/` is one module and exposes exactly one entry point:

```js
export async function run(ctx, options) {
  // ...
}
```

`run` may return a handle with `dispose()`; setup collects handles and disposes them in reverse order. Modules run sequentially in `registry.js` declaration order, and each registry key is the module's option namespace under `ctx.options` (for example `ctx.options.updateCheck`).

To add a feature:

1. Create `src/modules/<name>/index.js` with `export async function run(ctx, options)`.
2. Import it into `src/modules/registry.js` in the desired execution order.

## Installation

For a global installation, place this directory at `~/.config/opencode/plugins/c4f-status/`. For a project-local installation, use `.opencode/plugins/c4f-status/`. OpenCode loads local plugin package directories from these directories at startup.

## Development

```bash
npm test
npm run check
```
