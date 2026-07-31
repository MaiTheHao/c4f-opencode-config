# Agent Config Protocol Spec (LLM Read-Only)

> **Models:** Primary: DeepSeek MoE (R-series). Secondary: Claude, GPT-4o, Gemini.
> **Paradigm:** Protocol over Prompt — Deterministic API contracts over conversational instructions.
> **Version:** 2.1 — adds Human Checkpoint Gate, Temperature Matrix, Context Budget enforcement, Topology-Agnostic scope.

## Scope Note (Read First)

This spec defines **HOW** to write any agent config file — structure, tone, contract shape, temperature, checkpoint placement, token budget. It does NOT define **WHAT** roles a team must have.

- Team topology (how many subagents, their names, their responsibilities) is decided per-project. One team may have 4 subagents (explorer/analyzer/implementation/review), another may have 2 (`researcher`, `writer`), another may have 6.
- The only structural constant across ALL teams: **exactly one `mode: primary` orchestrator**, zero or more `mode: subagent` workers, and the orchestrator never edits/writes directly.
- Anywhere this doc uses example role names (`explorer`, `analyzer`, `implementation`, `review`), treat them as **illustrative placeholders**, not a required roster. Apply the same Pillars to whatever roles the actual team has.
- When optimizing an existing team's files: infer their existing roles from `description` + `permission` fields, preserve those roles/names, and apply Pillars 1–9 as style/structure fixes — never inject the 4-role pipeline onto a team that doesn't have it.

---

## Pillar 1: Markdown Sandwich Attention Layout
- **PRE-TOP:** YAML Frontmatter (`description`, `mode`: `primary`|`subagent`, `temperature`, `permission` matrix).
- **TOP (Primacy):** `## Core Definition` (`Inputs`, `Subagent Contracts` or `Output Criteria`).
- **MIDDLE:** `## Execution Workflow` (Explicit phases `### N. Phase Name` with numbered steps & parallel dispatch).
- **BOTTOM (Recency):** `## Rules` (Flat bullet list: constraints, `MaxRetries`, prohibitions). **MUST be the last section.**

---

## Pillar 2: Declarative Interface & Single Responsibility
- **Noun over Verb:** Declare interfaces/specifications, not manual instructions (`ScopeDiscovery` vs `Analyze codebase`).
- **Exclusive Boundaries (topology-agnostic):** Whatever roles a team has, each subagent owns exactly one domain of responsibility, defined by its `description` + permission matrix. No two subagents in the same team may hold overlapping write scope or duplicate mandate. If two subagents' `description` fields could both plausibly handle the same task, the team has a boundary violation — merge or re-split them, don't force them into a fixed generic-role list.
- **Role count is unconstrained:** A team is valid with 1 subagent or 10. This pillar governs boundary clarity between whatever roles exist, not a required minimum/maximum.

---

## Pillar 3: Affirmative & Deterministic Directives
- **Affirmative First:** Use `Must: Output complete code` instead of `Never produce placeholder code`.
- **Binding Keywords:** `Must` | `Only` | `Never` | `Preconditions` | `Exit`. (Eliminate: `should`, `prefer`, `try to`, `carefully`, `thoroughly`).
- **Zero Fluff:** No qualitative adjectives. No design motivations ("Do X because Y").

---

## Pillar 4: Criteria Contracts & Subagent Enforcement
- **Keys & Enums:** Space-free keys (`AffectedFiles`, `RequiredChanges`). Closed enums (`READY`, `BLOCKED`, `REQUEST_EXPLORER`, `SUCCESS`, `PASS`, `FIX_REQUIRED`).
- **Subagent Contract Definition:** Define target subagent string (`namespace/agent`), Inputs DTO, and Output Criteria DTO with Enums under `## Core Definition`.
- **Response Enforcement Protocol:**
  1. No conflicting inline response text directives in `## Rules`.
  2. Subagent Rules MUST state: `Format final response clearly adhering to <CriteriaName> criteria fields`.
  3. Final Workflow Phase MUST step: `Format final response clearly conforming to <CriteriaName> criteria`.
  4. Orchestrators dispatch tasks with literal suffix appended to every subagent prompt: `"Respond ONLY in structured markdown adhering to your Output criteria."`
  5. Subagent Rules MUST contain the literal line: `- Never delegate tasks or invoke other agents.`
  6. Every subagent frontmatter permission block MUST contain an explicit `task: deny` (or full task-map deny) — absence of the key is a violation, not an implicit deny.

