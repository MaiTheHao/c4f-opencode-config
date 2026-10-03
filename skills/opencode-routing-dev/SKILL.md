---
name: opencode-routing-dev
description: Model routing and maximal subagent session reuse (resume) for the DEV agent team (analyze code, write/edit code, tests, refactor, code review). Use whenever dispatching or selecting LLM profiles for tasks that read or modify project files. Not for file-free research.
---

# Model Routing + Lane Reuse: Dev Team

Core principle: **RESUME FIRST, SPAWN LAST.** Every dispatch reuses an existing session whenever allowed. A new session is the exception, never the default. (Task content/workflow is handled by other instructions; this skill only decides *which model* and *which session*.)

## 1. Model Roster

All IDs are sent with prefix `opencode-go/` (e.g. `opencode-go/deepseek-v4.1-flash#high`). Omitting the prefix causes `Invalid model...` errors.

| Model | Tier | Slot | Variants | Best for | Restrictions / Notes |
|---|---|---|---|---|---|
| `glm-5.3-flash` | T-fast | primary | `low`, `high` | Mechanical, low-ambiguity edits; applying decided steps; quick tasks | Strongest factual reliability in roster |
| `gpt-6-luna` | T-fast | **restricted** | `none`, `low` | Trivial edits on one small file | Only when ALL: no reasoning needed, single/small file, short context. Never `high`+ |
| `deepseek-v4.1-flash` | T-core | primary (sole) | `low`, `high`, `max` | Default workhorse: implement, refactor, tests, root-cause analysis | `max` only for `analysis-root-cause` at `quality`. Never `low` for root-cause. Price doubles Mon–Fri 01:00–04:00 & 06:00–10:00 UTC → defer heavy batches |
| `mimo-v2.6-flash` | T-cross | primary | none (by ID) | Independent review of code from another family | Used for `review-quality` at `quality`; must stay a different family from T-core |

Tiers: **T-fast** mechanical · **T-core** default workhorse (`low/high/max`) · **T-cross** different family from the code's producer.

## 2. Role → Model (default `cheap`)

| Role | `cheap` (default) | `quality` |
|---|---|---|
| `code-implement` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#high` |
| `code-apply-step` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#low` |
| `code-bulk-edit` | `glm-5.3-flash#low` | `glm-5.3-flash#high` |
| `code-refactor` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `code-test` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `analysis-root-cause` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `review-quality` | `deepseek-v4.1-flash#high` | `mimo-v2.6-flash` |
| `general-quick` | `glm-5.3-flash#low` | `glm-5.3-flash#high` |

Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade".
Legacy aliases: `code`→`code-implement`, `code-cheap`→`code-apply-step`, `bulk-edit`→`code-bulk-edit`, `refactor`→`code-refactor`, `test`→`code-test`, `analyze`→`analysis-root-cause`, `review`→`review-quality`, `quick`→`general-quick`.
Unavailable model → substitute same tier traits (T-cross stays a different family; free/preview models never enter the table).

## 3. Resume / Reuse Rules

**laneKey = `model#variant`.** Role is NOT part of it: any role resolving to the same laneKey shares sessions (e.g. `analysis-root-cause` and `code-implement@quality` both use `deepseek-v4.1-flash#high` → same pool).

Keep a registry in working notes: `laneKey | sessionID | dispatches | fails`. Pick a session in this order, stop at first match:

1. **Continue:** idle session, same laneKey, task continues/fixes/extends its work → RESUME.
2. **Reuse:** idle session, same laneKey, unrelated task → RESUME (always fine for read-only tasks; for edits, files must not overlap a busy lane).
3. **Tier-up reuse:** no idle session of the exact laneKey, but an idle session of a *stronger* allowed laneKey exists for this role (e.g. `deepseek-v4.1-flash#high` for a `deepseek-v4.1-flash#low` task) → RESUME it. Never reuse a weaker one. Respect §1 restrictions (never `low` for root-cause, `max` only for analysis at `quality`, never promote `gpt-6-luna`).
4. **Parallel:** no idle session at all, <3 sessions for this laneKey → spawn one more. At 3 busy → wait and RESUME the first that frees up; never exceed 3.
5. **First of its kind:** no session for this laneKey exists → spawn and register.

Reuse habits:
- **Waves:** after a parallel wave, the next wave resumes the same sessions; do not spawn fresh ones.
- **Batch:** tasks of the same laneKey that are dependent or share files go into ONE dispatch as a numbered checklist.
- **Fixes:** a failed or incomplete task is fixed in the SAME session first.
- **Messages:** full preamble only on a session's first message; afterwards send only the delta (task, files, acceptance command).

**Forced respawn: ONLY these.**
- model or variant must change (different laneKey)
- `review-quality` at `quality` tier (fresh session per audit)
- session reached ≥ 6 dispatches (retire, spawn replacement)
- session failed ≥ 2 times on the same task (retire, brief new one with the failure evidence)

Never spawn "for a clean context", and never choose resume/spawn based on cost, cache or token estimates.

## 4. Free-Tier Mode (overrides §2)

If running on a FREE model: list active free models, never dispatch to paid ones, map them to tiers by capability, apply §3 over free models only. If an essential tier has no free model, STOP and report `BLOCKED` with the missing tier.