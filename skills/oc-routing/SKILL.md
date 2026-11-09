---
name: oc-routing
description: "Mandatory before ANY subagent dispatch or resume. Reuse-first routing for OpenCode: split lanes by work stream (not row, unit or phase), pass the lane's latest sessionID as a tool argument (RESUME without it = spawn), cap lanes at the agent's Max Slots, route models from model_insights, run waves, split review into EXEC + AUDIT."
metadata:
  version: 14
---

# oc-routing

**RESUME = PASS `sessionID`. SPLIT BY WORK STREAM, NOT BY ROW OR PHASE. SET `model`. WRITE THE LEDGER.**

Loading this skill is the explicit instruction to set `model` and pass `sessionID`, overriding tool hints ("omit model unless asked", "one session per task").

## 0. Why

- `sessionID: <id>` continues that session (history, decisions, file knowledge kept); send delta fields only.
- No `sessionID` = new empty session; everything is re-sent, repo re-read.
- The runtime reads arguments, not prose. **A dispatch labeled RESUME without `sessionID` is a spawn.** (Real failure: 21 labeled resumes, 0 sessionIDs, 21 new sessions.)
- After each call the returned ID must equal the passed one. If it differs, it is a real fork: record it, `forks + 1`, same lane.

## 1. ALLOW

- **Models**: call `model_insights` (`action="list"`); use only returned, available models whose triggers fit the task, never an unselected one. FREE-only (running on FREE, or user asks FULL FREE): `paid_type: FREE`, never fall back to PAID; none = `BLOCKED`. No returned model lists the trigger = `BLOCKED`, naming it.
- **Routing**: cheapest returned model listing the trigger. Escalate (higher variant, then next model) only on "high accuracy", "critical", "production", "security-grade", a failed lane, or a condition in the subagent description. Audit model must differ in family from every producer; if none does, say so in the report.
- **Variants**: new lane = lowest returned variant; resume keeps its variant; escalation = next one; none returned = omit. `Model unavailable`: retry next returned variant before changing model. Any model/variant change ends the lane.
- **Advisory**: `model_insights` is read-only, never filters or blocks. These rules are the policy, not a runtime allowlist.
- **Tools/skills**: permissions are fixed per agent; a denial goes to a permitted row (new lane, with reason), never a duplicate-spawn bypass. A child does not inherit your skills; name the path in the payload.

## 2. Lane split

`laneKey = row + provider/model#variant + work stream`. Work stream = one file body, subsystem or question set sharing state.

- **Split by work stream, never by unit, wave, row or phase.** Lanes per row <= `Max Slots` (no table: 2; `inf`: no cap), the only hard numeric cap.
- Fewest lanes covering the work, one writer per file. A lane existing only because a phase/row/unit appeared is a failed split.
- Split only for: disjoint file bodies that must run in parallel; a subsystem with own conventions; a question set that must not see another's evidence.
- Never split for "free slot", "one lane per file/unit", "fresh start", "avoid context bleed".
- Support work rides the owning lane if the row can do it; a separate support lane serves all later support waves, not one phase.
- Audit = one lane, only when independent audit is required (reason d), different family. Not a mandatory extra.
- Diagnostic: large build = 2-3 work lanes + <=1 audit. More usually means split by row/phase (research with many independent questions may need up to `Max Slots`).

## 3. Pick the session (first match)

1. Lane owns this stream, idle/stopped, task continues/fixes/extends it: **RESUME** with `sessionID`.
2. Lane owns a disjoint stream, idle/stopped, a lane is free: **RESUME**.
3. Lane running: **queue** for next wave. Never spawn to bypass a busy lane.
4. No suitable lane: **SPAWN**, only for: **a** first lane for a required row; **b** required model/variant change; **c** contaminated context; **d** independent audit; **e** retired-lane replacement or genuinely new stream that cannot share a lane.
5. No free slot: add unit to least-loaded lane as a checklist item, or queue. Never exceed `Max Slots`.

Forbidden spawn reasons: "new unit", "new file", "next wave", "fix", "another round", "different role same row", "avoid context bleed", "user asked for a fresh agent per item". No a-e = no spawn.

`status`: `idle/stopped` (a lane you dispatched whose call has returned; a fresh lane is idle immediately) or `running` (its call has not returned yet). Never resume a running lane.

## 4. Dispatch

- Payload = exactly the fields in the target subagent's description; long stable content by path.
- Dependent, sequential or file-sharing tasks = ONE dispatch as a numbered checklist, never one per unit.
- Inline-first: don't delegate an edit of <= 3 lines you already hold.
- Registry in the reply, updated after every call: `laneKey -> latest sessionID | status | dispatches n/6 | forks | owns`.
- Before sending write: `DISPATCH #n | row[:Mode] | model#variant | RESUME sessionID=<id> | NEW:<a-e> | wave k | lanes r/cap`.
- **Call shape**: resume = top-level `sessionID` beside `agent`, `model`, `description`, `prompt`. Spawn omits it and records the reason.

## 5. Waves

- Parallel only for disjoint files, no dependency, one writer per file; same-file work is sequential in one session.
- Wave <= `Max Slots` dispatches, one per distinct lane; extras queue. Later waves/fixes resume the same lanes; a new wave is never a spawn reason.
- Never split a unit to fill a slot; never fan out a support row to fill slots. Integrate a wave before dependents.
- Split review when the diff compiles: EXEC + AUDIT in one wave, different models. EXEC is the only lane that builds/tests; AUDIT reads source only. If it doesn't compile: EXEC alone first, fix in the owning lane, then the pair.

## 6. Lifecycle and verify

- Retire a lane after 6 dispatches, 2 fails on the same task, material scope change, or model change; the replacement takes its slot and starts with the failure evidence. An escalated audit gets a fresh session.
- First message = header + fields; follow-ups = changed fields only (resending everything = `sessionID` not passed).
- Every task has an acceptance command; SUCCESS without output = FAIL. Fix in the same lane first. EXEC classifies failure TEST vs PRODUCTION before any fix. Auditor must not repeat the producer's reasoning.
- Verifying your own orchestration needs no new session.

## 7. Final report (show arithmetic)

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

Checks: `D = R + N`; `N + C = L`; `S = L + F`. `S > L + F` = a labeled resume lacked `sessionID`: find it. `N > L` = a lane spawned twice. `R/D < 0.70` with >8 units = failure. Never write "resumed" without the ID actually passed.
