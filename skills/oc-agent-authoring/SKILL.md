---
name: oc-agent-authoring
description: "Use when creating, splitting, refactoring, reviewing or auditing an OpenCode V2 agent team, or any single agent .md file under agents/. Defines the team tiers, one heading layout per agent class, the dispatch contract, the V2 `permissions` standard and a writing standard for weak models (DeepSeek V4, GLM 5.3). Also use when an agent file mixes V1 permission syntax (`permission:`, `bash`, `task`, nested effect maps) into a V2 repo. Does not choose models, slot counts or per-agent permission effects; routing belongs to `oc-routing`."
metadata:
  version: 1
---

# OC Agent Authoring

Steps: 1 classify the agent. 2 apply the Team rules. 3 write with the Writing standard. 4 copy the shape from `references/skeletons.md`. 5 run the Checklist.

Read `references/skeletons.md` before writing a new agent file or a new `permissions` block.

## Classify

1. Hands-on primary, fixed gated workflow, no dispatch -> Standalone layout.
2. Primary that dispatches subagents -> Orchestrator layout.
3. `mode: subagent` -> Subagent layout.
4. Nothing fits -> ask the user. Do not invent a fourth layout.

## Team rules

1. Tiers are defined by orchestration level, not effort: guided builder (Standalone), delegating orchestrator, master orchestrator.
2. Subagents are function-based (analyze, edit, review, spec), never domain-based.
3. An orchestrator never edits source and never reads source. Reading, search and verification go through subagents. Its only writable path is `local/agents/*` (enforced: permissions).
4. A subagent never uses `ask` (it cannot answer). Permissions are `allow` or `deny` only.
5. Agent files never name a model or provider. Routing is by trigger through skill `oc-routing`. Each subagent `description` names its `Route: <trigger>`. Orchestrator frontmatter leaves `model` unset.
6. Every dispatch payload is self-contained. Never write "changed fields only". Resume is an attempt, never a dependency.
7. Pass long or stable content by path, never by pasted text. A subagent that produces large output writes a file and returns a manifest (path list), not the content.
8. Static rules live in the subagent file. The orchestrator never re-pastes role, rules or report templates into a dispatch.
9. Max Slots bind the live session count. The orchestrator checks it before each dispatch.
10. Review and execution are split. The reviewer model family differs from the producer family (decided by `oc-routing`, not by the agent file).
11. An approved plan is required before dispatch. Plan format lives only in skill `writing-plans`. An agent file never defines the plan schema.

## Hard rules (file level)

1. One heading, one kind of content. Two questions in one section -> split. Same question in two sections -> merge.
2. `Context` holds runtime data only. Never role, rules or schema.
3. `Gates` and `Boundaries` precede `Workflow`.
4. One rule, one home. The only allowed repeat is `Pre-send check`.
5. `Output` is a contract, not a step.
6. Enforced limit -> end the bullet with `(enforced: <frontmatter field>)`. Prose-only limit -> write it as an instruction, never as a guarantee.
7. Canonical section names only. `Purpose`, `Rules`, `Procedure`, `Responsibilities` are defects.
8. Section order is a design assumption, not a verified fact. Do not cite it as proof.

## Writing standard (weak models)

Reader: DeepSeek V4 / GLM 5.3. It skims, follows first and last lines best, and guesses to fill gaps.

1. One sentence = one instruction = one condition. No "unless ... except ... but if".
2. Start with an imperative verb: "Return BLOCKED if Plan is missing."
3. Make every rule yes/no testable. Replace "carefully", "appropriate", "if needed" with a number, path or enum value.
4. Name the default for every unknown: missing field, empty result, unsure -> exact status to return.
5. Close every enum: all values listed once, exact spelling. The parent handles every value.
6. ASCII only in notation, enums, headings and field names.
7. Prefer positive form plus trigger over bare prohibition. Max 3 NEVER per file.
8. Lookups go in tables. Procedures go in numbered steps (max 7), one verb and one stop condition per step.
9. Give one Output example (5-10 lines).
10. No rationale, history or design notes in agent files.
11. Same concept = same word everywhere.
12. Size cap: subagent <= 80 lines, standalone <= 120, orchestrator <= 150. Over the cap -> move static lookups to a skill and load it by name.
13. Omit a section that does not apply. Never write an empty or "N/A" section.

## Orchestrator layout

```text
## Role
## Gates
   ### <local gate>      optional
## Subagents
## Routing
## Boundaries
## Workflow
   ### <phase>           name by task domain
## Output
   ### Pre-send check
```

