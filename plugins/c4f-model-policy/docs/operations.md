# Operations

## Refresh lifecycle

| Data | Read at | Reload without restart |
|---|---|---|
| `runtime.enabled`, `runtime.gate`, `runtime.onSnapshotFailure`, `runtime.refreshMs` | Plugin setup (boot) | No |
| `schemaVersion`, `filteredProviders`, `authorized`, `banned`, `decision`, `classification` | Every refresh | Yes, within `refreshMs` |
| Registry pricing | Every refresh | Yes, within `refreshMs`; stays at the last successful listing if a listing fails |

The default interval is `60000` ms. `refreshMs: 0` disables the timer; changes then apply only after a restart.

## Verify the active policy

Run from `plugins/c4f-model-policy/`.

Active source and rejected-override reason:

```bash
node -e "import('./src/policy/allowlist.js').then(async m=>{const s=await m.loadSnapshot();console.log('source:',s.configSource);if(s.overrideError)console.log('override rejected:',s.overrideError)})"
```

Effective runtime:

```bash
node -e "import('./src/policy/allowlist.js').then(async m=>console.log(JSON.stringify(await m.loadRuntime(),null,2)))"
```

Live tool (reads the enforced snapshot, not the file):

```json
{ "action": "check", "model": "opencode-go/muse-spark-1.3-contributor" }
```

| Output | Meaning |
|---|---|
| `source: override` | The override is in force. |
| `source: default` with a reason | The override was absent or rejected; the shipped policy is in force. |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Policy is wider than expected | Override rejected, or absent | Check `configSource`; fix the JSON or validation error shown in `overrideError`. |
| Every model is denied | No snapshot and `onSnapshotFailure: "fail-closed"` | Fix the config file, or set `fail-open` temporarily. |
| Override edit has no effect | Interval has not elapsed, or `refreshMs` is `0` | Wait one interval, lower `refreshMs`, or restart. |
| `runtime` edit has no effect | `runtime` is boot-only | Restart the plugin. |
| `allowed`/`pricing` returns `PRICING_UNAVAILABLE` | Registry listing failed | Retry after the next refresh; inspect `pricingError` in the table message. |
| `check` returns `PROVIDER REQUIRED` | Model ID had no `provider/` prefix | Pass `provider/model`. |
| `check` returns `OUT OF SCOPE` for a model that should pass | Provider is not in `filteredProviders` | Add the provider, or keep `OUT_OF_SCOPE` in `decision.allowed`. |
| A zero-cost model is not `FREE` | `classification.free` is `all-zero` but some axis is non-zero | Use `any-zero`, or correct the registry price. |

## Revert

Delete `allowed_models.override.json`. The shipped policy applies on the next refresh. With `refreshMs: 0`, restart the plugin instead.

## Invariants

- The tool never re-reads the config file; it reports the snapshot L1/L2 enforce.
- A rejected override does not fail loudly; it silently falls back to the shipped policy.
- A failed registry listing never invalidates the config; it only leaves pricing stale.
