# Project Authoring Standard

**Load this when** writing or reviewing an agent body: instruction design, capability checks, required skills, routing, layout, size, output contracts, or delegation. All rules here are `PROJECT` unless marked `NATIVE`.

## 1. Agent as instruction provider (inherited conventions)

An agent is a system prompt with selection metadata, so the instruction-design habits from `skill-creator` apply directly:

- **Metadata triggers, body executes.** The `description` is what makes the runtime select the agent. Write it as scope plus "use when" triggers, in the same pushy style as a skill description; never bury selection logic in the body.
- **Progressive disclosure.** Keep the body lean and push detail behind explicit pointers. An agent's three levels are: frontmatter metadata (always visible), body/system prompt (loaded on selection), and referenced skills/files (loaded on demand). Do not inline what a referenced skill already owns.
- **Single owner per requirement.** State each rule once; other sections reference it. Duplicated rules drift apart.
- **Imperative bindings, explained.** Use `MUST`, `NEVER`, `ONLY`, `PRECONDITION`, `EXIT` for binding rules, and say *why* so the model can generalize. Convert vague `should`, `prefer`, `try to`, `carefully`, and `as needed` directives into a condition, action, and outcome. Explanatory prose and source descriptions need not use normative keywords.
- **Avoid overfit rigidity.** Prefer a clear principle plus its reason over a long list of special cases; a rule that only fits one example will not generalize.

## 2. Capability checks before workflow authoring

For each action in the workflow, record:

| Check | Required evidence |
|---|---|
| Tool exists | Exact live catalog name and input schema |
| Tool is reachable | Direct exposure or confirmed Code Mode route |
| Agent may use it | Effective action/resource decision |
| Dependencies work | Directory, provider, network, skill, or child availability |
| Result is consumable | Expected return shape and continuation mechanism |

## 3. Required-skill contract

- MUST declare required skills once, as a bullet in the agent's final `## Rules` section.
- MUST load each dependency before its first dependent operation, in the relevant session.
- MUST verify exact IDs and winning definitions; do not confuse a permitted skill with an installed or loaded skill.
- MUST check supporting-file and execution permissions. A primary with only `skill` permission may load a body but remain unable to follow references or execute scripts.
- MUST return `BLOCKED` with the missing ID, denied capability, or incompatible requirement when a mandatory dependency cannot be used. Never claim it was loaded.
- MUST record dependencies required by children in the child's contract; a parent's skill load is not proof of child-session readiness.

| Profile | Required skills retained from samples |
|---|---|
| Builder normal | `brainstorming`, `opencode-routing-dev` |
| Planner | `brainstorming`, `writing-plans`, `opencode-routing-dev` |
| Research normal / extra | `opencode-routing-research` |
| Research fast | None mandatory in the supplied file |

These skills were not supplied with the sample set, so their internals, path requirements, and any custom routing API remain `UNVERIFIED`. Do not manufacture their contents or turn their names into native OpenCode features.

## 4. Model routing precondition

`PROJECT`: prefer the string selector in handwritten agents. Preserve this precondition immediately after `### Subagents` on delegating primaries:

> PRECONDITION: MUST load `opencode-routing-dev` or `opencode-routing-research` (matching agent domain) in this session before the first child dispatch; MUST resolve and verify the applicable route before each dispatch or continuation. EXIT with `BLOCKED` when the required route cannot be applied through a supported mechanism.

The supplied "every dispatch/resume MUST pass a `model`" instruction is **not established by the documented tool contract**. Do not require that argument until the installed tool schema or a documented extension proves support. A resolved route must be applied through a supported configuration/session/tool mechanism and checked against the actual child model. If none is available, block the affected dispatch rather than pretending prompt text changes the model.

For resumed children, verify whether the route is still valid; do not assume continuation changes models. For skeptic/validation diversity, choose a different supported model when available; otherwise record the shared-model limitation. Do not assert independent verification merely from different model names.

## 5. Mandatory layout

1. YAML frontmatter.
2. `## Context`: role, scope, and the relevant contract below.
3. `## Workflow`: ordered actions and explicit transitions.
4. `## Rules`: flat bullets; final section; required skills declared here.

| Kind | Required Context content | Exemptions |
|---|---|---|
| Delegating primary | `### Subagents`, routing precondition, `Name / Max Slots / Purpose` table | No redundant input DTO |
| Solo primary | Explicit single-agent scope | No Subagents table or routing prerequisite |
| Specialist subagent | `### Output Schema` with types, closed status enums, conditional fields | No redundant input DTO |

`Max Slots` means simultaneously active child sessions for that row. It is not a native configuration field. A run-wide `MaxConcurrentSubagents` caps the sum of active children across roles and waves. Awaiting a child result is not proof the slot is free until completion is established.

## 6. Size and wording

| File type | Target | Hard ceiling |
|---|---:|---:|
| Primary | 150 lines | 160 lines |
| Specialist | 90 lines | 120 lines |

Count physical lines, including YAML and blanks. A target overrun needs an explicit reason in the change report; exceeding the ceiling fails acceptance. This source-of-truth specification is exempt.

## 7. Contracts and failure handling

Use one transport per child report: JSON or structured Markdown with fixed fields. Do not demand both "JSON only" and the samples' "structured markdown" suffix. Enumerate domain-specific report statuses rather than inventing one universal status set.

A minimal specialist envelope can be specified as:

```text
Status: READY | BLOCKED
Summary: string
Evidence: array of { Reference: string, Finding: string }
BlockingQuestions: string[]  # non-empty exactly when Status = BLOCKED
```

The original `READY`, `REQUEST_ANALYZER`, `SUCCESS`, `PASS`, `CHANGES_REQUIRED`, `WEAKENED`, and `BROKEN` statuses belong to different contracts. Before use, require a matching producer schema and a consumer transition for every value. Define malformed output, tool failure, cancellation, and exhausted budget handling explicitly; never interpret missing status as success.

Default retry policy: initial attempt plus at most two retries per logical task unit. Resuming or creating a new session does not reset this budget. Retry only with a concrete correction or a transient-failure reason; then return `BLOCKED` with completed work and the remaining issue.

## 8. Delegation and session lifecycle

- MUST keep orchestration internal: slot IDs, synthetic context IDs, and scheduling notes stay out of child prompts.
- MUST pass task scope, exact affected paths, acceptance conditions, relevant findings, and required report format.
- MUST retain the real returned session handle and pass it through supported tool arguments for continuation.
- MUST reuse a compatible active/resumable child for follow-up work when available; never invent a resume capability.
- MUST partition parallel mutations into non-overlapping file sets; serialize or merge overlapping work.
- MUST inspect custom leaf-agent permissions before relying on no-delegation or read-only guarantees. A sentence in the parent's Rules does not enforce the child's permissions.
- NEVER treat a prompt-level slot cap, stop rule, or approval gate as an engine-enforced limit.
