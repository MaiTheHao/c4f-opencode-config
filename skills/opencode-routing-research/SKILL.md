---
name: opencode-routing-research
description: Model routing and lane-based subagent reuse for the RESEARCH agent team (recon, deep dives, timelines, quantitative audits, skeptic and validation review). Use whenever dispatching or selecting LLM profiles for read-only research work that never edits project files.
---

# Model Routing: Research Team

Researchers are read-only: they never edit or create project files. Findings return in the message; any persistence is the orchestrator's job.

## 0. Dispatch Protocol (mandatory, every dispatch)

RESUME BY DEFAULT. Spawn only when §0.3 forces it. Never justify resume/spawn by cache, cost, or token estimates (unobservable).

**0.1 Batch first.** laneKey = `model#variant` (single provider, so omitted). Group pending tasks by laneKey. Tasks on the same sub-question or that build on each other → ONE dispatch with a numbered checklist. Worker returns per-claim evidence (source + supporting detail), not a bare conclusion.

**0.2 Lane registry** (keep in working notes): `laneKey | sessionID | dispatches | fails | sub-questions`. Pick in order:
1. Idle lane, same laneKey, task continues/deepens/corrects its own sub-question → RESUME.
2. Idle lane, same laneKey, new sub-question independent of any busy lane → RESUME; if none idle, spawn a parallel lane (max 3 per laneKey).
3. No match → spawn and register.

Role change alone never forces respawn when laneKey matches. Free-tier (§3): lanes only among verified free models.

**0.3 Forced respawn (only these).**
- model or variant changes
- role is `review-skeptic` or `review-validation` (fresh session per audit, since a resumed session is biased by earlier findings)
- lane dispatches ≥ 6 (context-bloat proxy)
- lane fails ≥ 2 on the same task (retire; brief the new lane with the failure evidence)

**0.4 Message shape.** First message to a lane: short stable preamble (scope, output format, citation rules). Follow-ups: delta only (question, scope, required evidence). Never resend the preamble.

**0.5 Verify-before-trust.** Every task states what evidence closes it (source, figure, cross-reference). A conclusion without sources or supporting detail = FAIL. Load-bearing numbers or quotes get re-checked against the source, not the worker's summary. On fail, fix in the SAME lane first.

## 1. Roles

| Role | Task | Trigger |
|---|---|---|
| `research-scout` | Broad recon, low rigor | first-pass scoping |
| `research-deep` | One sub-question, high rigor | "dig into X" |
| `research-timeline` | Historical/temporal evolution | timeline, progression |
| `analysis-quant` | Numbers/benchmark audit | "how much", "audit methodology" |
| `review-skeptic` | Adversarial claim-challenge | "find flaws" |
| `review-validation` | Cross-check for contradictions | "do these agree" |
| `general-quick` | Low-latency small task | classify, summarize |

Legacy aliases (old → new): `quant`→`analysis-quant`, `skeptic`→`review-skeptic`, `validation`→`review-validation`, `timeline`→`research-timeline`, `quick`→`general-quick`. (`research-scout`, `research-deep` unchanged.)

## 2. Tiers, Roster, Routing

| Tier | Fit |
|---|---|
| **T-fast** | Low-rigor recon, small tasks |
| **T-core** | Default workhorse; has `low/high/max` effort knob |
| **T-deep** | High-rigor single-question reasoning; strongest effort scaling |
| **T-cross** | Different family from whatever produced the finding; factual reliability weighs most |

| Model | Tier | Slot | Variants | Notes |
|---|---|---|---|---|
| `glm-5.3-flash` | T-fast | primary | `low`, `high` | Strongest factual reliability in roster |
| `deepseek-v4.1-flash` | T-core | primary (sole) | `low`, `high`, `max` | `max` only for `analysis-quant` at `quality`; never `low` for quant/deep research. Price doubles Mon–Fri 01:00–04:00 & 06:00–10:00 UTC; defer heavy batches |
| `muse-spark-1.3-contributor` | T-deep | primary (sole) | `medium`, `xhigh` | No `max`. Not zero-data-retention: no proprietary/sensitive material without sign-off |
| `mimo-v2.6-flash` | T-cross | primary | none (by ID) | — |
| `qwen3.8-flash` | T-cross | secondary | `low`, `medium` | Second independent family for validation |

All IDs are prefixed `opencode-go/` in payloads (§3 mandate). Update only this table when the lineup changes.

**Substitution.** Replace an unavailable model with one matching the same tier characteristics, not the cheapest. T-cross members stay different families from T-core/T-deep and from each other. Free/preview models never enter this table.

**Multi-slot dispatch** (e.g. `research-scout` fanned out over several sub-questions): round-robin across the tier's members. Single-slot dispatch uses the tier's primary. **Independent-consensus roles** (`review-skeptic`, `review-validation`): MUST use two different members, never the same model twice.

| Role | `cheap` (default) | `quality` | `ExcludeIfUsedByRole` |
|---|---|---|---|
| `research-scout` | T-fast · low | T-core · high | — |
| `research-deep` | T-deep · medium | T-deep · xhigh | — |
| `research-timeline` | T-fast · low | T-core · high | — |
| `analysis-quant` | T-core · high | T-core · max | — |
| `review-skeptic` | T-core · high | T-deep · xhigh (public data only) else T-cross | `research-deep` |
| `review-validation` | T-cross | T-cross | `research-deep` |
| `general-quick` | T-fast · low | T-fast · high | — |

Resolve tier → concrete `model#variant`; that is the laneKey for §0. Default `cheap`. Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade".

## 3. Free-Tier Mode (overrides §2 routing entirely)

If you are running on a FREE model:
- **Inventory:** list all active FREE models from the runtime/provider catalog before delegating.
- **Strict free:** NEVER dispatch or escalate to paid models. Use whatever free models exist, regardless of tiering.
- **Allocation:** map free models to tiers by observed capability. T-core/T-deep-like → `research-deep`, `analysis-quant`, `review-skeptic`, `review-validation` (reviewers must be a different model from the producer when 2+ free models exist). T-fast-like → `research-scout`, `research-timeline`, `general-quick`.
- **Cost guard:** if an essential tier has no free model, STOP and report `BLOCKED` with the missing tier.

> **Provider Prefix Mandate:** every dispatch/resume payload MUST format `model` as `providerID/modelID` or `providerID/modelID#variant` (e.g. `opencode-go/deepseek-v4.1-flash#low`). Omitting the prefix causes `Invalid model...` errors.