---

## Pillar 5: Workflows, Human Checkpoints & Anti-Loop Guardrails
- **Execution Graph:** Direct state transitions mapped via explicit numbered steps per phase.
- **Preconditions:** Enforce state constraints before execution (`Precondition: ExecutionContract.Status = READY`).
- **Human Checkpoint Gate (mandatory, topology-agnostic):** A `READY`/`SUCCESS`-equivalent status is NOT a license to auto-proceed. Identify in the team's own workflow where control crosses from **read-only/proposal work** (any phase that only produces a plan, contract, or report — no matter what it's named) into **mutating/irreversible work** (any phase that writes files, calls external APIs, sends messages, or otherwise changes state outside the conversation). That specific crossing MUST insert an explicit gate step:
  ```
  N. If <ReadOnlyPhaseOutput>.Status = READY:
     - Present <ReadOnlyPhaseOutput> summary to user (scope/impact only — no raw subagent logs).
     - Await one of: `proceed` | `revise` | `re-run`.
     - On `proceed`: continue to next phase.
     - On `revise` / `re-run`: return to current phase with updated scope.
  ```
  Exactly one such gate is REQUIRED per team, placed at the read-only→mutating boundary — regardless of how many phases exist before or after it. Transitions that stay entirely within read-only phases, or entirely within mutating phases, do NOT need a gate.
- **Anti-Loop Limits:** Enforce `MaxRetries = 3` on cyclical loops (`Review -> FIX_REQUIRED`, `Explorer -> REQUEST_EXPLORER`). Immediately transition to `BLOCKED` on breach.
- **Loop vs Gate distinction:** Anti-loop limits bound retries on *failure* paths (BLOCKED/REQUEST_*). The Human Checkpoint Gate bounds *forward progress* on the success path (READY). Both MUST exist independently; one does not substitute for the other.

---

## Pillar 6: Standardized Vocabulary & Section Isolation
- **Global Vocabulary:** `Inputs` | `Outputs` | `Read` | `Must` | `Never` | `Exit` | `Status` | `Preconditions` | `ExplorationRequest`.
- **Single Abstraction Level:** Keep data (`Inputs`), operations (`Workflow`), and constraints (`Rules`) completely separated. Do not embed constraints in data fields.
- **Reserved reasoning tags (exhaustive, MUST be listed literally in orchestrator Rules — not paraphrased as "reasoning blocks"):** `<think>`, `<reasoning>`, `<scratchpad>`, `<reflection>`, `<inner_monologue>`. Orchestrator Rules MUST contain: `- Strip <think>, <reasoning>, <scratchpad>, <reflection>, <inner_monologue> blocks before parsing subagent output.`

---

## Pillar 7: Interface Skeleton Templates (Generic — adapt role names/count per team)

These are structural skeletons, not a required roster. `namespace/role-N` stands for whatever subagents the actual team has — could be 1, could be 8. Do not force a team into 3 phases if it only needs 2, and do not invent roles the team doesn't have.

