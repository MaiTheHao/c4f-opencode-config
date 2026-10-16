---
name: oc-routing-research
description: Model routing and maximal subagent session reuse (resume) for the RESEARCH agent team (recon, deep dives, timelines, quantitative audits, skeptic and validation review). Use whenever dispatching or selecting LLM profiles for read-only research work that never edits project files.
---

# Model Routing + Lane Reuse: Research Team

Researchers are read-only: they never edit or create project files; findings return in the message.

Core principle: **RESUME FIRST, SPAWN LAST.** Every dispatch reuses an existing session whenever allowed. A new session is the exception, never the default. (Research method and evidence standards are handled by other instructions; this skill only decides *which model* and *which session*.)

The same routing applies on Go and Go Plus: token prices match, and Go Plus only raises per-model monthly limits (each model's limit is its own allowance, not a shared pool).

## 1. Model Roster

All IDs are sent with prefix `opencode-go/` (e.g. `opencode-go/deepseek-v4.1-flash#high`). Omitting the prefix causes `Invalid model...` errors.

| Model | Tier | Slot | Variants | Best for | Restrictions / Notes |
|---|---|---|---|---|---|
| `glm-5.3-flash` | T-fast | primary | `low`, `high` | Low-rigor recon, timelines, small tasks | Strongest factual reliability in roster |
| `deepseek-v4.1-flash` | T-core | primary (sole) | `low`, `high`, `max` | Default workhorse: scouting at quality, quant audits, skeptic review | `max` only for `analysis-quant` at `quality`. Never `low` for quant/deep research. Price doubles Mon–Fri 01:00–04:00 & 06:00–10:00 UTC → defer heavy batches |
| `muse-spark-1.3-contributor` | T-deep | primary (sole) | `medium`, `xhigh` | High-rigor single-question reasoning (`research-deep`); strongest effort scaling | No `max`. Region-limited availability, and Contributor terms permit training use of prompts/completions with non-zero retention → no proprietary, confidential, or sensitive material without explicit approval. This restriction applies to every research role, not only `research-deep` |
| `mimo-v2.6-flash` | T-cross | primary | none (by ID) | Standard independent cross-check / validation | Cheap input/output (`$0.14/$0.28` per 1M), no DeepSeek peak window, not used for training and zero-day retention. Must differ from T-core and T-deep, and from the other reviewer when two run |
| `qwen3.8-flash` | T-cross | secondary | `low`, `medium` | Second independent family for validation | Used when the two reviewers must be different models; must differ from the other T-cross member |

Tiers: **T-fast** low-rigor recon · **T-core** default workhorse (`low/high/max`) · **T-deep** high-rigor single question · **T-cross** different family from whatever produced the finding.

## 2. Role → Model (default `cheap`)

| Role | Use for | `cheap` (default) | `quality` |
|---|---|---|---|
| `research-scout` | broad recon, first-pass scoping | `glm-5.3-flash#low` | `deepseek-v4.1-flash#high` |
| `research-deep` | one sub-question, high rigor | `muse-spark-1.3-contributor#medium` | `muse-spark-1.3-contributor#xhigh` |
| `research-timeline` | historical / temporal evolution | `glm-5.3-flash#low` | `deepseek-v4.1-flash#high` |
| `analysis-quant` | numbers / benchmark audit | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `review-skeptic` | adversarial claim-challenge | `deepseek-v4.1-flash#high` | `muse-spark-1.3-contributor#xhigh` (public data only) |
| `review-validation` | cross-check for contradictions | `mimo-v2.6-flash` | `mimo-v2.6-flash` |
| `general-quick` | classify, summarize | `glm-5.3-flash#low` | `glm-5.3-flash#high` |

The two reviewer roles (`review-skeptic`, `review-validation`) additionally obey the mandatory selection rules below.

### Mandatory reviewer selection rules

1. `review-skeptic` must not use the model that `research-deep` used for the same finding. If its default DeepSeek lane conflicts with the producer, use `mimo-v2.6-flash`. Use Muse at `quality` only for public data and only when the producer did not use Muse; otherwise use MiMo.
2. `review-skeptic` and `review-validation` must be different models if both run. If skeptic uses MiMo, move validation to `qwen3.8-flash#medium`; if validation uses MiMo, skeptic must use a compliant alternative such as DeepSeek or, where allowed, Muse.
3. When two reviewers are run, each reviewer must also differ from the producer's model family. If no allowed independent model remains, report the conflict instead of silently using the same model.
4. Muse availability is region-limited and its Contributor terms permit training use of prompts/completions. Apply this restriction to every research role, not only `research-deep`.

Other rules:
- Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade".
- Legacy aliases: `quant`→`analysis-quant`, `skeptic`→`review-skeptic`, `validation`→`review-validation`, `timeline`→`research-timeline`, `quick`→`general-quick`.
- Unavailable model → substitute same tier traits (T-cross stays a different family from T-core/T-deep and from each other; free/preview models never enter the table).
- Multi-slot fan-out (e.g. scouts over many sub-questions): round-robin across the tier's members.

## 3. Resume / Reuse Rules

**laneKey = `model#variant`.** Role is NOT part of it: any role resolving to the same laneKey shares sessions (e.g. `research-scout@quality` and `analysis-quant@cheap` both use `deepseek-v4.1-flash#high` → same pool).

Keep a registry in working notes: `laneKey | sessionID | dispatches | fails | sub-questions`. Pick a session in this order, stop at first match:

1. **Continue:** idle session, same laneKey, task continues/deepens/corrects its own sub-question → RESUME.
2. **Reuse:** idle session, same laneKey, new sub-question → RESUME (researchers are read-only, so there is no file conflict).
3. **Tier-up reuse:** no idle session of the exact laneKey, but an idle session of a *stronger* allowed laneKey for this role exists → RESUME it. Never reuse a weaker one. Respect §1 restrictions (never `low` for quant/deep, `max` only for quant at `quality`, no Muse for proprietary/sensitive data, never reuse a session that breaks the reviewer selection rules in §2).
4. **Parallel:** no idle session at all, <3 sessions for this laneKey → spawn one more. At 3 busy → wait and RESUME the first that frees up; never exceed 3.
5. **First of its kind:** no session for this laneKey exists → spawn and register.

Reuse habits:
- **Waves:** after a parallel wave, the next wave resumes the same sessions; do not spawn fresh ones.
- **Batch:** tasks of the same laneKey on the same sub-question or that build on each other go into ONE dispatch as a numbered checklist.
- **Fixes:** an incomplete or rejected finding is corrected in the SAME session first.
- **Messages:** full preamble only on a session's first message; afterwards send only the delta (question, scope, required evidence).

**Forced respawn: ONLY these.**
- model or variant must change (different laneKey)
- role is `review-skeptic` or `review-validation` (fresh session per audit, so earlier findings do not bias it)
- session reached ≥ 6 dispatches (retire, spawn replacement)
- session failed ≥ 2 times on the same task (retire, brief new one with the failure evidence)

Never spawn "for a clean context" outside the reviewer rule, and never choose resume/spawn based on cost, cache or token estimates.

## 4. Free-Tier Mode (overrides §2)

If running on a FREE model: list active free models, never dispatch to paid ones, map them to tiers by capability (T-core/T-deep-like → deep, quant, skeptic, validation; T-fast-like → scout, timeline, quick). Reviewers must be a different model from the producer when 2+ free models exist. Apply §3 over free models only. If an essential tier has no free model, STOP and report `BLOCKED` with the missing tier.
