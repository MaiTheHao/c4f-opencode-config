---
name: opencode-model-routing
description: Use before delegating to a subagent. Pick the highest-rated model for each role from the routing table below.
---

# Model Routing

Use only these models. ★★★★★ = best, ★★★★ = good, ★★★ = ok, ★★ = weak, ★ = avoid.

| Role | opencode-go/mimo-v2.6-pro | opencode-go/deepseek-v4.1-flash | opencode-go/muse-spark-1.3-contributor | opencode-go/glm-5.3-flash | Pick |
|---|---:|---:|---:|---:|---|
| worker | ★★★★★ | ★★★★ | ★★★ | ★★★ | opencode-go/mimo-v2.6-pro |
| quick | ★★★★ | ★★★★★ | ★★★ | ★★★★ | opencode-go/deepseek-v4.1-flash |
| bulk | ★★★ | ★★★★★ | ★★ | ★★★★ | opencode-go/deepseek-v4.1-flash |
| analyzer | ★★★★★ | ★★★★ | ★★★★ | ★★★ | opencode-go/mimo-v2.6-pro |
| reviewer | ★★★★ | ★★★★ | ★★★★★ | ★★★ | opencode-go/muse-spark-1.3-contributor |
| scout | ★★ | ★★★★ | ★★★ | ★★★★★ | opencode-go/glm-5.3-flash |
| deep | ★★★ | ★★★★ | ★★★★★ | ★★★ | opencode-go/muse-spark-1.3-contributor |
| skeptic | ★★★ | ★★★★ | ★★★★★ | ★★★ | opencode-go/muse-spark-1.3-contributor |
| validation | ★★★★★ | ★★★★ | ★★★★ | ★★★ | opencode-go/mimo-v2.6-pro |
| quant | ★★★★ | ★★★★ | ★★★★ | ★★★ | opencode-go/deepseek-v4.1-flash |

## Model IDs and variants

- All models are on provider `opencode-go`. Full ID format: `providerID/modelID#variant`.
- `mimo-v2.6-pro`: no variants.
- `deepseek-v4.1-flash`: variants `low`, `high`, `max`.
- `muse-spark-1.3-contributor`: variants `minimal`, `low`, `medium`, `high`, `xhigh`.
- `glm-5.3-flash`: variants `low`, `high`, `max`.

## Rules

- Pick the highest stars for the role.
- `reviewer` MUST differ from the worker; use the next-best model.
- `skeptic` and `validation` SHOULD differ from the `deep` model they check.
- Ties: prefer faster tier (`fast > balanced > strong`), unless task complexity warrants otherwise.
- Variant hints: `worker`/`bulk` → `#max`; `quick`/`scout` → `#low`; `deep`/`skeptic`/`reviewer` → Muse `#xhigh` or `#high`.
- These are heuristic priors; `muse`'s deep/skeptic preference is confirmed by real runs. Update as more runs provide evidence.
