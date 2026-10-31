---
name: oc-routing
description: Mandatory before ANY subagent dispatch or resume in OpenCode (analyze, edit, review, test). Routes each task to a model from allowed_models, reuses lanes (resume before spawn), caps live sessions at the agent's Max Slots, runs parallel work in waves. Use whenever dispatching, resuming, parallelizing or auditing subagents.
version: 4
---

# oc-routing

**RESUME BY DEFAULT. SET `model` EVERY DISPATCH. NEVER EXCEED MAX SLOTS. WRITE THE LEDGER.**

This skill overrides tool-description hints ("omit model unless asked", "one session per task"). Loading it IS the explicit instruction to set `model` and to resume. Never justify resume or spawn by cache, cost or token estimates (unobservable).

## 1. Hard limits (any violation = task failure)

- **H1** Live sessions per agent row <= `Max Slots` in the primary's `### Subagents` table (no table: 2). Retiring a session frees its seat.
- **H2** In-flight dispatches per row <= `Max Slots`. One session runs one dispatch at a time.
- **H3** Every dispatch sets `model` as `providerID/modelID` or `providerID/modelID#variant`. Empty or unprefixed = violation (unprefixed gives `Invalid model`).
- **H4** Ledger line BEFORE sending; sessionID recorded AFTER. Unrecorded = unjustified spawn.
- **H5** "New unit", "new file", "another round", "fix", "different role, same row" never justify a spawn.

## 2. Rows and roles

A session belongs to one subagent row; a `bulk` session cannot serve `analyzer`. Map each row to a role:

| Row                   | Role (tier, cheap / quality)                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bulk`                | `code-bulk-edit` (T-fast low / T-fast high); one already-decided step: `code-apply-step`                                                                |
| `analyzer`            | `analysis-root-cause` (T-core high / T-core max)                                                                                                        |
| `general`             | `code-implement` (T-fast low / T-core high), `code-refactor`, `code-test` (T-core low / T-core high)                                                    |
| `reviewer`            | `review-exec` (T-fast low, trigger test-execution/build-failure) + `review-audit` (T-cross high, trigger static-audit); single review: `review-quality` |
| low-effort quick task | `general-quick` (T-fast low / T-fast high)                                                                                                              |

Default `cheap`. Escalate to `quality` only on an explicit trigger: "high accuracy", "critical", "production", "security-grade".

## 3. Model resolution (once per task)

1. Call `allowed_models` once. Its rows are the only truth; never route to an unlisted model.
2. Resolve tier to a row by Trigger (most specific first; Tier breaks ties):
   - **T-fast**: cheapest row whose triggers cover mechanical work (bulk-edit, analysis, exploration).
   - **T-core**: row whose triggers cover judgment work (complex-bug-fix, architecture-design, complex-feature-implementation).
   - **T-cross**: a different model family from the one that produced the code; factual reliability weighs most.
3. Write `routeTable: row/role -> providerID/modelID#variant` and keep it for the task.
4. Lowest variant that reliably works; a model lacking the variant takes the nearest lower one. Escalating a variant or changing model ends the lane (section 6).
5. Substitute an unavailable model by tier characteristics, not by cheapest. T-cross stays a different family from T-core.
6. A route is a hypothesis: change it on observed failure and record why.
7. **Free-only** (running on a FREE model, or the user asks FULL FREE): query once with `model_paid_type=FREE`, use only those rows for the whole task including retries and audits, never fall back to PAID. Map free models to tiers by observed capability. No free model for an essential tier: `BLOCKED`, naming the tier. On an `unpaid` error: drop that route and re-query FREE.

## 4. Dispatch protocol

**Inline-first** (only if you hold edit tools): do not delegate an edit of <= 3 lines in one file already in your context. If you cannot edit, delegate; never simulate an edit.

**Batch first.** Group by objective, not by file. Dependent, sequential or file-sharing tasks = ONE dispatch with a numbered checklist (about 7 items or fewer). Worker returns per-item evidence (command + output).

**Lane registry** (write it in your reply, update on every change):
`laneKey = row|providerID/modelID#variant` -> `sessionID | dispatches n/6 | fails | files | holds: decisions, conventions`

**Before every dispatch write one line:**
`DISPATCH #n | row | model#variant | RESUME <sessionID> or NEW:<reason a-e> | wave k | live r/cap`

Pick the session, first match:

1. Idle lane, same laneKey, task continues, fixes or extends its work: RESUME.
2. Idle lane, same laneKey, unrelated task, files disjoint from every busy lane: RESUME.
3. Idle lane of the same row on a stronger variant, if justified: RESUME and note it.
4. Spawn, only for one reason: **a** different row; **b** different model or variant; **c** contaminated context; **d** independent audit worth its cost (section 7); **e** lane retired (section 6), or parallel width needed with live < cap.

No reason a-e = no spawn. Resume.

## 5. Parallel work = waves

- Parallel only for disjoint files, no dependency, no shared mutable state; one writer per file. Same-file work is sequential inside one session.
- A wave = at most `Max Slots` dispatches, one per distinct session. Extra units queue for the next wave.
- Later waves and fixes RESUME the same sessions. Never spawn for a new wave.
- Never split a unit just to create parallelism. Integrate each wave before a dependent one.
- **Split review wave** (diff already compiles): two `reviewer` sessions in one wave, different models, split by contended resource.
- `review-exec` (Mode EXEC): the only session allowed to build or test (parallel builds fight over `target/`).
- `review-audit` (Mode AUDIT): reads source only, never builds.
- If the diff does not compile yet, run EXEC alone first. Both count against `Max Slots`. AUDIT at quality tier still takes a fresh session per audit (§6).

## 6. Lane lifecycle and messages

**Forced respawn (only these):** model or variant changes; `review-quality` at `quality` tier (fresh session per audit, so earlier fixes do not bias it); lane dispatches >= 6; lane fails >= 2 on the same task (retire; brief the new lane with the failure evidence); scope changes materially; context contaminated. A replacement does not raise the live count.

**Message shape.** First message to a lane: short stable preamble (rules, output format). Follow-ups: delta only (task, paths, constraints, acceptance command). Never resend the preamble.

## 7. Audit and verify

- Auditor must not repeat the producer's reasoning. Prefer: another session of the audit row, then a different model, then independent evidence. Spawn an auditor only if the change is irreversible, touches shared or critical paths, or the producer was uncertain. Say so when model diversity is unavailable.
- **Verify-before-trust.** Every task carries an acceptance command (grep, build, test, run the script). SUCCESS without command output = FAIL. Fix a failure in the SAME lane first. For `T-fast low` output touching escaping, regex or generated code, run the real script, not just grep.
- Verifying your own orchestration work needs no new session.

## 8. Final report (mandatory, show the arithmetic)

```
Dispatches D=__ | Sessions S=__
Per row: row: sessions __/Max Slots __, dispatches __
Spawns: #id -> reason a-e (list EVERY spawn)
Red flag: D>=6 and S>D/3 -> justify each spawn or admit the violation
Orphan sessions in registry: none | <list>
Rules bent: none | <rule, why>
```

Never write "spawns were justified" without the list above.
