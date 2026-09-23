# OpenCode V2 Agent Config Spec

**Scope**: Governs all agent Markdown+YAML definitions for OpenCode V2 — both the schema standard and the authoring style standard. Native V2 syntax only. Forbidden: `permission`, `bash`, `task`, `disable`, `maxSteps`, root-level `temperature`/`top_p`.

## 1. Frontmatter Schema

| Field | Type | Req | Notes |
|---|---|---|---|
| `description` | string | subagent: Y / primary: rec | Selection summary shown to parent/picker |
| `mode` | `primary`\|`subagent`\|`all` | Y | |
| `model` | string | opt | `provider/model#variant` |
| `color` | hex | opt | e.g. `#22c55e` |
| `steps` | int | opt | replaces `maxSteps` |
| `hidden` | bool | opt | hide from picker/catalog |
| `permissions` | array | Y | ordered `{action, resource, effect}` |
| `request` | object | opt | `{ headers, body: { temperature } }` |

## 2. Permissions

Ordered array, **last matching rule wins** → put broad rules first, exceptions after. Unmatched = `ask`.

Actions: `subagent`, `shell`, `edit` (write/patch merged), `read`, `glob`, `grep`, `skill`, `question`, `webfetch`, `websearch`, `execute`, `<server>_<tool>` (MCP).

```yaml
permissions:
  - { action: "*", resource: "*", effect: deny }              # default-deny baseline, FIRST
  - { action: subagent, resource: "team/analyzer", effect: allow }
  - { action: shell, resource: "git status *", effect: allow }
```

Subagents MUST include `{ action: subagent, resource: "*", effect: deny }` unless explicitly designed to spawn children.

## 3. File Layout (mandatory order)

1. YAML frontmatter
2. `## Core Definition` — primary: Subagent Contracts table; subagent: Output Criteria DTO
3. `## Execution Workflow` — numbered phases
4. `## Rules` — flat bullets, MUST be the final section

## 4. Primary Orchestrator

- MUST NOT edit files directly if a subagent covers that purpose.
- Subagent Contracts table required: `Name | Max Slots | Contract | Purpose`.
- Human Checkpoint Gate required before any mutating step: present `AffectedFiles` table + 3–6 change bullets → await `proceed|revise|cancel`.
- NEVER leak orchestration keywords (`ctx-N`, `slot-N`, `spawn`, `resume`) into subagent task payloads.
- Budget: ≤150 lines (ceiling 160).

## 5. Subagent Specialist

- Output Criteria DTO with closed enums, e.g. `Status: READY|BLOCKED`; `BlockingQuestions` required when `BLOCKED`.
- MUST NOT delegate — enforce via permission rule (§2) and state explicitly in Rules.
- Budget: ≤90 lines (ceiling 120).

## 6. Directive Language

- Binding only: `MUST`, `ONLY`, `NEVER`, `PRECONDITION`, `EXIT`.
- Banned: `should`, `prefer`, `try to`, `carefully`, `as needed`.
- No fluff, no rationale prose, no constraint duplicated across Workflow and Rules.
- Table any collection of 3+ items.

## 7. Compliance Checklist

```
[ ] permissions array only — no legacy permission/bash/task/disable/maxSteps/root temperature
[ ] correct V2 action names (subagent/shell/edit)
[ ] subagent has explicit no-delegation deny rule
[ ] catch-all deny (if used) placed FIRST, never last
[ ] Sandwich layout intact; Rules is the final section
[ ] primary: Subagent Contracts table + Checkpoint Gate present
[ ] subagent: Output Criteria DTO w/ closed enum + no-delegation rule stated
[ ] only MUST/NEVER/ONLY directives, no soft language
[ ] line budget respected (subagent ≤90, primary ≤150)
```