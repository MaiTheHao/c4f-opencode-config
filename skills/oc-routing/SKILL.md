---
name: oc-routing
description: Model routing and subagent session orchestration for OpenCode. Use when dispatching, resuming, parallelizing, or auditing subagents.
---

# oc-routing

**ROUTE BY FIT. RESUME WHEN USEFUL. SPAWN LAST.**

## Models

Use the Code Mode call `tools['c4f-model-policy'].allowed_models({ action: 'allowed' })` in the `c4f-model-policy` namespace as the authoritative routing table.

Available fields: `id`, `variants`, `cost`, `trigger`.

- Route by the task's primary objective and matching triggers. Do not assume metadata fields that the tool does not return.
- Match the most specific relevant trigger first. When multiple models match, prefer the one whose triggers best fit the task's primary objective and actual difficulty.
- Use `cost` as a relative hint to break ties between models that meet the same requirements. It is not a price.
- Select the lowest variant that reliably meets the task's reasoning requirements. Escalate only when complexity, ambiguity, or observed failure justifies it.
- Keep one default variant per model within a task sequence unless evidence justifies changing it.
- Treat routing as a starting hypothesis, not a guarantee. Adjust based on observed outcomes.
- Free models are ordinary routing options when available and suitable; route to them by fit and cost 0.
- **FULL FREE** applies only when explicitly requested. Use free models throughout the entire workflow, including retries, audits, and follow-up dispatches. Never fall back to a paid route.
- If an `opencode-go/` model returns an `unpaid` error, do not retry that paid route. Switch to an available free model, using the `opencode/` prefix when supported.
- Verify availability, supported variants, quota, and applicable data-use restrictions before dispatching.
- Muse Spark Contributor may use request data for training. Do not send sensitive or proprietary data unless the applicable data-use policy permits it.

## Rules

### 1. Batching

Group small tasks that share files, context, or dependencies into one dispatch with a numbered checklist.

Split tasks when objectives require independent judgment, dependencies differ, or shared mutable state makes batching unsafe. Do not default to one session per task.

### 2. Parallelism

Dispatch independent batches in the same wave; keep dependent tasks sequential.

Start with up to 3–5 concurrent batches when the workload supports it. Increase concurrency only while throughput, rate limits, output quality, and integration remain manageable. Queue excess work.

Do not force parallelism when fewer batches are sufficient.

### 3. Session selection

Apply the following order after confirming that a session is eligible for reuse:

1. **Affinity:** Resume a session with relevant context and compatible history.
2. **Reuse:** Resume a compatible session using the same model and variant.
3. **Tier up:** Reuse a suitable session with a stronger variant when justified.
4. **Spawn:** Create a new session when no existing session fits.

Before resuming, check context relevance, role and scope compatibility, session state, and potential context contamination.

Use `laneKey = model#variant` as a hint only. It does not establish session identity, compatibility, or availability.

Start fresh when independent reasoning is required, prior assumptions have been disproven, context is contaminated, role or scope differs materially, or reuse would compromise the task.

### 4. File safety

Never allow concurrent writes to the same file. Parallel reads and reviews are allowed.

Partition implementation work by file ownership. If another agent owns a file being edited, wait or coordinate reassignment before writing.

After integration, inspect the combined changes for conflicts, duplicated logic, overwritten work, and unrelated modifications.

Locks and ownership enforcement are runtime responsibilities. Do not assume this skill enforces them.

### 5. Independent audits

The auditor must not merely repeat the producer's reasoning.

Prefer, in order:

1. A different session.
2. A different model.
3. Independent evidence or inspection.

Reuse a compatible session that did not produce the changes when possible. Spawn a new session only when the expected value of independent review justifies the overhead.

If model diversity is unavailable, preserve session independence and disclose the limitation.

### 6. Failures and rate limits

- **Retry:** Reuse the same session when its context remains useful and the approach is still viable.
- **Respawn:** Spawn a replacement only when the model or variant must change without a compatible session, the current session is unusable, repeated attempts make no progress, or independent context is required.
- **Unpaid route:** Follow the Models fallback policy; do not repeatedly retry a paid route that has returned `unpaid`.

## Operating habits

- Send the full task preamble once per session. Subsequent dispatches should contain only the new task, scope, constraints, and expected deliverables.
- Give each batch a clear scope and explicit deliverables.
- Record failure evidence before retrying or replacing a session.
- Prefer reuse when it preserves relevant context and independence is unnecessary.
- Prefer spawning when isolation, a materially different role, or independent reasoning is necessary.
- Avoid unnecessary dispatches, redundant sessions, and excessive concurrency.

## Objective

Optimize routing and session orchestration for correctness, successful task execution, context continuity, latency, integration cost, and total resource use.

Choose the simplest viable routing and reuse strategy. Reuse when useful; spawn when necessary.