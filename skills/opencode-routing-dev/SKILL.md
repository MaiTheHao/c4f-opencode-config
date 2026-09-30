---
name: opencode-routing-dev
description: Model routing and lane-based subagent reuse for the DEV agent team (analyze code, write/edit code, tests, refactor, code review). Use whenever dispatching or selecting LLM profiles for tasks that read or modify project files. Not for file-free research.
---

# Model Routing: Dev Team

## 0. Dispatch Protocol (mandatory, every dispatch)

RESUME BY DEFAULT. Spawn only when §0.4 forces it. Never justify resume/spawn by cache, cost, or token estimates (unobservable).

**0.1 Inline-first (only if you have edit tools).** If you cannot edit, skip this and delegate; never simulate an edit. If you can: do not delegate when edit ≤ 3 lines, single file, file already in your context. Small edits you cannot do inline get folded into an existing lane's next dispatch.

**0.2 Batch first.** laneKey = `model#variant` (single provider, so omitted). Group pending tasks by laneKey. Dependent, sequential, or file-sharing tasks → ONE dispatch with a numbered checklist. Worker returns per-item evidence (command + output), not bare SUCCESS.

**0.3 Lane registry** (keep in working notes): `laneKey | sessionID | dispatches | fails | files`. Pick in order:
1. Idle lane, same laneKey, task continues/fixes/extends its work → RESUME.
2. Idle lane, same laneKey, unrelated task, files disjoint from any busy lane → RESUME; if none idle, spawn a parallel lane (max 3 per laneKey).
3. No match → spawn and register.

Role change alone never forces respawn when laneKey matches. Free-tier (§3): lanes only among verified free models.

**0.4 Forced respawn (only these).**
- model or variant changes
- role is `review-quality` at `quality` tier (fresh session per audit, so earlier fixes do not bias it)
- lane dispatches ≥ 6 (context-bloat proxy)
- lane fails ≥ 2 on the same task (retire; brief the new lane with the failure evidence)

**0.5 Message shape.** First message to a lane: short stable preamble (rules, output format). Follow-ups: delta only (task, file paths, acceptance command). Never resend the preamble.

**0.6 Verify-before-trust.** Every task carries an acceptance command (grep, build, test, run the script). SUCCESS without command output = FAIL. On fail, fix in the SAME lane first. T-fast·low output touching escaping/regex/generated code: run the real script, not just grep.

## 1. Roles

| Role | Task | Trigger |
|---|---|---|
| `code-implement` | Implement/fix end-to-end | "implement X", "fix bug Y" |
| `code-apply-step` | Execute one already-decided plan step | "apply step N" |
| `code-bulk-edit` | Mechanical mass edits | codemod, mass replace |
| `code-refactor` | High-risk structural change | "refactor module" |
| `code-test` | Write/repair tests, run-fix loop | "add tests" |
| `analysis-root-cause` | Root-cause, architecture read | "why does this happen" |
| `review-quality` | Code/PR quality gate | "review this PR" |
| `general-quick` | Low-latency small task | classify, commit message |

Legacy aliases (old → new): `code`→`code-implement`, `code-cheap`→`code-apply-step`, `bulk-edit`→`code-bulk-edit`, `refactor`→`code-refactor`, `test`→`code-test`, `analyze`→`analysis-root-cause`, `review`→`review-quality`, `quick`→`general-quick`.

## 2. Tiers, Roster, Routing

| Tier | Fit |
|---|---|
| **T-fast** | Mechanical, low-ambiguity edits |
| **T-core** | Default agentic workhorse; has `low/high/max` effort knob |
| **T-cross** | Different model family from the code's producer; factual reliability weighs most |

| Model | Tier | Slot | Variants | Notes |
|---|---|---|---|---|
| `glm-5.3-flash` | T-fast | primary | `low`, `high` | Strongest factual reliability in roster |
| `gpt-6-luna` | T-fast | **restricted** | `none`, `low` | Only when ALL: no reasoning needed, single/small file, short context. Never `high`+ |
| `deepseek-v4.1-flash` | T-core | primary (sole) | `low`, `high`, `max` | `max` only for `analysis-root-cause` at `quality`; never `low` for root-cause. Price doubles Mon–Fri 01:00–04:00 & 06:00–10:00 UTC; defer heavy batches |
| `mimo-v2.6-flash` | T-cross | primary | none (by ID) | Used for `review-quality` at `quality` |

All IDs are prefixed `opencode-go/` in payloads (§3 mandate). Update only this table when the lineup changes.

**Substitution.** Replace an unavailable model with one matching the same tier characteristics, not the cheapest. T-cross must stay a different family from T-core. A restricted member is replaceable only by a model that beats it on its restricted axis (cost + variant granularity) and is never promoted to unrestricted. Free/preview models never enter this table.

**Multi-slot dispatch** (e.g. `code-bulk-edit` fanned out across a large diff): round-robin across unrestricted members only. Add `gpt-6-luna` only for slots that match its restriction. Single-slot dispatch always uses the tier's primary.

| Role | `cheap` (default) | `quality` |
|---|---|---|
| `code-implement` | T-fast · low | T-core · high |
| `code-apply-step` | T-fast · low | T-core · low |
| `code-bulk-edit` | T-fast · low | T-fast · high |
| `code-refactor` | T-core · low | T-core · high |
| `code-test` | T-core · low | T-core · high |
| `analysis-root-cause` | T-core · high | T-core · max |
| `review-quality` | T-core · high | T-cross |
| `general-quick` | T-fast · low | T-fast · high |

Resolve tier → concrete `model#variant`; that is the laneKey for §0. Default `cheap`. Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade".

## 3. Free-Tier Mode (overrides §2 routing entirely)

If you are running on a FREE model:
- **Inventory:** list all active FREE models from the runtime/provider catalog before delegating.
- **Strict free:** NEVER dispatch or escalate to paid models. Use whatever free models exist, regardless of tiering.
- **Allocation:** map free models to tiers by observed capability. T-core-like → `code-implement`, `analysis-root-cause`, `review-quality`, `code-refactor`, `code-test`. T-fast-like → `code-apply-step`, `code-bulk-edit`, `general-quick`.
- **Cost guard:** if an essential tier has no free model, STOP and report `BLOCKED` with the missing tier.

> **Provider Prefix Mandate:** every dispatch/resume payload MUST format `model` as `providerID/modelID` or `providerID/modelID#variant` (e.g. `opencode-go/deepseek-v4.1-flash#low`). Omitting the prefix causes `Invalid model...` errors.