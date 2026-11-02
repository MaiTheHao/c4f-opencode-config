# C4F Model Policy

Enforces a model allowlist for this OpenCode installation and exposes a read-only query tool.

## Enforcement layers

| Layer | Hook | Effect |
|---|---|---|
| L1 | `ctx.model.transform` | Removes models the active policy does not permit from the registry. |
| L2 | `session.hook('model.request')` | Interrupts a request pinned to a denied model. Disabled by `runtime.gate = "off"`. |
| Tool | `allowed_models` | Returns the enforced snapshot as Markdown tables. It never re-reads the config file. |

All three read the same snapshot. When no snapshot can be loaded, L1/L2 follow `runtime.onSnapshotFailure`.

## Configuration

| File | Role | Versioned |
|---|---|---|
| `allowed_models.json` | Shipped policy. | Yes |
| `allowed_models.override.json` | Optional user override. Replaces the shipped file entirely. | No |

The override is tried first. If it is absent, unreadable, or invalid, the shipped file is used and `overrideError` records the reason. See [docs/configuration.md](docs/configuration.md) for the schema.

Minimal override:

```json
{
  "filteredProviders": ["opencode-go", "opencode"],
  "authorized": ["muse-spark-1.3-contributor"],
  "banned": ["mimo-v2.5"]
}
```

The override is a whole-file replacement. The shipped `banned` list is **not** inherited; repeat every key you need.

## Documentation

| Document | Contents |
|---|---|
| [docs/configuration.md](docs/configuration.md) | Full schema, verdict precedence, failure behavior, examples. |
| [docs/operations.md](docs/operations.md) | Refresh lifecycle, verification commands, troubleshooting, revert. |
| [docs/tool.md](docs/tool.md) | `allowed_models` actions, inputs, columns, and status values. |

## Tests

```bash
node --test test/*.test.mjs
```
