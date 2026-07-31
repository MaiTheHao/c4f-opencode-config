# Agent Config Protocol Spec (LLM Read-Only)

> **Models:** Primary: DeepSeek MoE (R-series). Secondary: Claude, GPT-4o, Gemini.
> **Paradigm:** Protocol over Prompt — Deterministic API contracts over conversational instructions.

---

## Pillar 1: Markdown Sandwich Attention Layout
- **PRE-TOP:** YAML Frontmatter (`description`, `mode`: `primary`|`subagent`, `temperature`, `permission` matrix).
- **TOP (Primacy):** `## Core Definition` (`Inputs`, `Subagent Contracts` or `Output Criteria`).
- **MIDDLE:** `## Execution Workflow` (Explicit phases `### N. Phase Name` with numbered steps & parallel dispatch).
- **BOTTOM (Recency):** `## Rules` (Flat bullet list: constraints, `MaxRetries`, prohibitions). **MUST be the last section.**

---

## Pillar 2: Declarative Interface & Single Responsibility
- **Noun over Verb:** Declare interfaces/specifications, not manual instructions (`ScopeDiscovery` vs `Analyze codebase`).
- **Exclusive Boundaries:** Explorer (Exploration/Data), Analyzer (Scope/Contract), Implementation (Code Edits), Review (Verification). No cross-domain overlap.

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
  4. Orchestrators dispatch tasks with suffix: `"Respond ONLY in structured markdown adhering to your Output criteria."`
  5. Subagents MUST contain rule: `- Never delegate tasks or invoke other agents`.

---

## Pillar 5: Workflows & Anti-Loop Guardrails
- **Execution Graph:** Direct state transitions mapped via explicit numbered steps per phase.
- **Preconditions:** Enforce state constraints before execution (`Precondition: ExecutionContract.Status = READY`).
- **Anti-Loop Limits:** Enforce `MaxRetries = 3` on cyclical loops (`Review -> FIX_REQUIRED`, `Explorer -> REQUEST_EXPLORER`). Immediately transition to `BLOCKED` on breach.

---

## Pillar 6: Standardized Vocabulary & Section Isolation
- **Global Vocabulary:** `Inputs` | `Outputs` | `Read` | `Must` | `Never` | `Exit` | `Status` | `Preconditions` | `ExplorationRequest`.
- **Single Abstraction Level:** Keep data (`Inputs`), operations (`Workflow`), and constraints (`Rules`) completely separated. Do not embed constraints in data fields.

---

## Pillar 7: Interface Skeleton Templates

### 7.1 Orchestrator Template
```markdown
---
description: High-throughput orchestration agent for deep analysis and parallel implementation.
mode: primary
temperature: 0.1
color: '#22c55e'
permission:
  task:
    '*': deny
    'namespace/explorer': allow
    'namespace/implementation': allow
    'namespace/review': allow
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

#### 1. Explorer Subagent (`namespace/explorer`)
- **Inputs:** Target goal, scope hints, search requests, caller context & constraints.
- **Output Criteria (`ExplorationResult`):** Exploration summary, dependencies, recommended affected scope, `ExecutionContract` (Status: `READY` | `BLOCKED` | `REQUEST_EXPLORER`).

#### 2. Implementation Subagent (`namespace/implementation`)
- **Inputs:** Task description, Execution contract context.
- **Output Criteria (`ImplementationResult`):** Modified files list, exit status (`SUCCESS` | `REQUEST_EXPLORER`).

#### 3. Review Subagent (`namespace/review`)
- **Inputs:** Task description, Execution contract context, modified files list.
- **Output Criteria (`VerificationResult`):** Result status (`PASS` | `FIX_REQUIRED` | `REQUEST_EXPLORER`), list of issues.

## Execution Workflow

### 1. Exploration & Analysis Phase
1. Partition task scope into independent target domains.
2. Spawn parallel `namespace/explorer` subagents concurrently.
3. Aggregate findings into master `ExecutionContract`.
4. If `ExecutionContract.Status = REQUEST_EXPLORER`: re-spawn explorers.
5. If `ExecutionContract.Status = BLOCKED`: ask user.
6. If `ExecutionContract.Status = READY`: proceed to Implementation Phase.

### 2. Implementation Phase
1. Partition `RequiredChanges` into non-overlapping file sets.
2. Spawn parallel `namespace/implementation` subagents concurrently.
3. Collect and merge `ImplementationResult` findings.
4. If any `ExitStatus = REQUEST_EXPLORER`: re-spawn explorers -> update contract -> re-implement.
5. If all `ExitStatus = SUCCESS`: proceed to Review Phase.

### 3. Review & Verification Phase
1. Pass `ExecutionContract` + `ModifiedFilesList` to `namespace/review`.
2. If `Result = FIX_REQUIRED`: forward issues to `namespace/implementation`.
3. If `Result = PASS`: proceed to Final Reporting Phase.

### 4. Final Reporting Phase
1. Summarize completed task to user.
2. List `FilesModified` with actions.

## Rules
- Receive `UserTask`, dispatch subagents with strict markdown directives, strip `<think>` blocks, interpret status indicators, and execute sequential phases (Exploration -> Implementation -> Review).
- Execute Final Reporting Phase ONLY when `namespace/review` returns `Result = PASS`.
- Enforce `MaxRetries = 3` on loop iterations; transition to `BLOCKED` immediately on breach.
- **Never** modify codebase directly (all edits delegated to `namespace/implementation`).
- **Never** call `namespace/explorer` directly while in Review Phase.
- **Never** bypass `namespace/review` after Implementation Phase.
- **Never** mark task complete without `Result = PASS` from `namespace/review`.
- **Never** expose internal orchestration topology or subagent chat logs to user.

```

