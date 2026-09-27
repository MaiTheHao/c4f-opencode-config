---
name: opencode-model-routing
description: Resolves role-to-model routing, execution tier escalation (cheap vs. quality), free-tier delegation constraints, and session reuse invariants. Use whenever dispatching, delegating, spawning subagents, or selecting LLM profiles for coding, analysis, review, or research tasks.
---

# Model Routing

## 0. CRITICAL: Reuse Subagent (mandatory, every dispatch)

Always prefer reusing an already-delegated subagent over spawning a new one — the point of this rule is to stop indiscriminate spawning.

Before spawning any subagent, check for an existing resumable session that fits the task.

- **MUST reuse by session ID** if one exists — route all follow-ups, fixes, and related tasks to that same session. Spawning a new subagent while a resumable one exists is a routing error — never do it.
- **MUST respawn (new session)** only when:
  - the model or role must change (mode escalation, verifier swap, governance gate) — a session keeps the model it was spawned with, so a model/role change always forces a new one;
  - the role is `review-skeptic` or `review-validation` — these always get a fresh session per audit, since a resumed session is biased by earlier fixes.

This check runs on **every** spawn/dispatch/delegate action, with no exceptions, regardless of role or mode (`cheap`/`quality`).

## 1. Roles

Names follow `{group}-{function}`, so the group is self-evident without a lookup — reduces role-pick ambiguity for the dispatching LLM.

| Role | Group | Task | Trigger |
|---|---|---|---|
| `code-implement` | Code | Implement/fix end-to-end (agentic loop) | "implement X", "fix bug Y" |
| `code-apply-step` | Code | Execute one already-decided plan step | "apply step N" |
| `code-bulk-edit` | Code | Mechanical mass edits | codemod, mass replace |
| `code-refactor` | Code | High-risk structural change | "refactor module" |
| `code-test` | Code | Write/repair tests, run-fix loop | "add tests" |
| `research-scout` | Research | Broad recon, low rigor | first-pass scoping |
| `research-deep` | Research | One sub-question, high rigor | "dig into X" |
| `research-timeline` | Research | Trace historical/temporal evolution | timeline, historical progression |
| `analysis-root-cause` | Analysis | Root-cause, architecture read | "why does this happen" |
| `analysis-quant` | Analysis | Numbers/benchmark audit | "how much", "audit methodology" |
| `review-quality` | Review | Code/PR quality gate | "review this PR" |
| `review-skeptic` | Review | Adversarial claim-challenge | "find flaws" |
| `review-validation` | Review | Cross-check for contradictions | "do these agree" |
| `general-quick` | General | Low-latency small task | classify, commit message |

**Legacy alias map** (old → new, 1:1, for any config still referencing old names): `code`→`code-implement`, `code-cheap`→`code-apply-step`, `bulk-edit`→`code-bulk-edit`, `refactor`→`code-refactor`, `test`→`code-test`, `analyze`→`analysis-root-cause`, `quant`→`analysis-quant`, `review`→`review-quality`, `skeptic`→`review-skeptic`, `validation`→`review-validation`, `quick`→`general-quick`, `timeline`→`research-timeline`. (`research-scout`, `research-deep` unchanged.)

## 2. Models, Variants & Tier Constraints

> **Provider Prefix Mandate:** Every subagent dispatch/resume payload MUST format `model` as `providerID/modelID` or `providerID/modelID#variant` (e.g. `opencode-go/deepseek-v4.1-flash#low`). Omitting the provider prefix causes runtime syntax errors (`Invalid model...`).

| Model (Catalog ID) | Variants | Cap / Note |
|---|---|---|
| `opencode-go/glm-5.3-flash` | `low`, `high` | `max` never used |
| `opencode-go/deepseek-v4.1-flash` | `low`, `high`, `max` | `max` never used except `analysis-root-cause`/`analysis-quant` quality; `low` never for `analysis-root-cause`/`research-deep`/`analysis-quant` (scout/timeline only) |
| `opencode-go/mimo-v2.6-pro` | — | route by ID, no suffix |
| `opencode-go/muse-spark-1.3-contributor` | `medium`, `xhigh` | ceiling `xhigh` (no `max`) |

### 2a. Free-Tier Self-Detection & Delegation (overrides §3 entirely)

If you (the agent executing this skill) are currently running on a **FREE model** (free tier / free quota):

- **Self-Inventory:** MUST inspect the runtime environment / provider catalog to list all active, usable **FREE** models before delegating any task.
- **Strict Free Delegation:** NEVER dispatch, spawn, or escalate subagents to paid/chargeable models. All child sessions and subagent delegations MUST strictly use verified free-tier models.
- **Adaptive Capability Allocation:** distribute roles across discovered free models by complexity:
  - Higher-capability / reasoning free models → `code-implement`, `analysis-root-cause`, `review-quality`, `research-deep`.
  - Lightweight / faster free models → `research-scout`, `research-timeline`, `general-quick`, `code-apply-step`.
- **Cost Guard:** if no compatible free model exists for an essential role, STOP and report `BLOCKED` with the missing free capability — never leak into paid models.

## 3. Routing Table (paid tiers — see §2a if running free)

| Role | `cheap` (default) | `quality` (opt-in) | `ExcludeIfUsedByRole` |
|---|---|---|---|
| `code-implement` | `opencode-go/glm-5.3-flash#low` | `opencode-go/deepseek-v4.1-flash#high` | — |
| `code-apply-step` | `opencode-go/glm-5.3-flash#low` | `opencode-go/deepseek-v4.1-flash#low` | — |
| `code-bulk-edit` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` | — |
| `code-refactor` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` | — |
| `code-test` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` | — |
| `research-scout` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` | — |
| `research-deep` | `opencode-go/muse-spark-1.3-contributor#medium` | `opencode-go/muse-spark-1.3-contributor#xhigh` | — |
| `research-timeline` | `opencode-go/deepseek-v4.1-flash#low` | `opencode-go/deepseek-v4.1-flash#high` | — |
| `analysis-root-cause` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` | — |
| `analysis-quant` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/deepseek-v4.1-flash#max` | — |
| `review-quality` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/mimo-v2.6-pro` | — |
| `review-skeptic` | `opencode-go/deepseek-v4.1-flash#high` | `opencode-go/muse-spark-1.3-contributor#xhigh` (public data only) else `opencode-go/mimo-v2.6-pro` | `research-deep` |
| `review-validation` | `opencode-go/mimo-v2.6-pro` | `opencode-go/mimo-v2.6-pro` | `research-deep` |
| `general-quick` | `opencode-go/glm-5.3-flash#low` | `opencode-go/glm-5.3-flash#high` | — |

**Default `cheap`.** Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade", "need high accuracy".