### 7.1 Orchestrator Template
```markdown
---
description: <One-line: what this team accomplishes end-to-end.>
mode: primary
temperature: 0.1
color: '#22c55e'
permission:
  task:
    '*': deny
    'namespace/role-1': allow
    'namespace/role-2': allow
    # ... one line per actual subagent in this team; no placeholders left unfilled
  question: allow
  git: ask
  list: allow
  bash: deny
  edit: deny
  write: deny
  read: deny
  grep: deny
---

## Core Definition

### Inputs
- `UserTask` (String)

### Subagent Contracts
<!-- One entry per ACTUAL subagent in the team. Add/remove entries freely; the count below is illustrative only. -->

#### 1. `namespace/role-1`
- **Inputs:** <what this role reads from caller>
- **Output Criteria (`Role1Result`):** <summary fields>, `Status` (closed enum, team-specific — e.g. `READY` | `BLOCKED` | `REQUEST_ROLE1`).

#### 2. `namespace/role-2`
- **Inputs:** <what this role reads from caller, incl. prior phase output if any>
- **Output Criteria (`Role2Result`):** <summary fields>, `ExitStatus` (closed enum — e.g. `SUCCESS` | `REQUEST_ROLE1`).

<!-- repeat for however many roles the team actually has -->

## Execution Workflow
<!-- One phase per distinct stage of work. Merge or split phases to match the real pipeline — do not pad to a fixed count. -->

### 1. <Read-Only / Proposal Phase Name>
1. Partition task scope as needed for this team.
2. Spawn parallel `namespace/role-1` subagents where independent.
3. Aggregate into master output contract.
4. If contract `Status = REQUEST_*`: re-spawn the relevant role.
5. If contract `Status = BLOCKED`: halt, ask user.
6. If contract `Status = READY`: **Human Checkpoint Gate (Pillar 5)** — present summary, await `proceed`/`revise`/`re-run`. On `proceed`, continue.

### 2. <Mutating Phase Name>
1. Partition work into non-overlapping units across whichever roles perform mutation.
2. Spawn parallel subagents for independent units; queue dependent ones sequentially.
3. Collect results.
4. If any result requests the read-only phase again: re-spawn it -> update contract -> retry this phase.
5. If all succeed: proceed to next phase (verification, if the team has one; otherwise Final Reporting).

<!-- Add a Verification phase here ONLY if the team has a verifier role. Otherwise skip straight to Final Reporting. -->

### N. Final Reporting Phase
1. Summarize completed task to user.
2. List outcomes/artifacts with actions.

## Rules
- Receive `UserTask`, dispatch subagents with clear context, append literal suffix `"Respond ONLY in structured markdown adhering to your Output criteria."` to every subagent dispatch, strip `<think>, <reasoning>, <scratchpad>, <reflection>, <inner_monologue>` blocks, interpret status indicators, execute phases in order.
- **Never** proceed from a read-only phase to a mutating phase on a `READY`/`SUCCESS`-equivalent status without explicit user confirmation (Human Checkpoint Gate, Pillar 5).
- Enforce `MaxRetries = 3` on loop iterations; transition to `BLOCKED` immediately on breach.
- **Never** perform mutating work directly (always delegated to the team's mutating-role subagent(s)).
- **Never** bypass a verifier role if the team has one.
- **Never** mark task complete without a terminal-success status from the team's final gate role (verifier if present, else the mutating role's own `SUCCESS`).
- **Never** expose internal orchestration topology or subagent chat logs to user.
```

### 7.2 Subagent Template
```markdown
---
description: <One-line: this subagent's single domain of responsibility.>
mode: subagent
temperature: <per Pillar 8 matrix, matched to this role's class>
permission:
  task:
    '*': deny
  edit: <allow|deny — per this role's actual need>
  write: <allow|deny>
  read: allow
  grep: <allow|deny>
  glob: <allow|deny>
---

## Core Definition

### Inputs
- `TaskDescription`
- <any upstream contract this role consumes, if applicable>

### Output Criteria (`<RoleName>Result`)
Must provide outcome including:
- <role-specific result fields>
- `ExitStatus` / `Status`: <closed enum for this role>

## Execution Workflow

### 1. Input Validation & Scope Mapping
1. Read input contract boundaries.
2. Verify target components against declared scope.

### 2. Execution Phase
1. Perform work strictly within declared scope.
2. Format final response conforming to `<RoleName>Result` criteria.

## Rules
- **Precondition:** <upstream status required, if any>
- Format final response clearly adhering to `<RoleName>Result` criteria fields.
- **Never** expand scope beyond declared input boundaries.
- **Never** delegate tasks or invoke other agents.
```

---

## Pillar 8: Temperature Matrix (Mandatory Reference)

Every agent's frontmatter `temperature` MUST match its role class below. Any deviation is a spec violation, not a style choice.

| Role Class | Agent Examples | Temperature | Rationale (compressed) |
|---|---|---|---|
| Executor (mutating) | `implementation`, `apply_patch`, `migration` | `0.0` | Zero variance on code writes; deterministic diff required for review reproducibility. |
| Verifier / Security | `review`, `security-audit`, `lint-gate` | `0.0` | Pass/fail judgments must be reproducible across re-runs. |
| Analyzer / Explorer | `analyzer`, `explorer`, `scope-mapper` | `0.1` | Near-deterministic contract synthesis; tiny variance tolerated for phrasing only. |
| Orchestrator | `orchestrator`, `great-builder` | `0.1` | Routing/state-machine logic must stay deterministic; no creative drift in phase transitions. |
| Structured Extraction | `symbol-indexer`, `dependency-mapper` | `0.0 – 0.1` | Output is a data contract, not prose. |
| Documentation / Report | `changelog-writer`, `summary-reporter` | `0.2 – 0.3` | Minor lexical variety acceptable; structure still fixed. |
| Planning / Decomposition | `task-partitioner`, `roadmap-builder` | `0.3` | Requires weighing tradeoffs; upper bound before compliance drift. |
| Creative / Ideation | `brainstorm`, `naming`, `copy-draft` | `0.4 – 0.5` | Only class where divergent output is desired. **Never exceeds 0.5** in this protocol. |
| **Hard ceiling** | — | `> 0.5` forbidden | Any agent producing `Status`/`Exit`/enum fields must never exceed `0.3`; risk of enum hallucination rises sharply above this. |

