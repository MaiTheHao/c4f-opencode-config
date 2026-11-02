# `allowed_models` tool

Read-only view of the snapshot the plugin enforces. The tool never re-reads the config file and cannot widen enforcement.

- Namespace: `c4f-model-policy`
- Tool: `allowed_models`
- Output: exactly one Markdown table, no prose or captions. Empty cells render as `-`.

## Input

| Argument | Type | Default | Used by | Description |
|---|---|---|---|---|
| `action` | string | `allowed` | all | `allowed`, `pricing`, `banned`, or `check`. Case-insensitive. |
| `model` | string | `""` | `check` | `provider/model` to classify. A `#variant` suffix is ignored. |
| `model_paid_type` | string | `NONE` | `allowed`, `pricing` | `NONE` (keep all), `PAID`, or `FREE`. Case-insensitive. |

## Actions

| Action | Returns | Columns |
|---|---|---|
| `allowed` | Models the policy permits: authorized entries plus `FREE`-by-price models. | Model, Provider, Class, Input, Output, Tier, Variants, Trigger |
| `pricing` | Raw registry view, including `DENIED` and `BANNED` models. Debug surface only. | Model, Provider, Class, Input, Output |
| `banned` | Banned base IDs, sorted. | Model |
| `check` | Exactly one row classifying the requested model. | Model, Provider, Status, Class, Tier, Variants, Reason |

`allowed` with `model_paid_type` other than `NONE`, and `pricing` in every case, require loaded registry pricing. Otherwise they return a `PRICING_UNAVAILABLE` status table.

## `check` statuses

| Status | Meaning |
|---|---|
| `AUTHORIZED` | Base ID is in `authorized`. |
| `FREE` | Registry pricing classifies the model as `FREE` and the verdict passes. |
| `BANNED` | Base ID is in `banned`; never route to it. |
| `OUT OF SCOPE` | Provider is not in `filteredProviders`. |
| `DENIED` | No allowed verdict matched. |
| `PROVIDER REQUIRED` | Input had no `provider/` prefix. The row still reports authorized/banned membership in `Reason`. |

Degraded and error states use a two-column `| status | message |` table:

| Status | Meaning |
|---|---|
| `ERROR` | Invalid input, unknown action, or an unreadable policy view. |
| `DENIED` | Snapshot is `null` and `onSnapshotFailure` is `fail-closed`. |
| `FAIL-OPEN` | Snapshot is `null` and `onSnapshotFailure` is `fail-open`. |
| `PRICING_UNAVAILABLE` | Registry pricing is not loaded. |

## Notes

- `Class` is `FREE`, `PAID`, or `UNPRICED` from the registry `cost` array.
- `Tier` comes from the `cost` field of the matching `authorized` entry, not from registry pricing.
- `Variants` comes from registry pricing. A model missing from the latest listing loses its variant inventory.
- `model_paid_type` filters on `Class` only; it does not change enforcement.
