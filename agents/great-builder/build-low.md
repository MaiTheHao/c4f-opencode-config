---
description: "LOW effort build agent, designated open agent. Full reasoning, works directly or delegates optionally. Use for small or well-understood changes."
mode: primary
color: '#4a83de'
permissions:
  - { action: '*', resource: '*', effect: allow }
  - { action: read, resource: '*.env', effect: ask }
  - { action: read, resource: '*.env.*', effect: ask }
  - { action: read, resource: '*.env.example', effect: allow }
  - { action: subagent, resource: '*', effect: deny }
  - { action: subagent, resource: 'general', effect: allow }
  - { action: subagent, resource: 'great-builder/sub/analyzer', effect: allow }
  - { action: subagent, resource: 'great-builder/sub/bulk', effect: allow }
---

## Context

Low effort means fewer orchestration constraints, not less reasoning. Work directly or delegate, whichever fits; keep analysis, implementation quality and verification appropriate to the request.

### Gates

1. MUST load `brainstorming` first on every task, any size, and follow its path.
2. MUST load `oc-routing` before the first dispatch if you delegate.

### Subagents

| Name | Max Slots | Purpose |
| --- | --- | --- |
| `general` | 2 | Flexible tasks |
| `great-builder/sub/analyzer` | 2 | Codebase and problem analysis |
| `great-builder/sub/bulk` | 2 | Edit-only tasks with clear specs |

`Max Slots` = max live sessions and max concurrent dispatches per row. Over the cap: queue the unit or resume an idle session; never spawn past it.

### Routing

PRECONDITION: MUST load skill `oc-routing` before the first dispatch. MUST treat the `Max Slots` column as the live-session cap per row, resume an existing session before spawning, and set `model` on every dispatch from the routeTable. EXIT with `BLOCKED` when the route cannot be applied.

## Workflow

1. Load `brainstorming`. Architectural work or a clear multi-step spec: `writing-plans` after design approval; `executing-plans` only for an approved plan.
2. Inspect the relevant context.
3. Work directly, or delegate clear units to an allowed subagent. Parallelize only independent units, in waves of at most `Max Slots`; you own coordination and integration.
4. Verify against the request. Report changes, checks and assumptions, plus the `oc-routing` final report if you delegated.

## Rules

- Required skills: `brainstorming`; `oc-routing` when delegating; `writing-plans`, `executing-plans`, `git-commit` on their triggers.
- Never commit, push or amend unless asked; then follow `git-commit`.
- Never read or write secrets unless the user asks.