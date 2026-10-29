# Project Authoring Standard

**Load this when** writing or reviewing an agent body: instruction design, capability checks, required skills, routing, slots, layout, size, contracts, or delegation. All rules are `PROJECT` unless marked `NATIVE`.

## 1. Agent as instruction provider

- **Metadata triggers, body executes.** `description` is scope plus "use when" triggers, written pushy like a skill description. Never bury selection logic in the body.
- **Progressive disclosure.** Frontmatter always visible; body loaded on selection; skills/files loaded on demand. Do not inline what a skill already owns.
- **One owner per requirement.** State a rule once; other sections reference it.
- **Imperative bindings, with the reason.** Use `MUST`, `NEVER`, `ONLY`, `PRECONDITION`, `EXIT`. Turn `should`, `prefer`, `try to`, `as needed` into condition, action, outcome.
- **Weak-model hardening.** For models that drift from policy, a binding rule needs (a) a numeric or yes/no test, (b) a written artifact the model must produce (a ledger line, a table), and (c) an explicit statement that it overrides conflicting tool-description hints. A rule that is only "remembered" will be dropped under long context.

## 2. Capability checks before workflow authoring

| Check                | Required evidence                                          |
| -------------------- | ---------------------------------------------------------- |
| Tool exists          | Exact live catalog name and input schema                   |
| Tool is reachable    | Direct exposure or confirmed Code Mode route               |
| Agent may use it     | Effective action/resource decision                         |
| Dependencies work    | Directory, provider, network, skill, or child availability |
| Result is consumable | Return shape and continuation mechanism (`sessionID`)      |

## 3. Required-skill contract

- MUST declare required skills once, as a bullet in the final `## Rules` (`Required skills: ...`).
- MUST load each dependency before its first dependent operation, in the relevant session.
- MUST verify exact IDs; a permitted skill is not an installed or loaded skill.
- MUST check supporting-file and execution permissions: `skill` permission alone cannot follow references or run scripts.
- MUST return `BLOCKED` with the missing ID or denied capability when a mandatory dependency is unusable. Never claim it was loaded.
- MUST record child-required skills in the child's contract; a parent's load is not child readiness.
- Reusable rubric text belongs in a skill, not a bare reference file.

| Profile                | Required skills                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Builder low            | `brainstorming`; `oc-routing` when it delegates                                                   |
| Builder medium / high  | `brainstorming`, `oc-routing`; `writing-plans`, `executing-plans`, `git-commit` on their triggers |
| Planner                | `brainstorming`, `writing-plans`, `oc-routing`                                                    |
| Research normal / high | `oc-routing` plus embedded `### Routing`, `oc-research-tiering`                                   |
| Research fast          | `oc-research-tiering`                                                                             |

Skill internals are `UNVERIFIED` unless the skill file was supplied. Do not turn skill names into native features.

## 4. Routing precondition and slot binding

`PROJECT`: `Max Slots` in the `### Subagents` table is the single source of the session cap. It means BOTH max simultaneously active dispatches AND max live (created, not retired) sessions for that row. The skill `oc-routing` (v4) enforces it through H1/H2 and a per-dispatch ledger; the agent only has to declare the numbers and the precondition.

The engine does not enforce slots. NEVER describe a slot cap as engine-enforced. The cap holds only because the agent writes the ledger line before each dispatch.

Canonical `### Routing` body, first line verbatim:

> PRECONDITION: MUST load skill `oc-routing` before the first dispatch. MUST treat the `Max Slots` column as the live-session cap per row, resume an existing session before spawning, and set `model` on every dispatch from the routeTable. EXIT with `BLOCKED` when the route cannot be applied.

Rules for the `model` argument:

