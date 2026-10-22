---
name: oc-routing
description: Routing rules for subagent dispatch on opencode-go models - allowed model table, batching, lane choice, resume-first session reuse, parallel waves, file safety, audit separation, respawn. Use whenever dispatching, resuming, or fanning out subagents.
---

# oc-routing

**RESUME FIRST, SPAWN LAST.**

## Models

| Model ID              | Variants            | Cost         | Can take                                                                                  |
| --------------------- | ------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `opencode-go/deepseek-v4.1-flash` | `low` `high` `max`  | 1 | Strongest overall, **prefer it**. Implement, refactor, tests, hard debug, deep research, quant, skeptic. Best on large repeated context. `low` never for debug, deep, quant |
| `opencode-go/mimo-v2.6-flash`     | `low` `high`        | 2            | Light and mechanical work, second choice when DeepSeek is unsuitable or for model diversity |
| `opencode-go/glm-5.3-flash`       | `low` `high`        | 3 | Broad recon, timeline, factual checks, bulk mechanical edits, classify, summarize, validation |
| `*-free`              | per model           | 0            | Only when the user explicitly asks. Quality is unverified                                 |

- Prefix `opencode-go/` is optional, it is highly recommended. Others - `opencode/`, ...
- Variants are listed weak to strong. One default variant per model per run; variant sprawl splits sessions and kills reuse.

`laneKey` = `model#variant`. Role is not part of it: every role on the same laneKey shares the same sessions.

## Rules

1. **Batch first.** Tasks that share files, a theme, or a dependency go into one dispatch as a numbered checklist. Pack small independent tasks together. N tasks never mean N sessions.
2. **Parallel wave.** Send all independent batches in one wave, one lane per batch. No upper limit on width.
3. **Pick a session, first match:**
  1. Affinity: a free session on the same laneKey that already worked these files or this theme -> RESUME.
  2. Reuse: any free session on the same laneKey -> RESUME.
  3. Tier-up: a free session on the same model with a stronger variant the role allows -> RESUME. Never a weaker one.
  4. Spawn: nothing above fits -> spawn a new session.
4. **Fan-out.** Many batches of one role: spread them round-robin over free sessions so none starves.
5. **File safety.** Two sessions never touch the same file at the same time. A batch that needs a file held by a running session waits for it, then resumes that session.
6. **Audit.** An auditor never runs in the session that produced the finding and should not run on the producer's model. "Fresh" means fresh relative to the producer: RESUME any free session that did not produce it. Spawn only when every free session did. If the only candidate is the producer's model, use it only when no other model exists.
7. **Rate limit or 429.** Narrow the wave, queue the overflow, widen again after one clean wave.
8. **Model unavailable.** Use another model from the table with the closest traits.

## Habits

- The next wave resumes the previous wave's sessions.
- Fix a failed or rejected task in the same session first.
- Send the full preamble once per session, then only the delta (task, files or scope, acceptance command or required evidence).
- Run the acceptance command before calling an editing batch done.

## Respawn only when

- The laneKey must change.
- The same task fails twice: brief the replacement with the failure evidence.

Any other reason -> resume. Never spawn for a "clean context". Never choose resume or spawn from cost, cache, or token estimates.