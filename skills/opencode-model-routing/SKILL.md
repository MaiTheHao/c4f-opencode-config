---
name: opencode-model-routing
description: Resolve role-to-model mappings and execution tiers before dispatching subagents. Trigger on subagent spawn, dispatch, delegate, worker assignment, REVIEW_PLAN, REVIEW_WORK, or whenever determining the optimal LLM for code, review, analysis, or testing tasks.
---

# Model Routing

## 1. Role Definitions

| Role | Group | What it does | Typical trigger |
|---|---|---|---|
| `code` | Code | Implement feature / fix bug end-to-end (agentic tool loop) | "implement X", "fix bug Y" |
| `code-cheap` | Code | Execute already-decided plan steps; the plan carries the reasoning | "apply step N", plan execution |
| `bulk-edit` | Code | Mechanical repeated edits across many files (rename, API propagation, boilerplate) | codemod, mass replace |
| `refactor` | Code | High-risk structural / multi-file change with hidden coupling | "refactor module", "restructure" |
| `test` | Code | Write/repair tests, run-fix loops, coverage expansion | "add tests", "fix failing tests" |
| `research-scout` | Research | Broad recon, exploratory searches, low rigor per query | first-pass scoping |
| `research-deep` | Research | Deep dive on one narrow sub-question, primary sources, high rigor | "dig into X" |
| `analyze` | Analysis | Read code/logs/docs, root-cause analysis, architectural breakdown | "why does this happen" |
| `quant` | Analysis | Extract and audit numbers, benchmarks, methodology | "how much", "audit the methodology" |
| `review` | Review | Code/PR review, defect finding, quality gate | "review this PR" |
| `skeptic` | Review | Adversarial audit: challenge claims, hunt counter-evidence | "find flaws in this argument" |
| `validation` | Review | Cross-check outputs for consistency, contradictions, regressions | "do these agree" |
| `quick` | General | Low-latency small tasks: classify, extract metadata, commit message | single small query |
| `bulk` | General | High-volume text generation: summaries, docs, changelogs | mass summarization |

## 2. Variants

| Model | Variants | Notes |
|---|---|---|
| `opencode-go/glm-5.3-flash` | `low`, `high`, `max` | Vendor default is `max`; thinking cannot be disabled. `#low` for mechanical/bulk, `#high` for logic and review, `#max` only when escalating |
| `opencode-go/deepseek-v4.1-flash` | `low` (=50), `high` (=75), `max` (=100) reasoning effort | Never `#low` for `analyze`, `research-deep`, `quant`; `#low` is for scout triage only |
| `opencode-go/mimo-v2.6-pro` | none | Route by model ID alone, no suffix |
| `opencode-go/muse-spark-1.3-contributor` | `minimal`, `low`, `medium`, `high`, `xhigh` | `#max` is unavailable on Contributor tier; `#xhigh` is the ceiling |

## 3. Routing Table

| Role | `cheap` (default) | `quality` (opt-in) |
|---|---|---|
| `code` | `opencode-go/glm-5.3-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `code-cheap` | `opencode-go/glm-5.3-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `bulk-edit` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` |
| `refactor` | `opencode-go/glm-5.3-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `test` | `opencode-go/glm-5.3-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `research-scout` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `research-deep` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `analyze` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `quant` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `review` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/mimo-v2.6-pro` |
| `skeptic` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/muse-spark-1.3-contributor#xhigh` (public data only); else `opencode-go/mimo-v2.6-pro` |
| `validation` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `quick` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` |
| `bulk` | `opencode-go/muse-spark-1.3-contributor#low` (public only); else `opencode-go/glm-5.3-flash#low` | same as `cheap` |

**Default to `cheap`.** Start from the cheap column; escalate only on an explicit quality trigger: "high accuracy", "critical", "production", "security-grade", "cần chính xác cao".

## 5. Session Reuse

- **Reuse by ID:** record the session ID on spawn; send all follow-up feedback, fixes, and related tasks for the same role to that session. Never spawn a new subagent when a resumable one exists; build on previous messages and results.
- **Respawn instead of reuse when:**
  - the model must change (mode escalation, Rule 3 verifier swap, Rule 4 governance gate) or the role changes; a session keeps the model it was spawned with.
  - the task needs an independent verdict: `skeptic` and `validation` get a fresh session per audit, because a resumed session is biased by earlier fixes.