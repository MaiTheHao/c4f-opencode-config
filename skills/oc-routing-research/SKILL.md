---
name: oc-routing-research
description: Picks the model and reusable session lane for read-only RESEARCH subagents (recon, deep dives, timelines, quantitative audits, skeptic and validation review) on DeepSeek and GLM, built for very large numbers of parallel subagents. Use whenever dispatching, choosing a model for, or resuming a research subagent that never edits project files.
---

# Research Routing: Model + Lane

**RESUME FIRST, SPAWN LAST.** Researchers are read-only; findings return in the message. This skill decides only the model and the session. One level only, no cheap/quality split. Send model IDs with prefix `opencode-go/` (e.g. `opencode-go/glm-5.3-flash#low`); without it the call fails with `Invalid model`.

## Models

| Role | Model | Variants | Notes |
|---|---|---|---|
| `research-scout` | `glm-5.3-flash` | `low` `high` | Broad recon, many sub-questions in parallel. Strongest factual reliability |
| `research-timeline` | `glm-5.3-flash` | `low` `high` | Historical and temporal evolution |
| `general-quick` | `glm-5.3-flash` | `low` `high` | Classify, summarize, small tasks |
| `research-deep` | `deepseek-v4.1-flash` | `high` `max` | One sub-question at high rigor. Never `low` |
| `analysis-quant` | `deepseek-v4.1-flash` | `high` `max` | Numbers and benchmark audits. Never `low` |
| `review-skeptic` | `deepseek-v4.1-flash` | `high` | Adversarial claim-challenge. Producer used DeepSeek → `glm-5.3-flash#high` |
| `review-validation` | `glm-5.3-flash` | `high` | Contradiction cross-check. Producer used GLM → `deepseek-v4.1-flash#high` |

- The orchestrator picks the variant from the list. Keep one default variant per model per run; variant sprawl splits pools and kills reuse.
- DeepSeek price doubles Mon-Fri 01-04 and 06-10 UTC: defer heavy DeepSeek batches.
- Aliases: `quant`→`analysis-quant`, `skeptic`→`review-skeptic`, `validation`→`review-validation`, `timeline`→`research-timeline`, `quick`→`general-quick`.
- Model unavailable: use the other model with the same role traits.

## Lanes

laneKey = `model#variant`. Role is excluded: `research-scout` and `research-timeline` on `glm-5.3-flash#low` share one pool.
Registry: `laneKey | session | idle/busy | dispatches | fails | topics`. Drop retired sessions and keep topics as short tags.
Defaults, overridable per run: `CAP`=10 sessions per laneKey (read-only, so no file conflicts), `RETIRE_AT`=6 dispatches, `BATCH`=5 sub-questions per dispatch.

1. **Batch first.** Group related sub-questions (same theme, source set, or building on each other) into one dispatch as a numbered checklist, up to `BATCH`. N sub-questions never mean N sessions.
2. **Size by batch count B.** B ≤ 3: one lane per batch. B ≤ CAP: one lane per batch, spawn only the missing. B > CAP: `CAP` lanes pull batches from a queue and are resumed the moment they free.
3. **Pick a session, first match:**
   1. Affinity: idle, same laneKey, already worked this theme → RESUME.
   2. Reuse: any idle session of the same laneKey → RESUME.
   3. Tier-up: idle session of a stronger allowed laneKey for this role → RESUME. Never a weaker one; never `low` for deep or quant.
   4. Grow: fewer than `CAP` sessions → spawn and register.
   5. Queue: all busy → queue; RESUME the first lane that frees. Never exceed `CAP`.
4. **Fan-out.** For many batches of one role, round-robin over idle lanes so none starves.
5. **Reviewers.** Never review a finding in the session that produced it. Use the model in Models and RESUME any idle reviewer lane that did not produce that finding; if every idle lane did, Grow or Queue.
6. **Rate limit or 429.** Halve `CAP`, queue the overflow, restore after one clean wave.

## Habits

- The next wave resumes the previous wave's sessions.
- Fix an incomplete or rejected finding in the same session first.
- Send the full preamble once per session, then only the delta (question, scope, required evidence).

## Respawn only when

- The laneKey must change.
- Dispatches reach `RETIRE_AT`: the replacement takes the same slot and gets a short carry-over summary.
- The same task fails twice: brief the replacement with the failure evidence.

Never spawn for a "clean context". Never choose resume or spawn from cost, cache, or token estimates.

## Free-tier mode

On a FREE model, dispatch only to free models, map them to roles by capability (strong reasoning → deep, quant, skeptic; fast → scout, timeline, quick, validation), and apply Lanes unchanged. Reviewers still differ from the producer when 2+ free models exist. If a role has no free model, stop and report `BLOCKED` with the missing role.