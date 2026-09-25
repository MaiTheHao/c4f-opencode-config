---
name: opencode-model-routing
description: Resolves role-to-model routing, execution tier escalation (cheap vs. quality), free-tier delegation constraints, and session reuse invariants. Use whenever dispatching, delegating, spawning subagents, or selecting LLM profiles for coding, analysis, review, or research tasks.
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
| `timeline` | Research | Trace historical and temporal evolution | timeline, historical progression |
| `analyze` | Analysis | Root-cause, architecture read | "why does this happen" |
| `quant` | Analysis | Numbers/benchmark audit | "how much", "audit methodology" |
| `review` | Review | Code/PR quality gate | "review this PR" |
| `skeptic` | Review | Adversarial claim-challenge | "find flaws" |
| `validation` | Review | Cross-check for contradictions | "do these agree" |
| `quick` | General | Low-latency small task | classify, commit message |

## 2. Models & Variants

> **Provider Prefix Mandate:** Every subagent dispatch/resume payload MUST format `model` as `providerID/modelID` or `providerID/modelID#variant` (e.g. `opencode-go/deepseek-v4.1-flash#low`). Omitting the provider prefix causes runtime syntax errors (`Invalid model...`).

| Model (Catalog ID) | Variants | Cap / Note |
|---|---|---|
| `opencode-go/glm-5.3-flash` | `low`, `high` | `max` never used |
| `opencode-go/deepseek-v4.1-flash` | `low`, `high`, `max` | `max` never used except `analyze`/`quant` quality; `low` never for `analyze`/`research-deep`/`quant` (scout/timeline only) |
| `opencode-go/mimo-v2.6-pro` | — | route by ID, no suffix |
| `opencode-go/muse-spark-1.3-contributor` | `medium`, `xhigh` | ceiling `xhigh` (no `max`) |

## 3. Routing Table

| Role | `cheap` (default) | `quality` (opt-in) |
|---|---|---|
| `code` | `opencode-go/glm-5.3-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `code-cheap` | `opencode-go/glm-5.3-flash#low` | `opencode-go/deepseek-v4.1-flash#low` |
| `bulk-edit` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` |
| `refactor` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `test` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `research-scout` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `research-deep` | `opencode-go/muse-spark-1.3-contributor#medium` | `opencode-go/muse-spark-1.3-contributor#xhigh` |
| `timeline` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` |
| `analyze` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `quant` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` |
| `review` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/mimo-v2.6-pro` |
| `skeptic` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/muse-spark-1.3-contributor#xhigh` (public data only) else `opencode-go/mimo-v2.6-pro` |
| `validation` | `opencode-go/mimo-v2.6-pro` | `opencode-go/mimo-v2.6-pro` |
| `quick` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` |

**Default `cheap`.** Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade", "cần chính xác cao".

## 4. Free Tier Constraint (Self-Detection & Delegation)

**Trigger:** If you (the agent reading/executing this skill) are currently running on a **FREE model** (free tier / quota miễn phí):

- **Self-Inventory:** MUST inspect the runtime environment / available provider catalog to list all active, usable **FREE** models before delegating any task.
- **Strict Free Delegation:** MUST override the default Routing Table above. NEVER dispatch, spawn, or escalate subagents to paid or chargeable models. All child sessions and subagent delegations MUST strictly use verified free-tier models.
- **Adaptive Capability Allocation:** Dynamically distribute roles across the discovered free models based on task complexity:
  - Higher-capability / reasoning free models -> `code`, `analyze`, `review`, `research-deep`.
  - Lightweight / faster free models -> `research-scout`, `timeline`, `quick`, `code-cheap`.
- **Cost Guard:** If no compatible free model is available for an essential role, STOP and report `BLOCKED` with the missing free capability, rather than leaking into paid models.