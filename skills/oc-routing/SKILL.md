---
name: oc-routing
description: "Mandatory before ANY subagent dispatch or resume. Reuse-first routing for OpenCode: split lanes by work stream (not row, unit or phase), pass the lane's latest sessionID as a tool argument (a RESUME without it is a spawn), cap lanes at the agent's Max Slots, route models from model_insights, run waves, and split review into EXEC + AUDIT. Use before dispatching, resuming, parallelizing or auditing subagents."
metadata:
  version: 12
---

# oc-routing

**RESUME = PASS `sessionID`. SPLIT BY WORK STREAM, NOT BY ROW OR PHASE. SET `model`. WRITE THE LEDGER.**

Loading this skill is the explicit instruction to set `model` and pass `sessionID`, overriding tool hints ("omit model unless asked", "one session per task").

## 0. Why

`subagent` has two modes, selected by one argument:

- `sessionID: <id>` continues that session: history, decisions and file knowledge survive. Send delta fields only.
- no `sessionID` creates a new session with empty context: everything is re-sent and the repo is re-read.

Prose does nothing; the runtime reads arguments. **A dispatch labeled RESUME without `sessionID` is a spawn.** Real failure: 21 labeled resumes, zero sessionIDs, 21 new sessions. After each call, the returned ID must equal the passed one; if it differs with one passed, that is a real fork (record it, `forks + 1`, same lane).

## 1. ALLOW

- **Models**: call `model_insights` (`action="list"`) and use only returned, currently available models whose triggers fit the task; never an unselected model. FREE-only (running on FREE, or user asks FULL FREE): `paid_type: FREE`, never fall back to PAID; no free model = `BLOCKED`. No returned model lists the trigger = `BLOCKED`, naming it.
- **Routing**: cheapest returned model listing the trigger. Escalate (higher variant, then next model) only on "high accuracy", "critical", "production", "security-grade", a failed lane, or a condition in the subagent description. Audit models must differ in family from every producer; none differs: say so in the report.
- **Variants**: a new lane takes the lowest returned variant, a resume keeps its variant, escalation moves to the next one. None returned: omit. `Model unavailable`: retry the next returned variant before changing model. A model/variant change ends the lane.
- **Advisory boundary**: `model_insights` is read-only; it never filters or blocks models. These rules are the routing policy, not a runtime-enforced allowlist.
- **Tools and skills**: permissions are fixed per agent; a denial is routed to a permitted row (new lane, with a reason), never bypassed by a duplicate spawn. A child does not inherit your skills; name the path in the payload.

## 2. Lane split

`laneKey = row + providerID/modelID#variant + work stream`. A work stream is one file body, subsystem or question set that shares state.

- **Split by work stream, never by unit, wave, row or phase.** Lanes per row <= `Max Slots` (no table: 2; `inf`: no cap) — the only hard numeric cap.
- Fewest lanes that cover the work with one writer per file. A lane that exists only because a phase, row or unit appeared is a failed split.
- Split for disjoint file bodies that must run in parallel, a subsystem with its own conventions, or a question set that must not see another's evidence.
- Do not split for "free slot", "one lane per file/unit", "fresh start", "avoid context bleed".
- Support work rides the owning lane when the row can do it; a separate support lane serves every later support wave, not one phase.
- An audit is one lane, only when an independent audit is required (reason d), on a different family. Not a mandatory extra.
- Diagnostic: a large build usually lands at 2-3 work lanes + at most 1 audit. More usually means splitting by row or phase; a research goal with many independent questions may need more, up to `Max Slots`.

## 3. Pick the session (first match)

1. A lane owns this stream, is idle/stopped, and the task continues/fixes/extends it: **RESUME** with `sessionID`.
2. A lane owns a disjoint stream, is idle/stopped, and a lane is free: **RESUME**.
3. The lane is running: **queue** for the next wave. Never spawn to bypass a busy lane.
4. No suitable lane, **SPAWN**, only for **a** first lane for a required row; **b** required model/variant change; **c** contaminated context; **d** independent audit; **e** retired-lane replacement or a genuinely new stream that cannot share a lane.
5. No free slot: put the unit on the least-loaded lane as a checklist item, or queue it. Do not exceed `Max Slots`.

Forbidden reasons: "new unit", "new file", "next wave", "fix", "another round", "different role same row", "avoid context bleed", "the user asked for a fresh agent per item". No a-e = no spawn.

`status` = `idle/stopped` (has `time.idle`, absent from the active/running set; a fresh lane is idle immediately) or `running`. Never resume a running lane.

## 4. Dispatch

- Payload = the fields in the target subagent's description; add nothing. Long stable content goes by path.
- Dependent, sequential or file-sharing tasks = ONE dispatch as a numbered checklist. Never one dispatch per unit.
- Inline-first: do not delegate an edit of <= 3 lines you already hold.
- Registry in the reply, updated after every call: `laneKey -> latest sessionID | status | dispatches n/6 | forks | owns`.
- Before sending, write: `DISPATCH #n | row[:Mode] | model#variant | RESUME sessionID=<id> | NEW:<a-e> | wave k | lanes r/cap`.
- **Tool call shape**: a resume puts `sessionID` as a top-level argument beside `agent`, `model`, `description`, `prompt`. A spawn omits it and records the reason.

## 5. Waves

- Parallel only for disjoint files, no dependency, one writer per file; same-file work is sequential in one session.
- A wave <= `Max Slots` dispatches, one per distinct lane; extra units queue. Later waves and fixes resume the same lanes; a new wave is never a spawn reason.
- Never split a unit to fill a slot. Integrate a wave before dependents.
- Do not fan out a support row to fill slots.
- Split review when the diff compiles: EXEC + AUDIT in one wave, different models. EXEC is the only lane that builds/tests; AUDIT reads source only. If it does not compile, EXEC alone first, fix in the owning lane, then the pair.

## 6. Lifecycle and verify

- Retire a lane after 6 dispatches, 2 fails on the same task, material scope change, or model change; a replacement takes its slot and starts with the failure evidence. An escalated audit gets a fresh session.
- First message = header + fields; follow-ups = changed fields only. If you need to resend everything, you did not pass `sessionID`.
- Every task has an acceptance command; SUCCESS without output = FAIL. Fix in the same lane first. EXEC classifies a failure TEST vs PRODUCTION before any fix. An auditor must not repeat the producer's reasoning.
- Verifying your own orchestration needs no new session.

## 7. Final report (show the arithmetic)

`D`=dispatch lines, `R`=with `sessionID`, `N`=without (spawns), `C`=carried-over lanes resumed, `L`=lanes opened, `S`=distinct IDs seen, `F`=real forks.

```
Dispatches D=__ | Resumes R=__ | Spawns N=__ | Carried C=__ | Lanes L=__ | Sessions S=__ | Forks F=__
Reuse R/D = __ (target >= 0.70 when units > 8)
Lanes by row: __/Max Slots __
Work streams: __ -> lane (one line each)
Spawns: #dispatch -> reason a-e | lane
Forks: lane -> old ID -> latest ID | none
Resume failures: none | #dispatch -> reason (omitted sessionID, stale ID, not found)
Rules bent: none | <rule, why>
```

Checks: `D = R + N`; `N + C = L`; `S = L + F`. `S > L + F` = a labeled resume did not pass `sessionID`: find it. `N > L` = a lane spawned twice. `R/D < 0.70` with >8 units is a failure. Never write "resumed" without the ID actually passed.
