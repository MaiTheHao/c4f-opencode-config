---
name: oc-routing-dev
description: Picks the model and reusable session lane for DEV subagents (implement, refactor, test, bulk edit, debug, light review) on DeepSeek and GLM, scaling from a few to many parallel subagents. Use whenever dispatching, choosing a model for, or resuming a subagent that reads or edits project files. Not for file-free research.
---

# Dev Routing: Model + Lane

**RESUME FIRST, SPAWN LAST.** This skill decides only the model and the session. Send model IDs with prefix `opencode-go/` (e.g. `opencode-go/deepseek-v4.1-flash#low`); without it the call fails with `Invalid model`.

## Models

| Role                  | cheap                 | quality               | Variants     | Notes                                                                                                                                                          |
| --------------------- | --------------------- | --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-implement`      | `deepseek-v4.1-flash` | same                  | `low` `high` | Default workhorse: implement, refactor, tests. Best for large repeated cached context. DeepSeek price doubles Mon-Fri 01-04 and 06-10 UTC: defer heavy batches |
| `code-bulk`           | `glm-5.3-flash`       | same                  | `low` `high` | Mechanical edits at scale, applying decided steps. Huge repeated-context batches go to `code-implement`                                                        |
| `analysis-root-cause` | `deepseek-v4.1-flash` | same                  | `high` `max` | Hard debugging. Never `low`; `max` only at `quality`                                                                                                           |
| `code-review`         | `glm-5.3-flash`       | `deepseek-v4.1-flash` | `low` `high` | Light diff check against the acceptance command; no fresh session needed                                                                                       |
| `general-quick`       | `glm-5.3-flash`       | same                  | `low` `high` | Classify, summarize, small low-risk tasks                                                                                                                      |

- Default `cheap`. Use `quality` only on "high accuracy", "critical", "production", "security-grade".
- The orchestrator picks the variant from the list: low for `cheap`, high for `quality`. Keep one default variant per model per run; variant sprawl splits pools and kills reuse.
- Aliases: `code` `refactor` `test`→`code-implement`; `code-cheap` `bulk-edit`→`code-bulk`; `analyze`→`analysis-root-cause`; `review`→`code-review`; `quick`→`general-quick`.
- Model unavailable: use the other model with the same role traits.

## Lanes

laneKey = `model#variant`. Role is excluded: the same laneKey is one pool.
Registry: `laneKey | session | idle/busy | dispatches | fails | owns (files)`.
Defaults, overridable per run: `CAP`=6 sessions per laneKey, `RETIRE_AT`=6 dispatches, `BATCH`=5 tasks per dispatch.

1. **Batch first.** Put tasks that share files or depend on each other in one dispatch as a numbered checklist. Pack small independent tasks up to `BATCH`. N tasks never mean N sessions.
2. **Size by batch count B.** B ≤ 3: one lane per batch. B ≤ CAP: one lane per batch, spawn only the missing. B > CAP: `CAP` lanes pull batches from a queue and are resumed the moment they free.
3. **Pick a session, first match:**
   1. Affinity: idle, same laneKey, already owns the batch's files → RESUME.
   2. Reuse: idle, same laneKey, files not owned by a busy lane → RESUME.
   3. Tier-up: idle session of a stronger allowed laneKey for this role → RESUME. Never a weaker one; keep the restrictions in Models.
   4. Grow: fewer than `CAP` sessions → spawn and register.
   5. Queue: all busy → queue; RESUME the first lane that frees. Never exceed `CAP`.
4. **File safety.** Two lanes never touch the same file at once. A batch needing a busy lane's file queues behind that lane. Release ownership after the acceptance command passes.
5. **Rate limit or 429.** Halve `CAP`, queue the overflow, restore after one clean wave.

## Habits

- The next wave resumes the previous wave's sessions.
- Fix a failed task in the same session first.
- Send the full preamble once per session, then only the delta (task, files, acceptance command).
- Run the acceptance command before marking a batch done.

## Respawn only when

- The laneKey must change.
- Dispatches reach `RETIRE_AT`: the replacement takes the same slot and gets a short carry-over summary.
- The same task fails twice: brief the replacement with the failure evidence.

Never spawn for a "clean context". Never choose resume or spawn from cost, cache, or token estimates.

## Free-tier mode

On a FREE model, dispatch only to free models, map them to roles by capability, and apply Lanes unchanged. If a role has no free model, stop and report `BLOCKED` with the missing role.
