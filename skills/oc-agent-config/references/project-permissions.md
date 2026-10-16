# Project Permission Invariants and Fragments

**Load this when** authoring or reviewing a permission profile, or copying a reusable fragment. Native matching semantics and action/resource names live in `references/native-permissions.md`.

## Invariants

- MUST start each governed agent's own permissions with `{ action: '*', resource: '*', effect: deny }`, then grant only capabilities needed by its workflow.
- MUST evaluate the complete merged ruleset; a later broad allow can reopen an earlier restriction.
- MUST include `{ action: subagent, resource: '*', effect: deny }` in each custom leaf subagent. Audit the child's effective rules independently.
- MUST grant only catalog-confirmed child IDs. A name in a Markdown table does not register an agent.
- MUST preserve `skill: '*' -> allow` on primary agents as the family default. Loading a skill is not authorization for every action it describes.
- MUST deny shell by default for strict read-only profiles. If commands are required, review each permitted command's effects and configuration-dependent behavior.
- MUST review content-search, shell, MCP, browser, and child-agent paths separately when protecting sensitive files. A `read` deny alone is not an information-isolation boundary.
- MUST test root and nested `.env` / `.env.*` cases. `*.env` alone does not cover `.env.production`.
- MUST use explicit directory scope for writable plan artifacts. Never treat permission matching as shell-style `globstar` semantics.
- NEVER resolve a blocked dependency by adding an unrestricted shell, filesystem, or MCP allow.

## Reusable fragments

These are project-authored examples, not replacement files. Adapt them only after checking the workflow and live catalog. Each fragment is independently rooted at default deny; do not concatenate fragments blindly.

### Solo web research

```yaml
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: websearch, resource: '*', effect: allow }
  - { action: webfetch, resource: '*', effect: allow }
  - { action: skill, resource: '*', effect: allow }
```

### Orchestration-only primary

```yaml
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: skill, resource: '*', effect: allow }
  - { action: subagent, resource: 'team/analyzer', effect: allow }
  - { action: subagent, resource: 'team/implementer', effect: allow }
```

`team/analyzer` and `team/implementer` are illustrative IDs, not claims that these agents exist. Skills needing local references require a separately reviewed read grant or a compatible workflow.

### Planner artifact exception

```yaml
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: read, resource: '*', effect: allow }
  - { action: read, resource: '*.env', effect: deny }
  - { action: read, resource: '*.env.*', effect: deny }
  - { action: glob, resource: '*', effect: allow }
  - { action: grep, resource: '*', effect: allow }
  - { action: edit, resource: 'local/*', effect: allow }
  - { action: skill, resource: '*', effect: allow }
```

This fragment grants search, not secret isolation. It deliberately grants no shell or children; add exact dependencies only after their review. It assumes `local/*` is the chosen plan-artifact root and does not exempt environment files inside that root from a separate write-policy decision.
