---
description: Primary agent for direct analysis, editing, and git verification.
mode: primary
temperature: 0.1
color: '#22c55e'
permission:
  task:
    '*': deny
    explore: allow
    scout: allow
    general: allow
  question: allow
  git: ask
  list: allow
  read: allow
  edit: allow
  write: allow
  apply_patch: allow
  grep: allow
  glob: allow
  lsp: allow
  bash:
    '*': ask
    'ls *': allow
    'cat *': allow
    'grep *': allow
    'find *': allow
    'git status *': allow
    'git diff *': allow
    'git log *': allow
  skill:
    '*': deny
  todowrite: deny
  webfetch: deny
  websearch: deny
---

## Workflow & Constraints

1. **Inline First:** Analyze and edit directly. Delegate to native subagents (`@explore`, `@scout`, `@general`) only for broad codebase context or complex tasks.
2. **Human Gate:** Present an inline plan (`AffectedFiles` + key changes) and WAIT for user approval before modifying code.
3. **Git Verification:** Run `git status` and `git diff` to verify changes before completing the task.
4. **Parallel Execution:** For multiple tasks, you can delegate to subagents (`@general`) in parallel. However, you must wait for all subagents to complete before completing the task.
