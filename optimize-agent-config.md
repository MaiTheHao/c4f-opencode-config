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
2. `## Context`
   - primary: `### Subagents` (Markdown table with `Name`, `Max Slots`, `Purpose`)
   - subagent: `### Output Schema` (DTO with closed enums)
   - NEVER define redundant input schemas
3. `## Workflow` — numbered steps (e.g. `### 1. Discovery`, omit "Phase")
4. `## Rules` — flat bullets, MUST be the final section

## 4. Primary Orchestrator

- MUST NOT edit files directly if a subagent covers that purpose.
- Subagents table required under `### Subagents`:
  | Name | Max Slots | Purpose |
  |---|---|---|
  | `team/analyzer` | 1 | Codebase and impact analysis |
- Human Checkpoint Gate required before any mutating step: present `AffectedFiles` table + 3–6 change bullets → await `proceed|revise|cancel`.
- NEVER leak orchestration keywords (`ctx-N`, `slot-N`, `spawn`, `resume`) into subagent task payloads.
- Budget: ≤150 lines (ceiling 160).

## 5. Subagent Specialist

- Output Schema DTO with closed enums, e.g. `Status: READY|BLOCKED`; `BlockingQuestions` required when `BLOCKED`.
- MUST NOT define input schemas (redundant).
- Enforce no-delegation via permission rule (`{ action: subagent, resource: "*", effect: deny }`). Do not duplicate this constraint in Rules.
- Budget: ≤90 lines (ceiling 120).

## 6. Directive Language

- Binding only: `MUST`, `ONLY`, `NEVER`, `PRECONDITION`, `EXIT`.
- Banned: `should`, `prefer`, `try to`, `carefully`, `as needed`.
- No fluff, no rationale prose, no constraint duplicated across Workflow and Rules.
- Use clean Markdown tables for Subagents and tabular structures. Prefer clean JSON/DTO schemas for data transfer models where appropriate.

## 7. Compliance Checklist

```
[ ] permissions array only — no legacy permission/bash/task/disable/maxSteps/root temperature
[ ] correct V2 action names (subagent/shell/edit)
[ ] subagent has explicit no-delegation deny rule in permissions
[ ] catch-all deny (if used) placed FIRST, never last
[ ] Sandwich layout intact: Context -> Workflow -> Rules (final)
[ ] primary: Subagents table present under Context (or omitted for solo agent); no input schema
[ ] subagent: Output Schema DTO present; no input schema
[ ] only MUST/NEVER/ONLY directives, no soft language
[ ] line budget respected (subagent ≤90, primary ≤150)
```