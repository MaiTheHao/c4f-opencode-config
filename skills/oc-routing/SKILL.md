---
name: oc-routing
description: Subagent routing and orchestration for OpenCode Go models. Use when dispatching, resuming, parallelizing, or auditing subagents.
---

# oc-routing

**ROUTE BY FIT. RESUME WHEN USEFUL. VERIFY BEFORE DONE.**

## Models

| Model ID | Variants | Cost tier | Preferred tasks |
|---|---|---:|---|
| `opencode-go/deepseek-v4.1-flash` | `low`, `high`, `max` | 1 | Implementation, refactoring, difficult debugging, complex analysis, research, quantitative reasoning |
| `opencode-go/mimo-v2.6-flash` | `low`, `high` | 2 | Lightweight implementation, mechanical edits, secondary analysis, model-diverse review |
| `opencode-go/glm-5.3-flash` | `low`, `high` | 3 | Repository reconnaissance, classification, summarization, factual checks, bulk edits, validation |
| `*-free` | Provider-dependent | 0 | Use only when explicitly requested; quality and availability are unverified |

- Model availability, variant names, and pricing can change. Confirm against the active provider configuration.
- Cost tiers are relative routing hints, not guaranteed per-request prices.
- Prefer `opencode-go/` model IDs when supported by the runtime.
- Choose the weakest variant that reliably meets the task's quality requirements. Use stronger variants for difficult reasoning, ambiguous requirements, or repeated failures.
- Use one default variant per model for a task sequence unless a deliberate quality or availability trade-off justifies changing it.

## Core Rules

### 1. Batch Related Work

Group small tasks that share files, context, or dependencies into one dispatch with a numbered checklist.

Split tasks when they have materially different objectives, require independent judgment, or can proceed without shared mutable state.

Do not create one session per task by default.

### 2. Parallelize Independent Work

Dispatch independent batches in the same wave when parallel execution is supported.

- Start with a bounded concurrency limit, typically 3–5 active batches.
- Increase concurrency only when throughput improves and rate limits, quality, and integration remain acceptable.
- Queue excess work rather than overwhelming the provider or runtime.
- Keep dependent tasks sequential.
- Never assume that more parallel agents produce faster completion.

### 3. Select a Session

Choose a session in this order:

1. **Affinity:** resume an available session with relevant context and compatible task history.
2. **Reuse:** resume another available, compatible session on the same model and variant.
3. **Tier adjustment:** reuse a session with a stronger permitted variant when available and appropriate.
4. **Spawn:** create a session when no suitable session exists.

Reuse is a preference, not an absolute requirement.

Start a fresh session when:
- Independent reasoning is required for an audit or second opinion.
- Previous context contains a disproven assumption or persistent task confusion.
- The task requires a materially different role, scope, or model.
- Context contamination is likely to reduce correctness.

Never assume that a session is available merely because its model and variant match.

### 4. Session Identity

Use `laneKey = model#variant` as a routing hint.

Role is not part of the lane key, but role compatibility and session state must still be checked before reuse.

A matching lane key does not guarantee that a session is idle, appropriate, or safe to resume.

### 5. File Safety

- Never allow two agents to write to the same file concurrently.
- Agents may analyze or review the same file in parallel if they do not perform conflicting writes.
- Partition implementation batches by file ownership whenever practical.
- If a required file is being modified by another agent, wait for completion before editing it.
- After integration, inspect the combined diff for conflicts, duplicated logic, accidental overwrites, and unrelated changes.

Treat file locks, ownership metadata, and write coordination as runtime responsibilities when supported. Do not assume that this document alone enforces them.

### 6. Independent Audits

An auditor must not merely repeat the producer's reasoning.

Prefer:
1. A different session.
2. A different model from the producer, when available.
3. Independent evidence: tests, specifications, static analysis, reproduction steps, or direct inspection.

Reuse an existing compatible session that did not produce the finding when independence is preserved.

Spawn a new session if no suitable auditor exists and the value of independent review justifies the overhead.

If model diversity is unavailable, retain session independence and disclose the limitation.

### 7. Rate Limits and Failures

- On rate limiting or HTTP 429, reduce concurrency and queue excess tasks.
- Resume increasing concurrency only after a clean wave.
- If a model is unavailable, select the closest available model that meets the task requirements.
- On task failure, inspect the failure evidence before retrying.
- Retry in the same session when its context remains useful.
- Change the approach or session when the same failure repeats without meaningful progress.

### 8. Acceptance and Completion

Before marking an implementation batch complete:

1. Inspect the changed files and diff.
2. Run the relevant acceptance command or tests.
3. Check for regressions and unintended file changes.
4. Report the commands executed and their actual outcomes.

If tests cannot run, state why and identify what remains unverified.

Never report a test as passing unless its result was observed.

## Operating Habits

- Resume useful sessions across waves to preserve context.
- Send the full task preamble once per session when supported; subsequent dispatches should contain the new task, scope, constraints, and acceptance criteria.
- Give each batch explicit deliverables and a definition of done.
- Keep tasks small enough to review but large enough to justify dispatch overhead.
- Record failures and relevant evidence before retrying or replacing a session.
- Prefer verified progress over maximizing agent count.

## Respawn Policy

Spawn a replacement when:
- The required model or variant changes and no compatible session exists.
- The current session is unavailable or unusable.
- Repeated attempts fail without meaningful progress.
- A genuinely independent context is required.
- No suitable existing session can perform the task safely.

Otherwise, resume a compatible session when its existing context remains useful.

## Routing Objective

Optimize for successful task completion, correctness, integration cost, latency, and total resource usage.

Do not optimize for session reuse, concurrency, or nominal model strength in isolation.

When routing choices are uncertain, prefer the simplest execution plan that preserves correctness and can be verified.
