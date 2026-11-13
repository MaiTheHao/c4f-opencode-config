# model-insights

An independent, read-only OpenCode plugin that exposes live model availability, pricing, runtime variants, and curated task-fit metadata for agents.

## Responsibilities

`model-insights` reads the current model registry through `ctx.model.list()` and enriches each available runtime model with optional local metadata.

- No model-list transform, filtering hook, request gate, or availability mutation.
- No dependency on `c4f-model-policy`.
- `triggers` describe the task types for which an agent should consider a model. They are advisory metadata; the plugin does not make the routing decision.
- Pricing classification and variants are read from Runtime data.
- Availability is refreshed before every tool invocation. Records with `enabled: false` are excluded from all insight results.
- If a live refresh fails, last-known model data is withheld. A stale catalog must not be presented as a currently available choice.

## Tool: `model_insights`

| Action | Purpose |
| --- | --- |
| `list` | List currently available models with cost tier, task triggers, and variants. |
| `inspect` | Inspect one available model and its agent-selection metadata. |
| `pricing` | List runtime pricing and FREE/PAID/UNPRICED classification. |
| `variants` | List variants returned by Runtime for one available model. |

Arguments:

- `action`: `list` (default), `inspect`, `pricing`, `variants`.
- `model`: required for `inspect` and `variants`.
- `provider`: optional provider filter or model disambiguator.
- `paid_type`: `CONFIGURED` (default, only models declared in local metadata), `ALL`, `PAID`, `FREE`, `UNPRICED`; applies to `list` and `pricing`. `ALL` and `FREE` widen the scope to every runtime model; `PAID` and `UNPRICED` filter by classification within the configured set, so they can hide paid runtime models that metadata does not declare.
- `trigger`: optional exact trigger tag filter, for example `architecture`, `bulk-edit`, or `tests`.
- `limit`: 1–500, default 100.

## Metadata configuration

The default file is `model_insights.json`. It stores human-curated metadata that helps an agent choose an appropriate model. Each model record must contain a `triggers` array of strings. `costTier` is optional and descriptive; it is not an availability or eligibility rule.

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "deepseek-v4.1-flash",
      "costTier": 2,
      "triggers": [
        "complex-bug",
        "root-cause-analysis",
        "architecture",
        "deep-research",
        "refactor",
        "security"
      ]
    }
  ]
}
```

Supported model metadata fields are:

- `id`: OpenCode model ID.
- `providerID`: optional provider scope. When omitted, the metadata applies to that model ID across providers. A provider-specific entry takes precedence over a generic entry.
- `costTier`: optional positive integer used as descriptive cost ranking.
- `triggers`: required array of non-empty strings. Values are trimmed, lowercased, and spaces become hyphens. Duplicate trigger values are rejected. Model and provider IDs retain their case because OpenCode treats catalog selectors as case-sensitive.

Unknown fields are rejected. Policy/filter fields such as allowlists, denylists, provider scopes, or decisions are not part of this schema. Runtime pricing, `enabled`, and variants must not be copied into metadata JSON.

### Override file

Create `model_insights.override.json` beside the plugin entrypoint. A ready-to-copy example is included as `model_insights.override.example.json`.

```bash
cp model_insights.override.example.json model_insights.override.json
```

A valid override **replaces the entire metadata catalog** from `model_insights.json`; it is not a partial merge. This makes the effective configuration deterministic. Add every model record you want to retain to the override file. When the override file is absent, the default file is used. When the override exists but is invalid, the default file is used and the tool reports an override diagnostic.

Because metadata is loaded again during each refresh, changes to the override file take effect on the next `model_insights` tool invocation without restarting OpenCode.

## Runtime availability and freshness

OpenCode V2's `ctx.model.list()` returns the model catalog for the current location. The plugin refreshes that registry before each tool action, then only exposes records marked `enabled: true`; disabled or status-unknown records are excluded. Models not present in the active runtime catalog are not returned.

A background refresh also runs every 60 seconds. Concurrent refresh calls are coalesced and snapshot replacement is atomic. If a live refresh fails after a previous success, the internal last-known snapshot is marked `STALE`, but it is not returned as selectable model data. The tool reports `STALE` instead. With no successful read, it reports `UNAVAILABLE`.

Metadata file errors do not disable Runtime discovery; models are still listed with empty triggers and no cost tier, with a diagnostic warning.

## Installation

For a global installation, place this directory at `~/.config/opencode/plugins/model-insights/`. For a project-local installation, use `.opencode/plugins/model-insights/`. OpenCode loads local plugin files from these directories at startup.

Plugin options are read from `ctx.options`; `configFile` and `overrideFile` can be supplied for custom metadata paths. Without custom paths, both default files are resolved beside the plugin.

## Development

```bash
npm test
npm run check
```