**Rule of thumb:** if the agent's Output Criteria contains a closed enum (`READY`/`PASS`/`SUCCESS`/etc.), cap `temperature ≤ 0.1`. If it contains only free-text prose with no enum, `0.2–0.3` is permitted. Creative-only agents (no contract, no enum, `mode: subagent` used purely for generation) may go to `0.5`.

---

## Pillar 9: Context Engineering & Brevity Budget (Mandatory)

Instruction files are context that gets loaded on every agent invocation. Bloated files degrade routing accuracy and burn token budget. Every generated/optimized agent file MUST satisfy:

- **Line budget by mode:**
  - `mode: subagent` → target **≤ 90 lines** total (frontmatter + body). Hard ceiling **120 lines**.
  - `mode: primary` (orchestrator) → target **≤ 130 lines**. Hard ceiling **160 lines**.
  - Exceeding the hard ceiling REQUIRES splitting into a new subagent or moving detail into a referenced `skill` file — never inline padding.
- **No redundant restatement:** A rule stated once in `## Rules` MUST NOT be re-explained in prose inside `## Execution Workflow`. Workflow steps reference behavior; Rules own the constraint. If both sections say the same thing in different words, delete the workflow-side prose.
- **One example maximum per concept.** Do not stack multiple illustrative phrasings of the same rule ("Never do X" + "Avoid X" + "X is prohibited") — keep exactly one binding statement.
- **Table over prose:** Any mapping of 3+ items (allowed commands, permission scopes, enum meanings) MUST be a markdown table, never a bulleted paragraph — tables compress better per token and parse more reliably.
- **No motivational padding:** Every sentence must be either a data declaration, a workflow step, or a rule. Sentences that only explain *why* (design rationale, background) are deleted unless the rationale changes agent behavior (e.g., `MaxRetries=3` needs no "why").
- **Frontmatter permission compression:** Use wildcard patterns (`'git log *': allow`) instead of enumerating every subcommand variant. Collapse identical-permission tools onto one line where the runtime syntax allows.
- **Self-audit step before finalizing any agent file:** count lines; if over budget, cut in this priority order: (1) duplicate prose, (2) qualitative adjectives, (3) verbose examples, (4) non-behavior-changing rationale. Never cut: enum definitions, precondition lines, `Never`-prefixed rules, permission matrix.

---

## Protocol Compliance Checklist

```text
[ ] Frontmatter: mode, temperature (per Pillar 8 matrix), permission matrix incl. explicit task deny.
[ ] Top: ## Core Definition (Primacy).
[ ] Middle: ## Execution Workflow (Numbered steps, status routing, parallel dispatch).
[ ] Bottom: ## Rules (Recency, flat bullet list, MUST be last).
[ ] Human Checkpoint Gate present at the team's read-only -> mutating-phase transition (Pillar 5) — exactly one, wherever that boundary actually sits for this team.
[ ] Team topology (role count/names) matches what this project actually needs — not forced onto a fixed 4-role template (Scope Note).
[ ] Reserved tags (<think>, <reasoning>, <scratchpad>, <reflection>, <inner_monologue>) listed literally, not paraphrased.
[ ] Enums used for statuses (READY, BLOCKED, REQUEST_EXPLORER, SUCCESS, PASS, FIX_REQUIRED).
[ ] Zero qualitative fluff / zero design motivations.
[ ] Orchestrator strips reserved tags, hides internal topology, delegates all direct edits, appends structured-response suffix to every dispatch.
[ ] Subagent contains literal rule: "Never delegate tasks or invoke other agents."
[ ] Subagent permission block contains explicit task: deny.
[ ] Anti-Loop Guardrail (MaxRetries = 3 -> BLOCKED) enforced, distinct from Human Checkpoint Gate.
[ ] Temperature matches Pillar 8 role class exactly.
[ ] File line count within Pillar 9 budget for its mode; self-audit performed if over.
[ ] No duplicate rule stated in both Workflow and Rules sections.
[ ] All 3+ item mappings rendered as tables, not prose.
```