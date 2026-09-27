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

Names follow `{group}-{function}`, so the group is self-evident without a lookup.

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

**Legacy alias map** (old → new, 1:1): `code`→`code-implement`, `code-cheap`→`code-apply-step`, `bulk-edit`→`code-bulk-edit`, `refactor`→`code-refactor`, `test`→`code-test`, `analyze`→`analysis-root-cause`, `quant`→`analysis-quant`, `review`→`review-quality`, `skeptic`→`review-skeptic`, `validation`→`review-validation`, `quick`→`general-quick`, `timeline`→`research-timeline`. (`research-scout`, `research-deep` unchanged.)

## 2. Capability Tiers (classify by fit, not cost)

Paid roster only — free-tier delegation is handled entirely by §4, not by any tier here.
A tier MAY contain more than one model — see §2c for when to use one vs. split across members, including **restricted members** that only qualify for a narrow slice of a tier's tasks.

| Tier | Fit | Characteristics to look for |
|---|---|---|
| **T-fast** | Mechanical, low-ambiguity, or low-rigor recon | Low latency, reliable instruction-following, fine-grained effort levels for cost control |
| **T-core** | Default agentic workhorse — most coding/research/analysis | Balanced reasoning + speed, reliable tool-use, has a `low/high/max`-style effort knob |
| **T-deep** | High-rigor single-question reasoning | Strongest chain-of-thought / effort scaling in roster, even if slower |
| **T-cross** | Cross-check & adversarial review | Different model family from whatever produced the artifact being reviewed — diversity matters more than raw capability here; factual reliability weighs heavier than in any other tier |

### 2a. Current roster → tier mapping

> Update only this table when the model lineup changes. Everything in §3 references tiers, so edits here propagate everywhere.

| Model (Catalog ID) | Tier | Slot role | Variants used | Notes |
|---|---|---|---|---|
| `opencode-go/glm-5.3-flash` | T-fast | primary (general use) | `low`, `high` | Strongest factual reliability in roster; default for anything in T-fast |
| `opencode-go/gpt-6-luna` | T-fast | **restricted secondary** | `none`, `low` only | Only when *all* apply: no reasoning needed, single/small file, context well under long-range recall risk. Never `high`/`xhigh`/`max` here — at that point it's slower and no stronger than the primary |
| `opencode-go/deepseek-v4.1-flash` | T-core | primary (sole member) | `low`, `high`, `max` | `max` reserved for analysis roles at `quality`; `low` never for root-cause/quant/deep-research |
| `opencode-go/muse-spark-1.3-contributor` | T-deep | primary (sole member) | `medium`, `xhigh` | Ceiling `xhigh`, no `max` |
| `opencode-go/mimo-v2.6-flash` | T-cross | primary | — (route by ID, no suffix) | — |
| `opencode-go/qwen3.8-flash` | T-cross | secondary (second independent family for validation) | `low`, `medium` | — |

### 2b. Substitution rule

If a model in 2a becomes unavailable or the roster changes, replace it with another model matching the **same tier characteristics** (§2), not whatever happens to be cheapest. `T-cross` members must each stay a different family from `T-core`/`T-deep` *and* from each other. A **restricted member** (like `gpt-6-luna`) can only be replaced by another model that beats it on the specific axis it was restricted for (cost + variant granularity) — it must not be promoted to unrestricted just because it's convenient. Free/preview models never enter this table — they belong in §4 only.

### 2c. Multi-model tiers & slot-splitting

When a tier has more than one member:

- **Single-slot dispatch** (most roles): always use the tier's `primary` member. Never rotate to a restricted member just for variety.
- **Multi-slot dispatch** (a role explicitly configured for N parallel workers, e.g. `research-scout` or `code-bulk-edit` fanned out across a large diff): split slots round-robin across the tier's **unrestricted** members only. A restricted member (§2a) is added to the rotation *only* for the specific slots whose subtask matches its restriction (no reasoning, small/single-file context) — never as a blind round-robin participant, since that reintroduces exactly the long-context/reliability risk it was restricted to avoid.
- **Validation/skeptic roles requiring independent consensus**: MUST use two *different* members — never let both cross-check slots resolve to the same model, even if only one T-cross member is configured for a given dispatch.

## 3. Routing Table (by tier, not fixed model — resolve via 2a)

| Role | `cheap` (default) | `quality` (opt-in) | `ExcludeIfUsedByRole` |
|---|---|---|---|
| `code-implement` | T-fast · low | T-core · high | — |
| `code-apply-step` | T-fast · low | T-core · low | — |
| `code-bulk-edit` | T-fast · low (see §2c for restricted-member slots) | T-fast · high | — |
| `code-refactor` | T-core · low | T-core · high | — |
| `code-test` | T-core · low | T-core · high | — |
| `research-scout` | T-fast · low | T-core · high | — |
| `research-deep` | T-deep · medium | T-deep · xhigh | — |
| `research-timeline` | T-fast · low | T-core · high | — |
| `analysis-root-cause` | T-core · high | T-core · max | — |
| `analysis-quant` | T-core · high | T-core · max | — |
| `review-quality` | T-core · high | T-cross | — |
| `review-skeptic` | T-core · high | T-deep · xhigh (public data only) else T-cross | `research-deep` |
| `review-validation` | T-cross | T-cross | `research-deep` |
| `general-quick` | T-fast · low | T-fast · high | — |

**Resolution:** look up the tier in this table, then resolve tier → concrete `provider/model#variant` via §2a at dispatch time (§2c decides single vs. multi-member use for tiers with more than one model, including restricted members). **Default `cheap`.** Escalate to `quality` only on explicit trigger: "high accuracy", "critical", "production", "security-grade", "need high accuracy".

## 4. Free-Tier Self-Detection & Delegation (overrides §3 entirely)

If you (the agent executing this skill) are currently running on a **FREE model** (free tier / free quota):

- **Self-Inventory:** MUST inspect the runtime environment / provider catalog to list all active, usable **FREE** models before delegating any task.
- **Strict Free Delegation:** NEVER dispatch, spawn, or escalate subagents to paid/chargeable models. All child sessions and subagent delegations MUST strictly use verified free-tier models — no cherry-picking, use whatever free models are actually available regardless of how they'd otherwise be tiered.
- **Adaptive Capability Allocation:** map discovered free models to the §2 tier definitions by observed capability (not by cost), then distribute roles the same way §3 does:
  - Model behaves like T-core/T-deep → `code-implement`, `analysis-root-cause`, `review-quality`, `research-deep`.
  - Model behaves like T-fast → `research-scout`, `research-timeline`, `general-quick`, `code-apply-step`.
- **Cost Guard:** if no compatible free model exists for an essential tier, STOP and report `BLOCKED` with the missing tier — never leak into paid models.

> **Provider Prefix Mandate:** Every subagent dispatch/resume payload MUST format `model` as `providerID/modelID` or `providerID/modelID#variant` (e.g. `opencode-go/deepseek-v4.1-flash#low`). Omitting the provider prefix causes runtime syntax errors (`Invalid model...`).