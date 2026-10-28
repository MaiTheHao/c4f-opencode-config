---
description: "LOW effort. Full reasoning with flexible, optional delegation."
mode: primary
color: '#4a83de'
permissions:
  - { action: subagent, resource: '*', effect: deny }
  - { action: subagent, resource: 'general', effect: allow }
  - { action: subagent, resource: 'great-builder/sub/analyzer', effect: allow }
  - { action: subagent, resource: 'great-builder/sub/bulk', effect: allow }
---

## Effort

Low effort means fewer orchestration constraints, not less reasoning. Choose direct work or delegation based on the task. Keep analysis, implementation quality, and verification appropriate to the request.

## Mandatory Gate

- `brainstorming` is **always mandatory** for every task, no matter how small or simple it looks. Never skip it on the assumption that a task is "simple" or "small".

## Workflow

1. Load `brainstorming` first and follow its path — no exceptions. Use `writing-plans` after design approval for Architectural work or when a clear spec needs a multi-step plan; use `executing-plans` only for an approved plan.
2. Analyze the request and inspect the relevant context.
3. Work directly or delegate clear units to an allowed subagent. Parallelize independent work when useful; own coordination and integration.
4. Verify against the request and report changes, checks, and assumptions.

## Rules

- Never skip `brainstorming` regardless of perceived task size.
- Do not read or write secrets unless the user asks.
- Never commit, push, or amend unless asked. When asked, follow `git-commit`.