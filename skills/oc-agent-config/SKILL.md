---
name: oc-agent-config
description: "Authoritative spec, validator and authoring rules for native OpenCode V2 Markdown agents in this repo. MUST be used whenever the user creates, edits, reviews, audits or migrates an agent file (.opencode/agents/*.md, agents/**/build-*.md), its frontmatter, permissions, subagent table, slot limits, routing precondition or required skills, or asks to validate/accept an agent. Also use for 'agent config', 'primary/subagent', 'effort tier', 'Max Slots', 'oc-routing precondition', 'validate_agent'."
---

# OpenCode Agent Configuration

An agent is an instruction provider: frontmatter = selection metadata, body = system prompt. Detail lives in `references/`; the validator is `scripts/validate_agent.py` (execute it, never read it into context).

## Non-negotiable (read before touching any agent file)

1. **Plan line first.** Before writing, output one line:
   `AGENT-PLAN: kind=<delegating|solo|specialist> | path=<resolved> | children=<id:slots,...> | skills=<ids> | validate=<command>`
2. **Never finish without the validator.** Run `python3 scripts/validate_agent.py <files>`; paste its result. Fix the agent, never weaken a rule or add a blanket allow to pass.
3. **Slots bind session count.** For every child row, `Max Slots` = max live sessions = max concurrent dispatches. Delegating primaries MUST carry the `### Subagents` table and `### Routing` precondition (`references/project-authoring.md` s4-s5).
4. **Classify claims**: `NATIVE` (official V2 docs), `PROJECT` (this family's policy), `UNVERIFIED` (needs live check). Never label a project rule or an `S*`-only claim `NATIVE`. Evidence conflict: record it, leave `UNVERIFIED`, never migrate major versions silently.
5. **Mutate agent files only when asked.** Editing this spec is not a request to rewrite every profile.

## Load references by trigger (never preload the set)

| Load                                | When                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/project-authoring.md`   | Writing/reviewing a body: layout, size, skills, routing, slots, delegation, contracts                                                                                                |
| `references/project-permissions.md` | Writing/reviewing `permissions`; copying a fragment                                                                                                                                  |
| `references/project-workflow.md`    | Effort tiers, approval gates, verification/report, research budgets                                                                                                                  |
| `references/acceptance.md`          | Before declaring any agent change done                                                                                                                                               |
| `references/native-agents.md`       | Field shapes, rejected keys, model selectors, pinning                                                                                                                                |
| `references/native-permissions.md`  | Rule matching, action/resource names, hard policies                                                                                                                                  |
| `references/native-tools-skills.md` | Tool availability/invocation, skill discovery                                                                                                                                        |
| `references/sources.md`             | Source register, open schema/generation conflicts                                                                                                                                    |
| `references/update-c4f-repo.md`     | The task is to version-check, update or resolve update conflicts in `~/.config/opencode` or `~/.agents/skills`. Load it FIRST for that task; do not load it for ordinary agent edits |

## Contract at a glance

**Frontmatter**: UTF-8, one `---` pair, YAML mapping, unique keys, non-empty body.

- Required: `description`, `mode`, `permissions`. Optional: `model` (string), `color` (hex), `steps`, `hidden`, `disabled`, `request`.
- NEVER add `$schema`, provider blocks, `skills`, concurrency keys. Reject `permission`, `tools`, `prompt`, `disable`, `maxSteps`, `temperature`, `top_p`; author `shell`/`subagent`, not `bash`/`task`.

**Permissions**: ordered `{ action, resource, effect }`, last match wins.

- Open with `{ action: '*', resource: '*', effect: deny }`, then grant the minimum. Only a designated open agent (named in its own `description`, declared in `scripts/accepted_exceptions.json`) may open otherwise.
- Leaf subagents: `{ action: subagent, resource: '*', effect: deny }`. Grant only catalog-confirmed child and skill IDs.
- Review the merged ruleset: a later broad allow reopens an earlier global deny.

**Body** (exact order): `## Context` (role; delegating primaries add `### Gates` optional, `### Subagents`, `### Routing`) -> `## Workflow` -> `## Rules` (flat bullets, last; declares required skills). One owner per rule; Workflow references, never restates. Budgets: primary 150/160 lines, specialist 90/120.

## Authoring flow

1. **Identify** kind and deployment path; resolve the installed ID.
2. **Classify** claims; refresh `references/sources.md` evidence only if native behavior is load-bearing.
3. **Check capabilities**: every action maps to a callable, permitted tool (`project-authoring.md` s2).
4. **Write** to layout and budget; table + precondition for delegating primaries; required skills in `## Rules`.
5. **Permissions** from a fragment in `project-permissions.md`, then merged-ruleset review.
6. **Validate** with `references/acceptance.md`; report `NATIVE`, `PROJECT`, `UNVERIFIED` results separately.

## Maintenance

- Bump the spec revision when fields, permissions, routing, skills, contracts or gates change; record the rule and affected profiles. Current: **2.3.0**.
- Recheck sources on an OpenCode upgrade; this snapshot does not cover future V2 releases.
- Keep native incompatibility, project-policy failure and missing dependency distinct in reviews.
- NEVER edit agents, skills, provider settings or policies just to make a status look complete.
