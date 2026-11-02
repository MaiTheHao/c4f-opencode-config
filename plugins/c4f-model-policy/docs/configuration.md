# Configuration

The policy is one JSON file. The plugin validates the whole file before using it.

## File resolution

| Override file | Result | `configSource` | `overrideError` |
|---|---|---|---|
| absent | Shipped `allowed_models.json` is used. | `default` | Read error (usually `ENOENT`). |
| present and valid | Used in full. No merge with the shipped file. | `override` | `null` |
| present but unreadable, unparsable, or invalid | Discarded. Shipped file is used. | `default` | Validation reason. |

Tests and embedding code can bypass the cascade by passing an explicit file: `loadSnapshot({ file })` reads exactly that file and reports `configSource: "default"`.

## Top-level schema

| Key | Required | Type | Default | Description |
|---|---|---|---|---|
| `schemaVersion` | No | number | — | Must be `1` when present. Omit to skip the version check. |
| `filteredProviders` | Yes | string[] (non-empty) | — | Provider IDs subject to this policy. Normalized: trimmed and lowercased. |
| `authorized` | Yes | array (non-empty) | — | Base model IDs matched by the `AUTHORIZED` verdict. See [Authorized entries](#authorized-entries). |
| `banned` | No | string[] | `[]` | Base model IDs matched by the `BANNED` verdict. |
| `decision` | No | object | See [Decision](#decision) | Verdict precedence and the verdicts that pass. |
| `classification` | No | object | See [Classification](#classification) | How registry prices map to `FREE` / `PAID` / `UNPRICED`. |
| `runtime` | No | object | See [Runtime](#runtime) | Boot-only lifecycle knobs. |

### Authorized entries

| Form | Example | Notes |
|---|---|---|
| String | `"muse-spark-1.3-contributor"` | Stored as `{ "id": "<value>" }`. |
| Object | `{ "id": "longcat-2.0", "cost": 3, "trigger": ["terminal-workflow"] }` | `id` is required. Extra fields are preserved; `cost` and `trigger` feed the view. |

| Field | Type | Used for |
|---|---|---|
| `id` | string | Base model ID matched after normalization (provider prefix, `#variant`, and case are stripped). |
| `cost` | number | `Tier` column. Non-numeric values render as `-`. |
| `trigger` | string[] | `Trigger` column. Blank and non-string tags are dropped. |

## Decision

Verdicts are tested in `order`; the first match wins.

| Key | Required | Type | Default | Description |
|---|---|---|---|---|
| `order` | No | verdict[] | `["OUT_OF_SCOPE","BANNED","AUTHORIZED","FREE","DENIED"]` | No duplicates. Must end with `DENIED`. Tokens may be omitted. |
| `allowed` | No | verdict[] (non-empty) | `order` filtered to `["OUT_OF_SCOPE","AUTHORIZED","FREE"]` | Verdicts that pass enforcement. Must be a subset of `order` and must exclude `DENIED` and `BANNED`. |

| Token | Matches when | Passes by default |
|---|---|---|
| `OUT_OF_SCOPE` | Provider is not in `filteredProviders`. | Yes |
| `BANNED` | Base model ID is in `banned`. | No |
| `AUTHORIZED` | Base model ID is in `authorized`. | Yes |
| `FREE` | Registry pricing classifies the model as `FREE`. | Yes |
| `DENIED` | Catch-all. | No |

Important consequences:

- `filteredProviders` scopes the policy; it does not deny other providers. Out-of-scope providers pass by default. Remove `OUT_OF_SCOPE` from `allowed` to make the policy global.
- `decision.allowed` is independent of `order`. Narrowing it denies models that would otherwise match.
- A verdict omitted from `order` can never be returned.

## Classification

Classification reads the full registry `cost` array. A malformed entry, a missing `cache` object, or a non-finite/negative price yields `UNPRICED`.

| Key | Values | Default | Description |
|---|---|---|---|
| `free` | `all-zero`, `any-zero` | `all-zero` | `all-zero`: `FREE` only when every price axis is `0`. `any-zero`: `FREE` when at least one axis is `0`. |
| `invalidTier` | `unpriced`, `ignore` | `unpriced` | `unpriced`: reject entries whose `tier` is not `{ "type": "context", "size": <positive int> }`. `ignore`: skip the tier check. |

| Axis | Source |
|---|---|
| Input | `cost[].input` |
| Output | `cost[].output` |
| Cache read | `cost[].cache.read` |
| Cache write | `cost[].cache.write` |

The `Input` and `Output` columns show the first `cost` entry; classification uses all entries.

## Runtime

`runtime` is read once at boot. Changing it requires a restart.

| Key | Values | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` disables every hook and the `allowed_models` tool. |
| `gate` | `interrupt`, `off` | `interrupt` | `interrupt` enables the L2 request gate. `off` leaves L1 in place and disables L2. |
| `onSnapshotFailure` | `fail-closed`, `fail-open` | `fail-closed` | Behavior when no snapshot can be loaded: deny all, or allow all. |
| `refreshMs` | number | `60000` | Periodic reload interval. `0` disables the timer. Negative, `NaN`, and infinite values are clamped to `0`. A non-number is rejected. |

## Validation and failure behavior

| Condition | Result |
|---|---|
| Override absent | Shipped policy; `configSource: default`; `overrideError` explains the miss. |
| Override valid | Override applies in full; `configSource: override`. |
| Override invalid | Override discarded; shipped policy; `overrideError` holds the reason. |
| Data keys invalid during a refresh | The refresh fails; the snapshot becomes `null`; enforcement follows `onSnapshotFailure`. |
| `runtime` invalid | `loadRuntime` returns the shipped runtime, or `BOOTSTRAP_RUNTIME` if the shipped runtime is also invalid. |
| Registry listing fails | Config keys are still re-read and applied; pricing stays from the last successful listing. |
| No usable config and no override | Snapshot is `null`; `onSnapshotFailure` decides whether everything is denied or allowed. |

## Examples

Pin the schema and keep an explicit ban list:

```json
{
  "schemaVersion": 1,
  "filteredProviders": ["opencode-go"],
  "authorized": [{ "id": "deepseek-v4.1-flash", "cost": 2 }],
  "banned": ["qwen3.8-flash", "mimo-v2.5", "glm-5.3-flash"]
}
```

Make `BANNED` outrank `OUT_OF_SCOPE`, and deny out-of-scope providers:

```json
{
  "filteredProviders": ["opencode-go", "opencode"],
  "authorized": ["muse-spark-1.3-contributor"],
  "decision": {
    "order": ["BANNED", "OUT_OF_SCOPE", "AUTHORIZED", "FREE", "DENIED"],
    "allowed": ["AUTHORIZED", "FREE"]
  }
}
```

Treat a model as `FREE` when any price axis is `0`:

```json
{
  "filteredProviders": ["opencode-go", "opencode"],
  "authorized": ["muse-spark-1.3-contributor"],
  "classification": { "free": "any-zero", "invalidTier": "unpriced" }
}
```

Fail open and read the policy once an hour:

```json
{
  "filteredProviders": ["opencode-go", "opencode"],
  "authorized": ["muse-spark-1.3-contributor"],
  "runtime": { "gate": "off", "onSnapshotFailure": "fail-open", "refreshMs": 3600000 }
}
```

Disable the plugin without deleting anything:

```json
{
  "filteredProviders": ["opencode-go", "opencode"],
  "authorized": ["muse-spark-1.3-contributor"],
  "runtime": { "enabled": false }
}
```

Every example is a whole-file override. Repeat any key from the shipped policy you want to keep.
