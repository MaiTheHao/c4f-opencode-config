---
name: oc-routing
description: Subagent routing and orchestration for OpenCode models. Use when dispatching, resuming, parallelizing, or auditing subagents.
---

# oc-routing

**ROUTE BY FIT. RESUME WHEN USEFUL. VERIFY BEFORE DONE.**

## Models

`python ~/.config/opencode/scripts/show_models.py --routing`

Columns: Model, Variants, Cost (relative tier, lower = cheaper; `*-free` = 0), Role (what it can be assigned), Strengths.

Match tasks to Role first, Strengths second, Cost last.

- Cost is a relative hint, not a price. Verify availability, variants, quota, and privacy against the provider.
- Use the cheapest variant that reliably meets quality; escalate on hard reasoning, ambiguity, or repeated failure. Keep one default variant per model within a task sequence.
- Routing is a starting hypothesis; validate against actual outcomes.
- Muse Spark Contributor may use request data for training: never send sensitive/proprietary data unless the data-use policy is acceptable.
- Free models are ordinary allowed models: route to them by fit and cost 0, no user request needed.
- **FULL FREE** (only when the user asks for it): use free models for every flow, no paid models.
- On an `unpaid` error from an `opencode-go/` model: do not retry the paid route; switch to free models (`opencode/` prefix when supported).

## Rules

### 1. Batching
Group small tasks sharing files, context, or dependencies into one dispatch with a numbered checklist. Split tasks with different objectives, independent judgment needs, or no shared mutable state. Never default to one session per task.

### 2. Parallelism
- Dispatch independent batches in the same wave; keep dependent tasks sequential.
- Start at 3–5 concurrent batches; raise only if throughput, rate limits, quality, and integration stay acceptable. Queue the rest.
- More agents ≠ faster.

### 3. Session selection (in order)
1. **Affinity:** resume a session with relevant context and compatible history.
2. **Reuse:** resume a compatible session on the same model+variant.
3. **Tier up:** reuse a stronger permitted variant if appropriate.
4. **Spawn:** create one if none fits.

Use `laneKey = model#variant` as a hint only. Role compatibility and session state (idle, safe, appropriate) must still be checked.

Start fresh when: independent reasoning is needed (audit/second opinion), context holds a disproven assumption or confusion, role/scope/model differs materially, or contamination is likely.

### 4. File safety
- Never allow concurrent writes to the same file; parallel read/review is fine.
- Partition implementation by file ownership. If a file is being edited by another agent, wait.
- After integration, inspect the combined diff for conflicts, duplicated logic, overwrites, and unrelated changes.
- Locks/ownership are runtime responsibilities; do not assume this document enforces them.

### 5. Independent audits
The auditor must not repeat the producer's reasoning. Prefer, in order: a different session → a different model → independent evidence (tests, specs, static analysis, repro, direct inspection). Reuse a compatible session that did not produce the finding; spawn a new one only if the review value justifies it. If model diversity is unavailable, keep session independence and disclose the limitation.

### 6. Failures and rate limits
- HTTP 429: reduce concurrency, queue the rest, increase again only after a clean wave.
- Model unavailable: pick the closest allowed model that meets requirements.
- Task failure: inspect evidence before retrying. Retry in the same session if context is still useful; change approach/session if the same failure repeats without progress.

### 7. Acceptance
Before marking a batch complete: inspect changed files and diff → run the relevant acceptance command/tests → check regressions and unintended changes → report commands run and actual outcomes. If tests cannot run, state why and what is unverified. Never report a test as passing unless observed.

## Operating habits
- Send the full task preamble once per session; later dispatches carry only the new task, scope, constraints, and acceptance criteria.
- Give every batch explicit deliverables and a definition of done; keep batches reviewable but worth the dispatch overhead.
- Record failure evidence before retrying or replacing a session.
- Respawn only when: model/variant changes with no compatible session, session unusable, repeated failure without progress, or independent context required.

## Objective
Optimize for correctness, successful completion, integration cost, latency, and total resource use, not for reuse, concurrency, or model strength alone. When uncertain, choose the simplest verifiable plan.