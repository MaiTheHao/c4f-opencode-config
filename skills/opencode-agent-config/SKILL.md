---
name: opencode-agent-config
description: "Authoritative engineering specification, validation rules, and authoring guidelines for configuring, auditing, or migrating native OpenCode V2 Markdown agents in this repository. Triggers whenever authoring or modifying agent files (.opencode/agents/*.md), reviewing agent permissions/frontmatter, auditing delegation lifecycles, or resolving schema/tool contracts."
---

# OpenCode Agent Configuration

How to author, audit, and migrate native OpenCode V2 Markdown agents in this repository.

**Framing:** an agent is an instruction provider. Its frontmatter is selection metadata; its body is the system prompt. Author it with the same discipline as a skill — the description is the trigger, the body stays lean, and detail lives behind explicit pointers instead of being dumped inline. See the inheritance rules in `references/project-authoring.md`.

## 1. How to use this skill

This file is the entry point: the authority model, the non-negotiable contract, and the authoring flow. Detail lives in `references/`. Load a reference only when its trigger matches — never preload the set. Deterministic static checks live in `scripts/validate_agent.py`; execute it rather than reading it into context.

| Reference | Load it when |
|---|---|
| `references/sources.md` | Refreshing native evidence, recording a source conflict, or citing a `NATIVE` contract's origin |
| `references/native-agents.md` | Verifying V2 agent file locations, frontmatter field shapes, rejected keys, or model selectors |
| `references/native-permissions.md` | Resolving permission rule matching, action/resource names, wildcards, or hard policies (D8) |
| `references/native-tools-skills.md` | Checking tool availability/invocation or native skill discovery and frontmatter |
| `references/project-authoring.md` | Writing/reviewing an agent body: instruction design, capability checks, required skills, routing, layout, size, contracts, delegation |
| `references/project-permissions.md` | Authoring/reviewing a permission profile, or copying a reusable fragment |
| `references/project-workflow.md` | Authoring workflow/approval gates, verification/reporting, or research budgets |
| `references/migration-audit.md` | Migrating or auditing the supplied agent family and its cross-file dependencies |
| `references/acceptance.md` | Before declaring any agent change complete; running the acceptance procedure |

## 2. Authority model

Every requirement belongs to one layer. Never present a project policy as native behavior, and never present an unverified capability as available.

| Label | Meaning | How to verify |
|---|---|---|
| `NATIVE` | Behavior described by current official V2 documentation | Check the corresponding source and the installed V2 build |
| `PROJECT` | Policy adopted by this agent family | Review this specification and its acceptance checks |
| `UNVERIFIED` | Environment-dependent capability or missing dependency | Inspect the actual catalog/schema/configuration and run a focused smoke check |

A project policy can narrow behavior; it cannot create a tool, grant authority, invent an input field, or make an unsupported setting effective. When evidence conflicts, record the conflict and leave the capability `UNVERIFIED`. NEVER silently migrate the configuration to another major version. Source register and the open schema conflict live in `references/sources.md`.

## 3. The agent contract at a glance

Applies to every governed agent. Full rules: `references/project-authoring.md` and `references/project-permissions.md`.

**Frontmatter** — UTF-8, one `---` … `---` pair, YAML mapping, unique keys, non-empty body.
- Required family fields: `description`, `mode`, `permissions`.
- Optional: `model` (string selector), `color` (six-digit hex), `steps`, `hidden`, `disabled`, `request`.
- NEVER add `$schema`, provider definitions, global `skills`, or concurrency settings to agent frontmatter.
- Reject legacy keys `permission`, `tools`, `prompt`, `disable`, `maxSteps`, `temperature`, `top_p`. Author `shell` and `subagent`, never `bash`/`task`. Details: `references/native-agents.md`.

**Permissions** — ordered rules `{ action, resource, effect: allow|ask|deny }`; last match wins.
- MUST open an agent's own rules with `{ action: '*', resource: '*', effect: deny }`, then grant only what its workflow needs.
- MUST give every custom leaf subagent `{ action: subagent, resource: '*', effect: deny }`, and grant only catalog-confirmed child IDs.
- MUST keep `skill: '*' -> allow` on primaries as the family default.
- MUST evaluate the complete merged ruleset: a later broad allow can reopen an earlier restriction.
Invariants and fragments: `references/project-permissions.md`. Matching semantics: `references/native-permissions.md`.

**Body** — three sections, in order:
1. `## Context` — role, scope, and the kind's contract.
2. `## Workflow` — ordered actions and explicit transitions.
3. `## Rules` — flat bullets; final section; required skills declared here.

Each requirement has exactly one owner; `## Workflow` references a rule instead of restating it. Layout, kinds, and size budgets: `references/project-authoring.md`.

## 4. Authoring flow

1. **Identify** the agent kind (delegating primary, solo primary, specialist subagent) and its deployment path; resolve the installed ID before naming the agent.
2. **Classify** every claim as `NATIVE`, `PROJECT`, or `UNVERIFIED`; refresh the relevant source via `references/sources.md` when native behavior is load-bearing.
3. **Check capabilities** before writing the workflow: every action needs an existing, reachable, permitted tool with working dependencies and a consumable result (`references/project-authoring.md`).
4. **Design the instructions** with the instruction-provider principles — lean body, one owner per rule, imperative bindings plus rationale, and pointers instead of inlined detail (`references/project-authoring.md`).
5. **Write the body** to the project layout and size budget; declare required skills as a `## Rules` bullet; add the routing precondition after `### Subagents` for delegating primaries.
6. **Author permissions** from a project profile: start at default deny, grant the minimum the workflow needs.
7. **Validate** with `references/acceptance.md` (`scripts/validate_agent.py` covers the static checks); report native, project-policy, and dependency checks separately. Never mark a check complete by weakening a rule or adding a blanket allow.

## 5. Acceptance checklist (summary)

- Frontmatter parses with no duplicate keys, no rejected keys, and no forbidden sampling keys.
- Merged entry and live catalog inspected; every referenced child, skill, and model ID resolved.
- Every workflow action maps to a callable tool with an effective permission decision.
- Body matches layout, size budget, and single-owner rule discipline.
- Permissions open with default deny; leaf children deny delegation; sensitive-file paths reviewed across all access channels.
- Behavior exercised in the installed runtime, not merely YAML-parsed.
- Change report distinguishes `NATIVE`, `PROJECT`, and `UNVERIFIED` results and records remaining blockers.
Full procedure and behavioral cases: `references/acceptance.md`.

## 6. Maintenance

- Use this specification as the family policy baseline; treat release-specific runtime evidence as the authority on what OpenCode actually supports.
- Increment the spec revision for changes to fields, permissions, routing, required skills, contracts, or gates; record the changed rule and affected profiles.
- Recheck relevant sources on an OpenCode upgrade; never claim this dated snapshot covers every future V2 release.
- Distinguish a native incompatibility, a project-policy failure, and an unavailable dependency in review results.
- Keep amendments and migration decisions in this specification when the user requests source-of-truth-only work.
- NEVER edit agents, skills, provider settings, or runtime policies merely to make a verification status look complete.
- Mutate agent files only when explicitly requested; revising this specification alone is not a request to change every profile.
