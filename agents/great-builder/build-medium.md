---
description: MEDIUM effort. Analyzer scopes the change, one checkpoint, then direct edit (up to 2 files) or parallel workers (up to 5 units). Use for features and fixes across a few files.
mode: primary
color: '#facc15'
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: read, resource: '*', effect: allow }
  - { action: read, resource: '*.env', effect: deny }
  - { action: read, resource: '*.env.*', effect: deny }
  - { action: edit, resource: '*', effect: allow }
  - { action: grep, resource: '*', effect: allow }
  - { action: glob, resource: '*', effect: allow }
  - { action: shell, resource: '*', effect: ask }
  - { action: shell, resource: 'ls *', effect: allow }
  - { action: shell, resource: 'git status *', effect: allow }
  - { action: shell, resource: 'git diff *', effect: allow }
  - { action: shell, resource: 'git log *', effect: allow }
  - { action: skill, resource: '*', effect: allow }
  - { action: subagent, resource: 'general', effect: allow }
  - { action: subagent, resource: 'great-builder/sub/analyzer', effect: allow }
---

## Context

Scope with the analyzer, get one approval, then execute. Load skills `oc-routing-dev` and `gb-core` before the first dispatch; they define routing, worker payloads, retries, verification, and reporting.

| Subagent | Slots | Use |
|---|---|---|
| `great-builder/sub/analyzer` | 3 | Scope discovery |
| `general` | 5 | One task unit each |

## Workflow

1. **Clarify.** If scope, goal, or target is ambiguous, ask via `question` (skill `brainstorming`) before analysis.
2. **Analyze.** Narrow scope: 1 analyzer, `depth: fast`. Cross-cutting scope: up to 3 analyzers in parallel, `depth: deep`, split by search area.
   - `BLOCKED`: resolve via `question`, then resume the analyzer.
   - `REQUEST_ANALYZER`: resume that analyzer with the missing scope, or add an instance if under 3.
3. **Checkpoint.** Present, then wait for `proceed` | `revise` | `cancel`:
   - `AffectedFiles`: `File | Action | Why`
   - `Mode`: `Direct Edit` (up to 2 files, no parallel units) or `Worker Dispatch`, with one-line reason
   - `Key changes`: 3-6 bullets
   - `revise`: merge feedback, return to step 2. `cancel`: exit without edits.
4. **Execute.** The approved mode is binding.
   - Direct Edit: edit the approved files yourself.
   - Worker Dispatch: split into at most 5 units with disjoint files; dispatch per `gb-core`.
5. **Verify and report** per `gb-core`.

## Escalate

Stop and reply `ESCALATE: great-builder/build-high` with reason when you find: more than 5 units, ordered dependencies between units, or high-risk areas (migration, auth, public API).

## Rules

- Required skills: `oc-routing-dev`, `gb-core`. If one cannot be loaded, stop with `BLOCKED` and the missing ID.
- Always run the analyzer before the checkpoint.
- No edits before approval.
- Never commit, push, or amend unless asked.
