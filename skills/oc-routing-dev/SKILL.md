---
name: oc-routing-dev
description: Model routing and maximal subagent session reuse (resume) for the DEV agent team (analyze code, write/edit code, tests, refactor, code review). Use whenever dispatching or selecting LLM profiles for tasks that read or modify project files. Not for file-free research.
---

# Model Routing + Lane Reuse: Dev Team

Core principle: **RESUME FIRST, SPAWN LAST.** Every dispatch reuses an existing session whenever allowed. A new session is the exception, never the default. (Task content/workflow is handled by other instructions; this skill only decides *which model* and *which session*.)

The same routing applies on Go and Go Plus: token prices match, and Go Plus only raises per-model monthly limits (each model's limit is its own allowance, not a shared pool).

## 1. Model Roster

All IDs are sent with prefix `opencode-go/` (e.g. `opencode-go/deepseek-v4.1-flash#high`). Omitting the prefix causes `Invalid model...` errors.

| Model | Tier | Slot | Variants | Best for | Restrictions / Notes |
|---|---|---|---|---|---|
| `deepseek-v4.1-flash` | T-core | primary (sole) | `low`, `high`, `max` | Default workhorse: implement, refactor, tests, root-cause analysis; long coding-agent sessions with large, repeated cached context | `max` only for `analysis-root-cause` at `quality`. Never `low` for root-cause. Its cached-read rate is ~10× lower than GLM-5.3-Flash off-peak (`$0.003` vs `$0.03` per 1M), which is why it carries cached-heavy implementation work. Price doubles Mon–Fri 01:00–04:00 & 06:00–10:00 UTC → defer heavy batches |
| `glm-5.3-flash` | T-fast | primary | `low`, `high` | Short, mechanical, low-ambiguity edits; applying decided steps; quick tasks | Lower output rate suits mechanical work. For large context-heavy batches with repeated cached context, route as `code-refactor` (DeepSeek) instead |
| `mimo-v2.6-flash` | T-cross | primary | none (by ID) | Independent cross-family review | Standard reviewer: cheap input/output (`$0.14/$0.28` per 1M), no DeepSeek peak window, not used for training and zero-day retention. Must stay a different family from the code's producer (T-core) |

Tiers: **T-core** default workhorse (`low/high/max`) · **T-fast** mechanical · **T-cross** different family from the code's producer.

## 2. Role → Model (default `cheap`)

| Role | `cheap` (default) | `quality` | Note |
|---|---|---|---|
| `code-implement` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` | Default implementation workhorse; fits coding-agent sessions with large, repeated cached context |
| `code-apply-step` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#low` | Apply an already-decided step or a narrow, mechanical patch |
| `code-bulk-edit` | `glm-5.3-flash#low` | `glm-5.3-flash#high` | Mechanical edits at scale; huge cached-context batches route as `code-refactor` on DeepSeek |
| `code-refactor` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` | Refactor and restructure code |
| `code-test` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` | Write/update tests and diagnose test failures |
| `analysis-root-cause` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` | Difficult debugging; never `low`, `max` only at `quality` |
| `review-quality` | `mimo-v2.6-flash` | `mimo-v2.6-flash` | Independent cross-family review; keep separate from the producer's model family |
| `general-quick` | `glm-5.3-flash#low` | `glm-5.3-flash#high` | Classification, short summaries, small low-risk tasks |

Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade".
Legacy aliases: `code`→`code-implement`, `code-cheap`→`code-apply-step`, `bulk-edit`→`code-bulk-edit`, `refactor`→`code-refactor`, `test`→`code-test`, `analyze`→`analysis-root-cause`, `review`→`review-quality`, `quick`→`general-quick`.
Unavailable model → substitute same tier traits (T-cross stays a different family; free/preview models never enter the table).

## 3. Resume / Reuse Rules

**laneKey = `model#variant`.** Role is NOT part of it: any role resolving to the same laneKey shares sessions (e.g. `analysis-root-cause` and `code-implement@quality` both use `deepseek-v4.1-flash#high` → same pool).

Keep a registry in working notes: `laneKey | sessionID | dispatches | fails`. Pick a session in this order, stop at first match:

1. **Continue:** idle session, same laneKey, task continues/fixes/extends its work → RESUME.
2. **Reuse:** idle session, same laneKey, unrelated task → RESUME (always fine for read-only tasks; for edits, files must not overlap a busy lane).
3. **Tier-up reuse:** no idle session of the exact laneKey, but an idle session of a *stronger* allowed laneKey exists for this role (e.g. `deepseek-v4.1-flash#high` for a `deepseek-v4.1-flash#low` task) → RESUME it. Never reuse a weaker one. Respect §1 restrictions (never `low` for root-cause, `max` only for analysis at `quality`).
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
