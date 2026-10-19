---
name: gb-core
description: Shared dispatch, worker, verify, and report protocol for the great-builder agents great-builder/build-medium and great-builder/build-high. Use when dispatching analyzers, workers, or reviewers, collecting their results, or verifying and reporting a build.
---

# Great Builder Core

Model and session choice belong to `oc-routing-dev`. This skill covers everything else in a dispatch.

## Dispatch

- Send models as `opencode-go/<model>#<variant>` per `oc-routing-dev`; resume idle sessions before spawning.
- If the route cannot be applied, stop with `BLOCKED` and the reason.
- Subagents never dispatch subagents.

| Child | Routing role |
|---|---|
| analyzer `fast` | `general-quick` |
| analyzer `deep` | `analysis-root-cause` |
| worker (`general`) | `code-implement`; `code-bulk` when steps are fully decided and mechanical |
| reviewer | `code-review` |

Effort and model tier are independent. Use `quality` only on the user's explicit "critical", "production", or "security-grade" signals.

## Worker payload

Send only the unit's `Files`, `Spec`, `Verify`, plus plan-level `Constraints`, `Conventions`, and the relevant `Acceptance` items. Tell the worker to touch only its `Files` and return `SUCCESS | FAILED | NEEDS_CLARIFICATION` with a per-file summary. No orchestration metadata or task IDs.

## Parallelism

At most 5 concurrent workers. Units never share a file: merge them or run them in sequence. A wave finishes only when every unit returns `SUCCESS`.

## Results

- `FAILED`: resume the same worker with the failure evidence. After 2 retries, halt with blocking questions.
- `NEEDS_CLARIFICATION`: workers cannot call `question`; ask the user yourself. If the answer stays within the unit's `Files` and `Spec`, resume the worker. If it changes files, units, or scope, stop and return to the checkpoint.

## Verify

1. Run `git status` and `git diff` yourself.
2. Compare changed files with the approved `AffectedFiles`; check each unit's `Verify` and `Acceptance` from worker reports.
3. For out-of-scope, missing, or unmet items, resume the matching worker with a corrective task, then re-verify.

## Report

Table `File | Action | Unit | Status`, then each acceptance criterion with its status. Report done only when all units are `SUCCESS` and the diff is clean: only approved, explained changes, with no unexplained regressions.
