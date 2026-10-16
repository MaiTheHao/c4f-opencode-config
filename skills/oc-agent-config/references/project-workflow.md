# Project Workflow and Approval Standard

**Load this when** authoring workflow/approval gates, verification/reporting behavior, or research budgets. All rules here are `PROJECT`.

## Profiles

| Profile | Direct work | Delegated work | Mutation policy |
|---|---|---|---|
| Builder normal | Questions, permitted skills, synthesis | Analysis, implementation, verification | Primary performs no direct edits |
| Planner | Read/search and approved plan-artifact writes | Analysis and review | Source/config/tests remain read-only |
| Research fast | Web research and synthesis | None | No writes |
| Research normal | Orchestration and synthesis | Scout/deep/specialists/audit | No writes across the research team |
| Research extra | Orchestration, evidence-gap tracking | Bounded concurrent research waves | No writes across the research team |

"Read-only planner" means read-only project implementation with a declared plan-artifact exception. Validate that `writing-plans` selects a path inside the allowed artifact root; if it does not, report the conflict before writing. Do not alter the skill, widen permissions, or move the plan silently.

## Human checkpoint

For implementation mutations, present `AffectedFiles: File | Action | Why`, 3–6 key-change bullets, verification criteria, and material unresolved questions. Use canonical decisions `proceed | revise | cancel`. An existing `approve` maps to `proceed`; `re-run` / `re-analyze` maps to `revise` and renewed analysis. Cancellation has an explicit exit path.

Recognize explicit authorization already given for the same concrete scope; do not ask repeatedly without a material change. A proposed expansion of affected files or behavior returns to the checkpoint. Read-only research does not require this implementation gate.

A planner may create/update a draft in its declared artifact root as part of an authorized planning request; approval governs marking it approved and handing it to implementation. This is the explicit exception to the former blanket "gate before every mutation" wording.

## Verification and reporting

Capture the initial working state. Verify the actual resulting changes against approved scope, preserve unrelated existing user changes, and report tests/checks with their results. "Clean verification diff" means explained, in-scope changes and no unexplained regressions; it does not mean an empty diff or pristine repository.

A builder MUST handle each implementation result, run final scope/behavior checks, and distinguish implemented, verified, blocked, and unverified work. NEVER commit, push, amend, or publish without explicit authorization for that action.

Research MUST distinguish sourced facts, inference, contradiction, and uncertainty. A validator may corroborate a primary source using a separate retrieval/check; forcing an entirely disjoint source set must not exclude the only authoritative evidence. Source provenance and method independence matter more than artificial source diversity.

## Research budgets

Preserve evidence-saturation stopping criteria, but define a finite operational escape condition for every research run: a selected time, cost, call, or wave budget, plus cancellation and repeated-no-progress handling. Exhaustion produces a qualified synthesis with unresolved gaps, never an assertion of completeness.

For extra research, retain the supplied run-wide concurrent ceiling of 16. Replace an `UNLIMITED` concurrent slot value in future agent revisions with a numeric value no higher than the global ceiling. An optional uncapped *total* dispatch count is a separate policy and still requires an operational stopping budget. The supplied scout table cap of 8 and first wave of 5 are compatible; describe them as maximum capacity and actual initial dispatch respectively.

For normal research, the deep phase can involve 5 deep + 1 timeline + 1 quant simultaneously. Declare its intended global cap explicitly during migration instead of assuming a cap of 5 covers all roles. Do not change coverage or model-cost policy as an incidental formatting fix.
