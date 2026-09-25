---
name: opencode-agent-config
description: "Authoritative engineering specification, validation rules, and authoring guidelines for configuring, auditing, or migrating native OpenCode V2 Markdown agents in this repository. Triggers whenever authoring or modifying agent files (.opencode/agents/*.md), reviewing agent permissions/frontmatter, auditing delegation lifecycles, or resolving schema/tool contracts."
---

## 1. Authority, evidence, and compatibility

Every requirement belongs to one layer:

| Label | Meaning | How to verify |
|---|---|---|
| `NATIVE` | Behavior described by current official V2 documentation | Check the corresponding source and the installed V2 build |
| `PROJECT` | Policy adopted by this agent family | Review this document and its acceptance checks |
| `UNVERIFIED` | Environment-dependent capability or missing dependency | Inspect the actual catalog/schema/configuration and run a focused smoke check |

A project policy can narrow behavior; it cannot create a tool, grant authority, invent an input field, or make an unsupported setting effective. When evidence conflicts, record the conflict and leave the affected capability unverified. NEVER silently migrate the configuration to another major version.

### 1.1 Official source register

| ID | Official source | Use |
|---|---|---|
| D1 | [V2 Agents](https://opencode.ai/v2/docs/agents) | Agent files, fields, discovery, merging, built-ins |
| D2 | [V2 Permissions](https://opencode.ai/v2/docs/permissions) | Rule matching, resources, defaults, approvals |
| D3 | [V2 Tools](https://opencode.ai/v2/docs/tools) | Available operations and invocation contracts |
| D4 | [V2 Skills](https://opencode.ai/v2/docs/skills) | Skill discovery, IDs, frontmatter, loading |
| D5 | [V2 Models](https://opencode.ai/v2/docs/models) | Model selectors and variants |
| D6 | [V2 Config](https://opencode.ai/v2/docs/config) | Configuration locations and precedence |
| D7 | [Published config schema](https://opencode.ai/config.json) | Compatibility check; conflict recorded below |
| D8 | [V2 Policies](https://opencode.ai/v2/docs/policies) | Hard restrictions outside ordinary agent permissions |

Use `/v2/docs/` sources for this specification. Unversioned `/docs/` pages and historical design proposals are not substitutes for the V2 contract.

### 1.2 Observed schema conflict — OPEN

On the review date, D6 linked to D7, but the fetched D7 exposed legacy `AgentConfig` fields including `permission`, `maxSteps`, and `tools`, and a root `agent` mapping. This does not match the native V2 authoring contract in D1/D2/D6. [D7]

**Resolution policy:** use the V2 documentation baseline below for authoring; require a schema or parser tied to the installed V2 release before claiming runtime validation. NEVER “fix” native `permissions` into `permission` merely to satisfy this fetched schema. NEVER invent a versioned schema URL. Record the exact URL, retrieval date, runtime version, and any source commit used during a future verification.

No OpenCode executable was available in the review environment. Custom subagents, installed skills, live tool schemas, provider credentials, and merged agent configurations were not supplied. Their existence and behavior remain `UNVERIFIED`.

## 2. Native agent Markdown contract

### 2.1 File and configuration boundary

`NATIVE` [D1, D6]: agent locations are `.opencode/agents/<id>.md` and `~/.config/opencode/agents/<id>.md`; nested agent paths preserve the namespace. YAML frontmatter configures the agent; the Markdown body supplies its `system` prompt. JSONC uses `agents.<id>`. Configuration layers merge; inspect the resulting configuration, not one file in isolation.

`PROJECT`: use UTF-8, one opening/closing `---` pair, a YAML mapping, unique keys, and a non-empty body. Quote wildcards and hex colors. Resolve the installed path before naming an agent: upload basenames are not deployment IDs. Never add `$schema`, provider definitions, global `skills`, or concurrency settings to agent frontmatter.

### 2.2 Supported authoring fields

`NATIVE` baseline [D1]; the “Project contract” column is our stricter authoring policy.

| Field | Native shape | Project contract |
|---|---|---|
| `description` | string | Required, non-empty, describes selection purpose |
| `mode` | `primary`, `subagent`, `all` | Required; default primary behavior is never implicit |
| `model` | model selector | Optional; string form per §6 |
| `color` | six-digit hex string | Optional; `"#3399ff"` form |
| `steps` | positive integer | Optional; never use zero or an unbounded string |
| `hidden` | boolean | Optional; visibility only |
| `disabled` | boolean | Optional; intentional removal only |
| `permissions` | rule array | Required; explicit profile |
| `request` | `headers` / `body` overlays | Omit unless a verified use requires it |
| `system` | string in configuration | In Markdown, use body instead |

`NATIVE` [D1]: agent-level `request` overlays are documented as retained but not yet sent by the V2 session runner. `steps` ends with a tool-free summary step; new user input resets the allowance. It is not a team concurrency budget.

### 2.3 Rejected fields and scoped bans

`PROJECT`: reject legacy agent keys `permission`, `tools`, `prompt`, `disable`, `maxSteps`, `temperature`, and `top_p`. Reject `bash` and `task` as native permission-action aliases; author `shell` and `subagent` instead. These are structural checks, not a ban on ordinary prose or shell script names containing those words.

Preserve the original project prohibition on configuring `temperature` or `top_p` anywhere inside governed agent definitions, including `request.body`. This is a project choice, not proof that reasoning universally replaces sampling controls. Do not silently extend this document's authority to unrelated provider configuration.

`PROJECT`: unlisted agent fields require a documented spec revision plus release-specific validation. A permissive parser accepting an unknown key does not establish that the runtime uses it. In particular, `skills`, `MaxConcurrentSubagents`, retry counters, DTO definitions, and required-skill lists belong in their proper configuration layer or prompt body, not invented frontmatter keys.

## 3. Native permission contract

`NATIVE` [D2]: a rule has string `action`, string `resource`, and `effect: allow|ask|deny`. Evaluation uses the last matching rule; no match means `ask`. However, agents begin with base rules, including broad allow and sensitive-read/external-directory checks. An omitted rule therefore does not imply denial. Agent rules follow global rules. Child permissions are independent of the parent's.

| Action | Matched resource |
|---|---|
| `read`, `edit` | Normalized path; `edit` covers write/patch |
| `glob`, `grep` | Glob pattern / search regex respectively |
| `shell` | Scanned command text |
| `subagent`, `skill` | Agent ID / skill ID |
| `webfetch`, `websearch` | URL / query |
| `question`, `execute` | `*` |
| `external_directory` | Canonical directory boundary |
| `<server>_<tool>` | `*` for the MCP tool |

`NATIVE` [D2]: `*` spans slashes; `?` matches one character; matching covers the whole value. Shell patterns ending ` *` also match the bare command. Multiple checked resources resolve deny before ask before allow. External file access also needs directory authorization. Home expansion applies to path rules, not shell text. Saved approvals never override configured deny.

### 3.1 Project permission invariants

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

### 3.2 Permissions, approvals, and hard policies

`NATIVE` [D8]: `experimental.policies` is a separate configuration surface with `allow|deny`, not `ask`. A permission policy can hard-deny a tool check after ordinary permissions and saved approvals; policy allow does not itself grant tool access. Broader policy authority can restrict project configuration. The policy action named `permission` is valid here and is not the legacy agent key banned in §2.3.

`PROJECT`: an agent specification cannot override organization policy, client limitations, or the host's approval handling. Keep a human workflow checkpoint separate from native `ask` permissions. A chat approval does not rewrite denied permissions; an allowed tool does not prove the user approved an implementation scope.

## 4. Tool availability and invocation

`NATIVE` [D3]: `read` also lists directories; `list` is not a documented standalone V2 Core tool. `execute` exposes Code Mode; nested tools retain their permission checks. Code Mode cannot directly access the filesystem or network. `subagent` accepts a target agent, description, prompt, optional background execution, and a returned `sessionID` for continuation; default nesting depth is one. Browser catalog access is controlled by `browser` deny rules, with no individual browser-operation approval prompts. Session utilities do not request a built-in permission action. MCP catalogs depend on connected servers.

### 4.1 Capability checks before workflow authoring

For each action in the workflow, record:

| Check | Required evidence |
|---|---|
| Tool exists | Exact live catalog name and input schema |
| Tool is reachable | Direct exposure or confirmed Code Mode route |
| Agent may use it | Effective action/resource decision |
| Dependencies work | Directory, provider, network, skill, or child availability |
| Result is consumable | Expected return shape and continuation mechanism |

`PROJECT`: the samples' `list` rules MUST be removed during a future authorized migration unless a real extension documents that action. If a primary needs directory contents, explicitly decide whether to grant `read` or delegate the inspection; do not automatically broaden an orchestrator's access.

`PROJECT`: no blanket `execute` grant. Add it only when the installed tool exposure requires Code Mode or the workflow deliberately uses it. Reassess browser and session utilities when enabling that catalog. A default-deny rule is not a guarantee that every catalog utility issues a permission check.

`PROJECT`: preserve permission action `edit` for the three mutation tools, but invoke the actual available tool by its own schema. Never fabricate `spawn`, `resume`, `wait`, `list`, or `model` arguments from another agent framework.

## 5. Skills: native behavior and project dependencies

`NATIVE` [D4]: discover skills in global/project OpenCode directories, compatibility directories, or root configuration `skills` entries. Root-level `name.md` and nested `name/SKILL.md` are supported. IDs derive from paths, are case-sensitive, and differ from display names. Later registrations can replace the same ID.

| Skill frontmatter | Native meaning |
|---|---|
| `name` | Display label |
| `description` | Discovery summary |
| `slash` | Interactive catalog visibility |
| `metadata.opencode/slash` | Overrides `slash` |
| `metadata.opencode/autoinvoke` | Controls model-list visibility |

`NATIVE` [D4]: frontmatter is optional; discovery needs a description. Loading uses `skill({id})`, checks permission, and adds the body. Supporting file contents require separate reads. `autoinvoke: false` does not prohibit explicit loading. Portable lowercase kebab-case IDs are recommended rather than enforced. Top-level `skills` config entries add sources; they are not an agent's required-skill list.

### 5.1 Project required-skill contract

- MUST declare required skills once, as a bullet in the agent's final `## Rules` section.
- MUST load each dependency before its first dependent operation, in the relevant session.
- MUST verify exact IDs and winning definitions; do not confuse a permitted skill with an installed or loaded skill.
- MUST check supporting-file and execution permissions. A primary with only `skill` permission may load a body but remain unable to follow references or execute scripts.
- MUST return `BLOCKED` with the missing ID, denied capability, or incompatible requirement when a mandatory dependency cannot be used. Never claim it was loaded.
- MUST record dependencies required by children in the child's contract; a parent's skill load is not proof of child-session readiness.

| Profile | Required skills retained from samples |
|---|---|
| Builder normal | `brainstorming`, `opencode-model-routing` |
| Planner | `brainstorming`, `writing-plans`, `opencode-model-routing` |
| Research normal / extra | `opencode-model-routing` |
| Research fast | None mandatory in the supplied file |

These skills were not attached. Their internals, path requirements, and any custom routing API remain `UNVERIFIED`. Do not manufacture their contents or turn their names into native OpenCode features.

## 6. Model selection and routing

`NATIVE` [D5]: use `provider/model#variant`, with an optional variant. Provider and model IDs are case-sensitive; a model ID can itself contain `/`. An expanded selector uses `providerID`, `model`, and optional `variant`. Availability depends on the active location's providers and credentials; use actual catalog IDs.

`PROJECT`: prefer the string selector in handwritten agents. Preserve a single routing precondition immediately after `### Subagents`:

> PRECONDITION: MUST load `opencode-model-routing` in this session before the first child dispatch; MUST resolve and verify the applicable route before each dispatch or continuation. EXIT with `BLOCKED` when the required route cannot be applied through a supported mechanism.

The supplied “every dispatch/resume MUST pass a `model`” instruction is **not established by the documented tool contract**. Do not require that argument until the installed tool schema or a documented extension proves support. A resolved route must be applied through a supported configuration/session/tool mechanism and checked against the actual child model. If none is available, block the affected dispatch rather than pretending prompt text changes the model.

For resumed children, verify whether the route is still valid; do not assume continuation changes models. For skeptic/validation diversity, choose a different supported model when available; otherwise record the shared-model limitation. Do not assert independent verification merely from different model names.

## 7. Project agent-body standard

Everything in this section is `PROJECT`, not native Markdown schema validation.

### 7.1 Mandatory layout

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

### 7.2 Size and wording

| File type | Target | Hard ceiling |
|---|---:|---:|
| Primary | 150 lines | 160 lines |
| Specialist | 90 lines | 120 lines |

Count physical lines, including YAML and blanks. A target overrun needs an explicit reason in the change report; exceeding the ceiling fails acceptance. This source-of-truth document is exempt.

Use `MUST`, `NEVER`, `ONLY`, `PRECONDITION`, and `EXIT` for binding rules. Convert vague `should`, `prefer`, `try to`, `carefully`, and `as needed` directives into a condition, action, and outcome. Explanatory prose and source descriptions need not use normative keywords. Keep one owner for each requirement; Workflow references the rule instead of copying it.

### 7.3 Contracts and failure handling

Use one transport per child report: JSON or structured Markdown with fixed fields. Do not demand both “JSON only” and the samples' “structured markdown” suffix. Enumerate domain-specific report statuses rather than inventing one universal status set.

A minimal specialist envelope can be specified as:

```text
Status: READY | BLOCKED
Summary: string
Evidence: array of { Reference: string, Finding: string }
BlockingQuestions: string[]  # non-empty exactly when Status = BLOCKED
```

The original `READY`, `REQUEST_ANALYZER`, `SUCCESS`, `PASS`, `CHANGES_REQUIRED`, `WEAKENED`, and `BROKEN` statuses belong to different contracts. Before use, require a matching producer schema and a consumer transition for every value. Define malformed output, tool failure, cancellation, and exhausted budget handling explicitly; never interpret missing status as success.

Default retry policy: initial attempt plus at most two retries per logical task unit. Resuming or creating a new session does not reset this budget. Retry only with a concrete correction or a transient-failure reason; then return `BLOCKED` with completed work and the remaining issue.

### 7.4 Delegation and session lifecycle

- MUST keep orchestration internal: slot IDs, synthetic context IDs, and scheduling notes stay out of child prompts.
- MUST pass task scope, exact affected paths, acceptance conditions, relevant findings, and required report format.
- MUST retain the real returned session handle and pass it through supported tool arguments for continuation.
- MUST reuse a compatible active/resumable child for follow-up work when available; never invent a resume capability.
- MUST partition parallel mutations into non-overlapping file sets; serialize or merge overlapping work.
- MUST inspect custom leaf-agent permissions before relying on no-delegation or read-only guarantees. A sentence in the parent's Rules does not enforce the child's permissions.
- NEVER treat a prompt-level slot cap, stop rule, or approval gate as an engine-enforced limit.

## 8. Project workflow and approval standard

### 8.1 Profiles

| Profile | Direct work | Delegated work | Mutation policy |
|---|---|---|---|
| Builder normal | Questions, permitted skills, synthesis | Analysis, implementation, verification | Primary performs no direct edits |
| Planner | Read/search and approved plan-artifact writes | Analysis and review | Source/config/tests remain read-only |
| Research fast | Web research and synthesis | None | No writes |
| Research normal | Orchestration and synthesis | Scout/deep/specialists/audit | No writes across the research team |
| Research extra | Orchestration, evidence-gap tracking | Bounded concurrent research waves | No writes across the research team |

“Read-only planner” means read-only project implementation with a declared plan-artifact exception. Validate that `writing-plans` selects a path inside the allowed artifact root; if it does not, report the conflict before writing. Do not alter the skill, widen permissions, or move the plan silently.

### 8.2 Human checkpoint

For implementation mutations, present `AffectedFiles: File | Action | Why`, 3–6 key-change bullets, verification criteria, and material unresolved questions. Use canonical decisions `proceed | revise | cancel`. An existing `approve` maps to `proceed`; `re-run` / `re-analyze` maps to `revise` and renewed analysis. Cancellation has an explicit exit path.

Recognize explicit authorization already given for the same concrete scope; do not ask repeatedly without a material change. A proposed expansion of affected files or behavior returns to the checkpoint. Read-only research does not require this implementation gate.

A planner may create/update a draft in its declared artifact root as part of an authorized planning request; approval governs marking it approved and handing it to implementation. This is the explicit exception to the former blanket “gate before every mutation” wording.

### 8.3 Verification and reporting

Capture the initial working state. Verify the actual resulting changes against approved scope, preserve unrelated existing user changes, and report tests/checks with their results. “Clean verification diff” means explained, in-scope changes and no unexplained regressions; it does not mean an empty diff or pristine repository.

A builder MUST handle each implementation result, run final scope/behavior checks, and distinguish implemented, verified, blocked, and unverified work. NEVER commit, push, amend, or publish without explicit authorization for that action.

Research MUST distinguish sourced facts, inference, contradiction, and uncertainty. A validator may corroborate a primary source using a separate retrieval/check; forcing an entirely disjoint source set must not exclude the only authoritative evidence. Source provenance and method independence matter more than artificial source diversity.

### 8.4 Research budgets

Preserve evidence-saturation stopping criteria, but define a finite operational escape condition for every research run: a selected time, cost, call, or wave budget, plus cancellation and repeated-no-progress handling. Exhaustion produces a qualified synthesis with unresolved gaps, never an assertion of completeness.

For extra research, retain the supplied run-wide concurrent ceiling of 16. Replace an `UNLIMITED` concurrent slot value in future agent revisions with a numeric value no higher than the global ceiling. An optional uncapped *total* dispatch count is a separate policy and still requires an operational stopping budget. The supplied scout table cap of 8 and first wave of 5 are compatible; describe them as maximum capacity and actual initial dispatch respectively.

For normal research, the deep phase can involve 5 deep + 1 timeline + 1 quant simultaneously. Declare its intended global cap explicitly during migration instead of assuming a cap of 5 covers all roles. Do not change coverage or model-cost policy as an incidental formatting fix.

## 9. Reusable permission fragments

These are project-authored examples, not replacement files. Adapt them only after checking the workflow and live catalog. Each fragment is independently rooted at default deny; do not concatenate fragments blindly.

### 9.1 Solo web research

```yaml
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: websearch, resource: '*', effect: allow }
  - { action: webfetch, resource: '*', effect: allow }
  - { action: skill, resource: '*', effect: allow }
```

### 9.2 Orchestration-only primary

```yaml
permissions:
  - { action: '*', resource: '*', effect: deny }
  - { action: question, resource: '*', effect: allow }
  - { action: skill, resource: '*', effect: allow }
  - { action: subagent, resource: 'team/analyzer', effect: allow }
  - { action: subagent, resource: 'team/implementer', effect: allow }
```

`team/analyzer` and `team/implementer` are illustrative IDs, not claims that these agents exist. Skills needing local references require a separately reviewed read grant or a compatible workflow.

### 9.3 Planner artifact exception

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

## 10. Audit of the supplied primary agents

The labels below identify uploaded files, not inferred installed IDs. `normal.md` and `normal (1).md` have different roles and MUST NOT be merged because of their similar names.

| File | Role / lines | Findings to address in a future authorized change |
|---|---|---|
| `normal.md` | Builder orchestrator / 72 | `list` lacks a documented Core target; per-call `model` requires live-schema proof; duplicate orchestrate-only wording; missing implementation failure/cancel transitions; success requires defined verification, not an empty diff |
| `planner.md` | Planner/reviewer / 90 | `list`; `.env.*` is not covered by its explicit `.env` deny; `writing-plans` path is unknown; draft writes contradict the old universal mutation gate; `git diff *` is broader than strict inspection; cancel and report schemas need definition |
| `fast.md` | Solo researcher / 51 | Default-deny web profile is coherent; solo exemption applies; `UserTopic` is a prompt variable, not a native tool input; skill supporting-file dependencies and provider availability require checks |
| `normal (1).md` | Research orchestrator / 71 | Custom child/DTO definitions missing; no global concurrency cap; routing mechanism unverified; audit diversity uses soft `SHOULD`; report truncation must retain evidence references and uncertainty |
| `extra.md` | Extended researcher / 119 | `UNLIMITED` in concurrent-slot column conflicts with numeric capacity semantics; define operational stop budget; preserve 16 global cap; distinguish scout capacity 8 from initial 5; do not require disjoint sources at the cost of authoritative verification |

All supplied YAML frontmatters use the native ordered `permissions` shape and an initial catch-all deny. All five fit the primary line target. All four delegating primaries include the routing sentence and a Subagents table. None of those observations proves that referenced children, models, tools, or skills are installed.

### 10.1 Cross-file dependency findings

| Dependency | Observed status | Acceptance requirement |
|---|---|---|
| `great-builder/planner/analyzer`, `great-builder/planner/reviewer` | Referenced; definitions absent | Verify IDs, modes, own permissions, and output contracts |
| `general` | Built-in ID referenced; effective override unknown | Verify installed effective configuration and implementation report contract |
| `research/shared/{scout,deep,timeline,quant,skeptic,validation}` | Custom IDs referenced; definitions absent | Verify every child; do not substitute a nonexistent built-in scout |
| `brainstorming`, `writing-plans`, `opencode-model-routing` | Referenced; bodies absent | Verify discovery, loading, references, and compatibility |
| Per-call/resume `model` argument | Required by sample prose; not verified | Inspect actual schema or supported routing extension |
| `execute` dependency | No sample grants it | Verify direct-tool exposure before deciding whether it is required |
| No-delegation / research read-only | Parent prose only for unseen custom children | Inspect and test effective child permissions |

### 10.2 Changes made to the original optimization specification

- Added version/date/evidence status, source links, and an explicit schema-conflict record.
- Separated native runtime behavior from stricter project authoring rules.
- Added `disabled`, complete `request` shape and its documented runtime limitation.
- Replaced global keyword bans with structural checks; retained the project sampling prohibition.
- Added tool/resource distinctions, skill dependency checks, and routing-capability verification.
- Reconciled solo agents, planner artifacts, approval vocabulary, finite concurrency, retries, and success criteria.
- Added a file-by-file migration backlog and executable acceptance procedure; no primary-agent file was changed.

## 11. Acceptance procedure for every future change

Run in the target project/configuration context. Use disposable files and child sessions for behavioral checks; do not probe permissions on real secrets or production operations.

1. **Identify:** record runtime version/build, agent deployment IDs, input hashes, requested scope, and this spec revision.
2. **Refresh evidence:** open only relevant current V2 sources; check schema identity and document differences before changing the baseline.
3. **Parse:** reject duplicate YAML keys; check frontmatter types, enums, unsupported keys, and forbidden sampling keys recursively.
4. **Resolve:** inspect the merged agent entry and live catalog, including global/project overrides, policies, saved approvals, skill winners, and child definitions.
5. **Trace capabilities:** map each workflow operation to a callable tool, its permission action/resource, and dependencies. Resolve all required-but-denied operations without blanket grants.
6. **Review behavior:** check layout, routing precondition, table/allowlist agreement, closed output contracts, failure transitions, gates, slot limits, operational budgets, and line budgets.
7. **Validate in runtime:** load the actual Markdown with the installed parser, confirm discovery by exact ID, then exercise the relevant cases below. YAML parsing alone is not runtime validation.
8. **Review changes:** compare against the initial state and approved scope; preserve unrelated work. Report successful checks separately from skipped or blocked checks.
9. **Record:** update this document when a rule changes; apply agent changes only when requested. Never mutate all profiles merely because the source-of-truth file was revised.

### 11.1 Focused behavioral cases

| Case | Expected result under the selected project profile |
|---|---|
| Catch-all deny followed by exact allow | Allowed target succeeds; a neighboring target is denied |
| Leaf child attempts delegation | Denied by the child's effective rule |
| Solo researcher attempts edit/shell/child call | Denied |
| Planner writes `local/check.md` vs `src/check.ts` | Artifact allowed; source mutation denied |
| Read `.env`, `.env.production`, nested equivalents | Explicit project deny applies; check other access channels separately |
| Read authorized external fixture | Directory and read rules both satisfied |
| Load missing / denied required skill | Report exact dependency failure, never claim readiness |
| Continue a child session | Correct returned handle and preserved task contract |
| Unsupported `model` argument | Not sent; use verified route or report blocker |
| Enable Code Mode with nested edit denied | Nested edit remains denied; review exposed utility exceptions |
| Implementation scope expands | Update affected-file plan and obtain required scope authorization |
| Child result malformed / retry limit reached | Correct bounded failure transition |
| Research budget exhausted with open gaps | Qualified synthesis; gaps explicitly retained |

### 11.2 Acceptance record

```text
SpecRevision: 2.0.0
RuntimeVersion: <actual version, or UNVERIFIED>
AgentIDs: <resolved installed IDs>
ChangedFiles: <paths and actions>
NativeSchemaCheck: PASS | FAIL | UNVERIFIED
ProjectPolicyCheck: PASS | FAIL | UNVERIFIED
RuntimeSmokeCheck: PASS | FAIL | UNVERIFIED
DependencyCheck: PASS | FAIL | UNVERIFIED
Exceptions: <explicitly accepted scope/size exceptions, or none>
RemainingBlockers: <specific blockers, or none>
```

For this revision: documentation review and local static checks were completed. The remote schema conflict remains open. Runtime smoke and installed-dependency checks are `UNVERIFIED`; this document does not certify the five sample agents as deployment-ready.

## 12. Maintenance and reuse rules

- MUST use this document as the family policy baseline while treating release-specific runtime evidence as the authority on what OpenCode actually supports.
- MUST increment the spec revision for changes to fields, permissions, routing, required skills, contracts, or workflow gates; record the changed rule and affected profiles.
- MUST recheck relevant sources on an OpenCode upgrade or capability change; never claim this dated snapshot covers every future V2 release.
- MUST distinguish a native incompatibility, project-policy failure, and unavailable dependency in review results.
- MUST keep amendments and migration decisions in this file when the user requests source-of-truth-only work.
- NEVER edit primary agents, child agents, skills, provider settings, or runtime policies merely to make this document's verification status look complete.