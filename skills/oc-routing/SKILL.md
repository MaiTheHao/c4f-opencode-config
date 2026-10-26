---
name: oc-routing
description: Subagent routing and session orchestration for OpenCode. Use when dispatching, resuming, parallelizing, or auditing subagents.
---

# oc-routing

**ROUTE BY FIT. RESUME WHEN USEFUL. SPAWN LAST.**

## Models

Call `allowed_models` before routing. Its table is the only source of truth for available models, provider, class, price, tier, variants and triggers. Never route to a model it does not list.

- Pick by the task's primary objective: match the most specific Trigger first, and use Tier only to break ties.
- Use the lowest Variant that reliably meets the reasoning need. Escalate only on complexity, ambiguity, or observed failure, and keep one variant per model within a task sequence unless evidence justifies a change.
- Treat a route as a hypothesis and adjust on observed outcomes.
- **FULL FREE** (only when explicitly requested): query once with `model_paid_type=FREE` and use only those rows for the whole workflow, including retries, audits and follow-ups. Never fall back to a PAID row.
- On an `unpaid` error, drop that route for the rest of the task and re-query with `model_paid_type=FREE`.
- Muse Spark Contributor may use request data for training. Do not send sensitive or proprietary data to it.

## Rules

### 1. Batching

Group small tasks that share files, context or dependencies into one dispatch with a numbered checklist. Split when objectives need independent judgment, dependencies differ, or shared mutable state makes batching unsafe. Do not default to one session per task.

### 2. Parallelism

Dispatch independent batches in the same wave and keep dependent tasks sequential. Start at 3–5 concurrent batches and increase only while throughput, rate limits, quality and integration hold. Queue the excess. Do not force parallelism when fewer batches suffice.

### 3. Session selection

First confirm eligibility: context relevance, role and scope fit, session state, no contamination. Then take the first match:

1. **Affinity:** a session with relevant context and compatible history.
2. **Reuse:** a compatible session with the same model and variant.
3. **Tier up:** a suitable session on a stronger variant, when justified.
4. **Spawn:** a new session when none fits.

`laneKey = model#variant` is a hint only, not proof of identity or compatibility.
Start fresh when independent reasoning is required, prior assumptions are disproven, context is contaminated, role or scope differs materially, or reuse would compromise the task.

### 4. File safety

- Never allow concurrent writes to the same file; parallel reads and reviews are fine.
- Partition implementation work by file ownership. If another agent owns the file, wait or coordinate reassignment.
- After integration, check the combined diff for conflicts, duplicated logic, overwritten work and unrelated changes.
- Locks are a runtime responsibility; do not assume this skill enforces them.

### 5. Independent audits

The auditor must not repeat the producer's reasoning. Prefer, in order: a different session, a different model, independent evidence. Reuse a compatible session that did not produce the changes, and spawn only when independent review is worth the overhead. If model diversity is unavailable, keep session independence and say so.

### 6. Failures

- **Retry** in the same session while its context is useful and the approach is viable.
- **Respawn** only when the model or variant must change with no compatible session, the session is unusable, repeated attempts show no progress, or independent context is required.
- Record failure evidence before retrying or replacing a session.

## Dispatch habits

- Send the full task preamble once per session. Later dispatches carry only the new task, scope, constraints and deliverables.
- Give each batch a clear scope and explicit deliverables.
- Reuse to preserve context; spawn for isolation, a different role, or independent reasoning.
- Avoid redundant sessions, extra dispatches and excess concurrency.

## Objective

Optimize for correctness, context continuity, latency, integration cost and total resource use. Choose the simplest viable strategy.
