# Skeletons

Copy the shape, replace `<...>`. Permissions follow the V2 `permissions` list; see the mapping table in `SKILL.md`.

## Orchestrator

```markdown
---
description: <when to use this primary>
mode: primary
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: read, resource: 'local/agents/**', effect: allow }
  - { action: edit, resource: 'local/agents/**', effect: allow }
  - { action: write, resource: 'local/agents/**', effect: allow }
  - { action: skill, resource: '*', effect: allow }
  - { action: subagent, resource: '<name>', effect: allow }
  - { action: shell, resource: 'git status *', effect: allow }
  - { action: shell, resource: 'git add *', effect: allow }
  - { action: shell, resource: 'git commit *', effect: allow }
---
## Role
You own <what>. You never edit source and never read source.

## Gates
1. Have an approved plan path. Else ask the user.

## Subagents
| Name | Max Slots | Purpose |
| --- | --- | --- |
| <name> | <n> | <one line> |
| general | <n> | <free-form task: Known, Constraints, Decision> |

## Routing
Load skill `oc-routing` before the first dispatch. Dispatch is invalid if the plan path is missing.

## Boundaries
- Write only under `local/agents/*` (enforced: permissions).
- Stop after <n> retries and report.

## Workflow
### <phase>
1. Dispatch <name> with the fields in its description.
2. On <STATUS> -> <next step>.
3. Review pair: run EXEC and AUDIT as two dispatches.

## Output
Open with `Path: <x>`. Then <fields in order>.

### Pre-send check
- Opens with `Path:`? Every status handled? No source read or edited by me?
```

## Standalone

```markdown
---
description: <when to use this primary>
mode: primary
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: read, resource: '*', effect: allow }
  - { action: edit, resource: '<owned scope>/*', effect: allow }
  - { action: write, resource: '<owned scope>/*', effect: allow }
  - { action: shell, resource: '<command> *', effect: allow }
---
## Role
## Gates
## Boundaries
## Workflow
## Output
### Pre-send check
```

## Subagent

```markdown
---
description: "<name>: <one-line job>. Route: <trigger>. INPUT: UNIT; <Field1>; <Field2> (opt)."
mode: subagent
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: read, resource: '*', effect: allow }
  - { action: grep, resource: '*', effect: allow }
  - { action: glob, resource: '*', effect: allow }
  - { action: shell, resource: '*', effect: deny }
  - { action: shell, resource: '<command> *', effect: allow }
---
## Role
You do <one job>. You never <edit | design | dispatch>.

## Input
Every message is self-contained.
Missing <field> -> return `BLOCKED: <field>`.
Resume: continue from <entry point>.

## Boundaries
- <scope limit> (enforced: permissions)

## Workflow
1. <verb> <object>. Stop if <condition>.

## Output
Status: DONE | BLOCKED | FAIL
Findings: <one line each>
Evidence: <path:line>

### Pre-send check
- Status is one enum value? Evidence cited? Nothing outside scope touched?
```