- `UNVERIFIED` (observed in session transcripts, not in D1-D8): the `subagent` tool exposes an optional `model` argument whose description says to omit it unless asked. `oc-routing` overrides that hint: loading the skill is the explicit instruction to set it.
- Confirm the argument in the live tool schema before claiming it works. If the schema lacks it, route through a supported configuration mechanism or `EXIT BLOCKED` for the affected dispatch. Never pretend prompt text changes the model.
- Verify a resumed session's model still matches its route; resuming does not change models.
- For skeptic/validation diversity, pick a different supported model when available; otherwise record the shared-model limit. Different names alone do not prove independence.

## 5. Mandatory layout

1. YAML frontmatter.
2. `## Context`: role and scope; kind-specific subsections below.
3. `## Workflow`: ordered actions and explicit transitions (named sub-flows such as BUILD / REVIEW are `###`).
4. `## Rules`: flat bullets; final section; required skills declared here.

| Kind                | Required in Context                                                                                                                                                                   | Exemptions           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Delegating primary  | `### Subagents` (table `Name / Max Slots / Purpose`, every allowed child listed, integer slots >= 1), then `### Routing` (precondition above). `### Gates` optional, before Subagents | No input DTO         |
| Solo primary        | Explicit single-agent scope                                                                                                                                                           | No table, no routing |
| Specialist subagent | `### Output Schema`: types, closed status enums, conditional fields                                                                                                                   | No input DTO         |

`validate_agent.py` fails a primary with any named `subagent allow` rule if the table, a child's row, or the precondition is missing.

A run-wide `MaxConcurrentSubagents` (never frontmatter) caps the sum of active children across rows. Awaiting a result does not prove a slot is free until completion is established.

**Effort-tier primaries** (low / medium / high) share one skeleton so tiers differ only in numbers and gates:

```text
## Context
<one-paragraph role: what the agent owns, what subagents own>
### Gates            # mandatory skills, approvals; identical wording across tiers
### Subagents        # Name | Max Slots | Purpose
### Routing          # canonical PRECONDITION
## Workflow
### BUILD / ### REVIEW   # numbered steps with explicit transitions
## Rules             # Required skills bullet + flat constraints
```

## 6. Size and wording

| File type  |    Target | Hard ceiling |
| ---------- | --------: | -----------: |
| Primary    | 150 lines |    160 lines |
| Specialist |        90 |          120 |

Count physical lines. A target overrun needs a reason in the change report; exceeding the ceiling fails acceptance.

## 7. Contracts and failure handling

One transport per child report (JSON or fixed-field Markdown). Closed, domain-specific status enums, each with a producer schema and a consumer transition. Minimal envelope:

```text
Status: READY | BLOCKED
Summary: string
Evidence: array of { Reference: string, Finding: string }
BlockingQuestions: string[]  # non-empty exactly when Status = BLOCKED
```

Define malformed output, tool failure, cancellation and exhausted budget; never read a missing status as success. Retry: initial attempt plus at most two retries per logical unit; a new or resumed session does not reset the budget. Retry only with a concrete correction or transient-failure reason, then `BLOCKED` with completed work and the remaining issue.

## 8. Delegation and session lifecycle

- MUST keep orchestration internal: slot IDs, ledger lines and scheduling notes stay out of child prompts.
- MUST pass scope, exact paths, acceptance conditions, relevant findings and the report format. Send the full preamble once per session; later dispatches carry only the delta.
- MUST retain the real returned `sessionID` and pass it through the supported continuation argument.
- MUST resume a compatible idle session before spawning. "New unit", "new file", "another round" and "fix" are never spawn reasons. Spawn only for a different role, a different model/variant, contaminated context, a worthwhile independent audit, a retired lane (6 dispatches, scope change, contamination), or parallel width below the cap.
- MUST run parallel work in waves no larger than `Max Slots`, on disjoint file sets, and resume the same sessions in the next wave. Serialize overlapping files.
- MUST inspect each custom leaf's permissions before relying on no-delegation or read-only claims; a sentence in the parent's Rules does not enforce them.
- MUST end a delegating task with the `oc-routing` final report (dispatches vs sessions, per-role usage vs cap, reason for every spawn).
- NEVER treat a prompt-level slot cap, stop rule or approval gate as engine-enforced.