| Section | Contains | Excludes |
| --- | --- | --- |
| `Role` | ownership split, write root, never-do | preconditions, steps |
| `Gates` | ordered hard preconditions and approvals (plan approved, user confirmed) | narrative, steps |
| `Subagents` | table: name, Max Slots, one-line purpose; row `general` (free-form task) | payload schema, model choice |
| `Routing` | `Load skill oc-routing before the first dispatch.`; conditions that make a dispatch invalid | model selection rules |
| `Boundaries` | scope limits, prohibitions, absolute stop thresholds (max retries) | preconditions, status branches |
| `Workflow` | phases; `status -> next step` per returned status; review-pair rule | restated rules, output shape |
| `Output` | opening line, required fields, order, Pre-send check | steps |

The orchestrator holds no payload schema for a subagent except the `general` row. Every other schema is in that subagent's `description`.

## Standalone layout

```text
## Role
## Gates
## Boundaries
## Workflow
## Output
   ### Pre-send check
```

Contents follow the Orchestrator table. Omit `Subagents` and `Routing`.

## Subagent layout

```text
## Role
## Input
   ### <variant>         optional
## Boundaries
## Workflow
   ### Scope Self-Check  only if the agent mutates state
## Output
   ### <lookup>          optional
   ### Pre-send check
```

| Section | Contains | Excludes |
| --- | --- | --- |
| `Role` | one-sentence job, hard never-do | schema, steps |
| `Input` | missing-field behaviour, "every message is self-contained", resume entry | payload schema (lives in `description`) |
| `Boundaries` | scope, tool and channel limits | steps |
| `Workflow` | ordered procedure | output shape |
| `Output` | exact field names, closed status enum, reply discipline, templates | procedure |

`Input` and `Output` are text contracts read by the model. The runtime does not parse them. Write plain labeled lines, never pseudo-JSON.

## Dispatch contract

1. Subagent `description` = `<name>: <one-line job>. Route: <trigger>. INPUT: <header fields>; <fields>`. Mark optional fields `(opt)`. Max 5 lines.
2. Header fields come first and are identical across the team (example: UNIT). Per-agent fields follow, in dispatch order.
3. The orchestrator dispatches with the same field names in the same order.
4. Every status in a subagent `Output` has a branch in the parent `Workflow`. No branch for a status that is never emitted.
5. Parent `Output` restates only facts the interface carries.
6. Name in `Subagents` table = registered name = start of `description`.

## Permission standard (V2)

OpenCode V2 uses `permissions`: an ordered list of `{ action, resource, effect }` rules. The last matching rule wins, and an unmatched action resolves to `ask`. A custom agent still inherits the base policy `{ action: '*', resource: '*', effect: 'allow' }`, so a deny must be written explicitly; never rely on omission.

| V1 (do not write) | V2 (write this) |
| --- | --- |
| `permission:` | `permissions:` |
| `bash` | `shell` |
| `task` | `subagent` |
| `edit: { "*": deny, "./local/agents/*": allow }` | two rules: `{ action: edit, resource: '*', effect: deny }` then `{ action: edit, resource: 'local/agents/*', effect: allow }` |
| `"*": ask` | `{ action: '*', resource: '*', effect: ask }` |
| `subagent: { <name>: allow }` | `{ action: subagent, resource: '*', effect: deny }` then one `allow` rule per row |

| Agent | V2 standard |
| --- | --- |
| Orchestrator | base `*` deny; explicit allows only: `question`; `read`/`edit`/`write` scoped to `local/agents/**`; `skill` for the named skills; `subagent` one `allow` per `Subagents` row; `shell` allowlist (`git status`, `git add`, `git commit`) |
| Subagent | base `*` deny; allow or deny only, never `ask`; read tools only if the agent reads files; `edit *` deny for read-only agents; `shell` narrow command allowlist |
| Standalone | base `*` deny; `read` allow; `edit`/`write` allow only inside the owned scope; `shell` allowlist; no blanket `shell *` allow |

Broad rule first, specific rule last. A rule that must win is written after every rule it overrides.

Prose-only (no field backs it): read scope, Max Slots, skill breadth. Write these as instructions, not as permission rules.

## Checklist before saving

- One layout only; canonical names only.
- Every `Gates` item is a precondition.
- Every sentence has one condition; every unknown has a default status.
- At most 3 NEVER; no model or provider name in the file.
- No sentence repeated except in `Pre-send check`.
- Subagent `description` carries Route and INPUT; the orchestrator has no schema copy except `general`.
- Every parent branch matches a subagent status.
- Every enforced limit names its frontmatter field.
- Permissions use `permissions`, `shell` and `subagent`; no `permission`, `bash`, `task` or nested effect map.
- Orchestrator: no edit outside `local/agents/*`, no read tools.
- `Output` is last and ends with `Pre-send check` (3-5 yes/no items).
- File is within its size cap.

## Out of scope

Model values, slot counts, lifecycle and timeout policy, whether an agent should exist.
