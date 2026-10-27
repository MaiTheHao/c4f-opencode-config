---
name: oc-routing
description: Subagent routing and session orchestration for OpenCode. Use when dispatching, resuming, parallelizing, or auditing subagents.
version: 2
---

# oc-routing

**ROUTE BY FIT. RESUME WHEN USEFUL. SPAWN LAST. COUNT EVERY DISPATCH.**

## Models

Call `allowed_models` once per task. Its table is the only source of truth for
available models, provider, class, price, tier, variants and triggers. Never
route to a model it does not list.

- Pick by the task's primary objective: match the most specific Trigger first;
  use Tier only to break ties.
- Use the lowest Variant that reliably meets the reasoning need. Keep one
  variant per model within a task sequence. Escalating the variant ends the
  sequence and opens a new one — record why.
- Treat a route as a hypothesis and adjust on observed outcomes.
- **FULL FREE** (only when explicitly requested): query once with
  `model_paid_type=FREE` and use only those rows for the whole workflow,
  including retries, audits and follow-ups. Never fall back to a PAID row.
- On an `unpaid` error, drop that route for the rest of the task and re-query
  with `model_paid_type=FREE`.

## State to maintain

Two things live for the whole task, written down — not remembered:

1. **`laneMap`**: `laneKey -> sessionID`, plus one line per session recording
   what it already holds (files touched, decisions made, conventions established).
2. **`dispatchCount`**: dispatches per lane.

`laneKey = model#variant` is a hint for grouping, not proof of identity or
compatibility. The sessionID is the identity.

After every dispatch, record the returned sessionID before doing anything else.
A dispatch whose sessionID is not recorded counts as a spawn you must justify.

## Pre-spawn gate

Before any spawn, answer these in one line. Any hit on 1–2, or a miss on 3,
blocks the spawn:

1. Does a live session already cover this scope, role and model? → continuation.
2. Is the only reason to spawn "new unit" or "another round of edits"? →
   continuation.
3. Is the spawn justified by exactly one of: a different role, a different
   model, isolation from contaminated context, or independent audit? → spawn,
   naming the reason.

Default is continuation. Spawn is the exception and must name its reason.

## Rules

### 1. Batching

Group by objective, not by file. Different files serving one objective are one
dispatch with a numbered checklist. Split when objectives need independent
judgment, when dependencies differ, or when shared mutable state makes
concurrency unsafe.

"Small" = one checklist of roughly seven items or fewer that a single reviewer
would accept as one deliverable. Beyond that, split.

### 2. Session selection

Confirm eligibility first: context relevance, role and scope fit, session state,
no contamination. Then take the first match:

1. **Affinity:** a session with relevant context and compatible history.
2. **Reuse:** a compatible session with the same model and variant.
3. **Tier up:** a suitable session on a stronger variant, when justified.
4. **Spawn:** a new session when none fits, and the gate above permits it.

Affinity and reuse overlap; when they disagree, prefer the session whose
existing context saves more work, and note the trade-off.

Start fresh when independent reasoning is required, prior assumptions are
disproven, context is contaminated, role or scope differs materially, or reuse
would compromise the task.

### 3. Independent audits

The auditor must not repeat the producer's reasoning. Prefer, in order: a
different session, a different model, independent evidence. Reuse a compatible
session that did not produce the changes; spawn only when independent review is
worth the overhead.

"Worth the overhead" means the change is irreversible, touches shared or
critical paths, or the producer's own reasoning was uncertain (an escalation
happened, ambiguity was flagged). Otherwise a non-producing existing session is
enough.

Verification of the orchestrator's own work runs in the orchestrator's lane. It
does not require a new session.

If model diversity is unavailable, keep session independence and say so.

### 4. Concurrency and file safety

Shared mutable state means no two dispatches run concurrently over it. It does
not require separate sessions: sequential work on the same files inside one
session is valid and preferred. One writer at a time per file. Sequence within a
lane; split across lanes only when parallel work is genuinely safe.

## Dispatch habits

- Send the full task preamble once per session. Later dispatches carry only the
  new task, scope, constraints and deliverables.
- Give each batch a clear scope and explicit deliverables.
- Reuse to preserve context; spawn for isolation, a different role, or
  independent reasoning.
- Avoid redundant sessions, extra dispatches and excess concurrency.

## Retirement

A lane retires — its next dispatch becomes a spawn — when any of: six dispatches
reached, scope changes materially, context is contaminated, or its model no
longer fits. Retirement is the only routine path from continuation to spawn
besides the pre-spawn gate.

## Post-task audit

Before declaring the task done, state:

- dispatches vs sessions, and which sessions were redundant;
- the gate reason for every spawn;
- that `laneMap` has no orphaned session;
- any rule bent during the task, and why.

## Objective

Optimize for correctness, context continuity, latency, integration cost and
total resource use. Choose the simplest viable strategy. When two rules
conflict, prefer the one that preserves context continuity and the fewest
sessions.
