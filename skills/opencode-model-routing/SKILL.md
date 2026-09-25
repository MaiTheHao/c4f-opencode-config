---
name: opencode-model-routing
description: Resolve role-to-model mappings and execution tiers before dispatching subagents. Trigger on subagent spawn, dispatch, delegate, worker assignment, REVIEW_PLAN, REVIEW_WORK, or whenever determining the optimal LLM for code, review, analysis, or testing tasks.
---

# Model Routing

## 0. CRITICAL: Session Reuse (mandatory, every dispatch)

Before spawning any subagent, check for an existing resumable session for that role.

- **MUST reuse by session ID** if one exists for the role: route all follow-ups, fixes, and related tasks to that same session. Spawning a new subagent while a resumable one exists is a routing error — never do it.
- **MUST respawn (new session)** only when:
  - the model or role must change (mode escalation, verifier swap, governance gate) — a session keeps the model it was spawned with, so a model/role change always forces a new one;
  - the role is `skeptic` or `validation` — these always get a fresh session per audit, since a resumed session is biased by earlier fixes.
- This check runs on **every** spawn/dispatch/delegate action, with no exceptions, regardless of role or mode (`cheap`/`quality`).

## 1. Roles

| Role | Group | Task | Trigger |
|---|---|---|---|
| `code` | Code | Implement/fix end-to-end (agentic loop) | "implement X", "fix bug Y" |
| `code-cheap` | Code | Execute a decided plan step | "apply step N" |
| `bulk-edit` | Code | Mechanical mass edits | codemod, mass replace |
| `refactor` | Code | High-risk structural change | "refactor module" |
| `test` | Code | Write/repair tests, run-fix loop | "add tests" |
| `research-scout` | Research | Broad recon, low rigor | first-pass scoping |
| `research-deep` | Research | One sub-question, high rigor | "dig into X" |
| `analyze` | Analysis | Root-cause, architecture read | "why does this happen" |
| `quant` | Analysis | Numbers/benchmark audit | "how much", "audit methodology" |
| `review` | Review | Code/PR quality gate | "review this PR" |
| `skeptic` | Review | Adversarial claim-challenge | "find flaws" |
| `validation` | Review | Cross-check for contradictions | "do these agree" |
| `quick` | General | Low-latency small task | classify, commit message |

## 2. Models & Variants

| Model | Variants | Cap / Note |
|---|---|---|
| `glm-5.3-flash` | `low`, `high` | `max` never used |
| `deepseek-v4.1-flash` | `low`, `high` | `max` never used except `analyze`/`quant` quality; `low` never for `analyze`/`research-deep`/`quant` (scout only) |
| `mimo-v2.6-pro` | — | route by ID, no suffix |
| `muse-spark-1.3-contributor` | `medium`, `xhigh` | ceiling `xhigh` (no `max`) |

## 3. Routing Table

| Role | `cheap` (default) | `quality` (opt-in) |
|---|---|---|
| `code` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#high` |
| `code-cheap` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#low` |
| `bulk-edit` | `glm-5.3-flash#low` | `glm-5.3-flash#high` |
| `refactor` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `test` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `research-scout` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `research-deep` | `muse-spark-1.3-contributor#medium` | `muse-spark-1.3-contributor#xhigh` |
| `analyze` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `quant` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `review` | `deepseek-v4.1-flash#high` | `mimo-v2.6-pro` |
| `skeptic` | `deepseek-v4.1-flash#high` | `muse-spark-1.3-contributor#xhigh` (public data only) else `mimo-v2.6-pro` |
| `validation` | `mimo-v2.6-pro` | `mimo-v2.6-pro` |
| `quick` | `glm-5.3-flash#low` | `glm-5.3-flash#high` |

**Default `cheap`.** Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade", "cần chính xác cao".