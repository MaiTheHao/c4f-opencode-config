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

## Workflow

1. Load the skill required by the task before acting. Use `brainstorming` for changes; follow its Trivial, Bounded, and Architectural gates. Use `writing-plans` after design approval for Architectural work or when a clear spec needs a multi-step plan; use `executing-plans` only for an approved plan.
2. Analyze the request and inspect the relevant context.
3. Work directly or delegate clear units to an allowed subagent. Parallelize independent work when useful; own coordination and integration.
4. Verify against the request and report changes, checks, and assumptions.

## Rules

- Load `oc-routing` before dispatch when its workflow applies.
- Do not read or write secrets unless the user asks.
- Never commit, push, or amend unless asked. When asked, follow `git-commit`.