### 7.2 Subagent Template

```markdown
---
description: Focused subagent for targeted task execution.
mode: subagent
temperature: 0.0
permission:
  edit: allow
  write: allow
  read: allow
  grep: allow
  glob: allow
---

## Core Definition

### Inputs
- `TaskDescription`
- `ExecutionContract`

### Output Criteria (`ImplementationResult`)
Must provide implementation outcome including:
- `FilesModified`: List of paths and actions
- `ExitStatus`: `SUCCESS` | `REQUEST_EXPLORER`

## Execution Workflow

### 1. Input Validation & Scope Mapping
1. Read input contract boundaries.
2. Verify target components.

### 2. Execution Phase
1. Perform file modifications strictly within declared scope.
2. Format final response conforming to `ImplementationResult` criteria.

## Rules
- **Precondition:** `ExecutionContract.Status = READY`
- Format final response clearly adhering to `ImplementationResult` criteria fields.
- **Never** expand scope beyond declared `AffectedFiles`.
- **Never** delegate tasks or invoke other agents.

```

---

## Pillar 8: DeepSeek MoE Optimizations

* **`<think>` Block Isolation:** Reserved tags: `<think>`, `<reasoning>`, `<scratchpad>`, `<reflection>`, `<inner_monologue>`. Orchestrators MUST strip `<think>...</think>` before parsing outputs.
* **Token Budget Compaction:** Enum payloads over descriptive text; zero prose workflows; no motivations.
* **Temperature Rules:**
* Executor / Verifier: `0.0`
* Analyzer / Explorer / Orchestrator: `0.1`
* Creative / Planning: `0.3 – 0.5` (Note: `temperature > 0.3` risks compliance drift).


* **Numbered Phase Steps:** Workflow phases MUST use numbered list steps (`1.`, `2.`) to align with DeepSeek reasoning blocks.

---

## Protocol Compliance Checklist

```text
[ ] Frontmatter: mode, temperature, permission matrix (Orchestrator denies edit/bash, limits task access).
[ ] Top: ## Core Definition (Primacy).
[ ] Middle: ## Execution Workflow (Numbered steps, status routing, parallel dispatch).
[ ] Bottom: ## Rules (Recency, flat bullet list, MUST be last).
[ ] Reserved tags (<think>, etc.) avoided in config structures.
[ ] Enums used for statuses (READY, BLOCKED, REQUEST_EXPLORER, SUCCESS, PASS, FIX_REQUIRED).
[ ] Zero qualitative fluff / zero design motivations.
[ ] Orchestrator strips <think> blocks, hides internal topology, and delegates all direct edits.
[ ] Subagent prohibited from sub-delegation (`Never delegate tasks or invoke other agents`).
[ ] Anti-Loop Guardrail (`MaxRetries = 3` -> `BLOCKED`) enforced.
[ ] Temperature = 0.1 (Orchestrator/Analyzer), 0.0 (Executors).

```