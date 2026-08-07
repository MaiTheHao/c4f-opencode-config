# Agent Config Protocol Spec (LLM Read-Only)

> **Paradigm:** Protocol over Prompt — Deterministic API contracts over conversational instructions (v2.1).

## Scope Note
Defines **HOW** to structure agent configs (not **WHAT** roles a team must have).
- Exactly 1 `mode: primary` orchestrator (never edits files directly); zero or more `mode: subagent` workers.
- Preserve existing team roles — do not force fixed role pipelines onto existing teams.

---

## Directives & Constraints

### 1. File Structure (Sandwich Layout)
- **MUST** follow strict top-to-bottom order:
  1. **YAML Frontmatter:** (`description`, `mode`, `temperature`, `permission`).
  2. `## Core Definition`: (`Inputs` + `Subagent Contracts` table for primary; `### Output Criteria` DTO for subagent).
  3. `## Execution Workflow`: (Numbered phases `### N. Phase Name`, status routing, slot dispatches).
  4. `## Rules`: (Flat bullet list — **MUST be the final section**).

### 2. Primary Orchestrator Rules
- **MUST** specify dynamic outputs (NO fixed `### Outputs` section in Core Definition).
- **MUST** define `### Subagent Contracts` Markdown Table (`Name | Max Amount | Subagent Contract Define`).
- **MUST** include exactly 1 **Human Checkpoint Gate** at the read-only $\rightarrow$ mutating boundary:
  ```
  N. If <ReadOnlyOutput>.Status = READY:
     - Present summary to user (scope/impact only).
     - Await: `proceed` | `revise` | `re-run`.
     - On `proceed`: next phase; on `revise`/`re-run`: return to phase.
  ```
- **NEVER** edit or write source code directly.
- **NEVER** pass slot assignment keywords (`slot-1`), `spawn`, or `resume` inside subagent task payloads (`TaskDescription`).

### 3. Subagent Rules
- **MUST** define `### Output Criteria` with closed enums (`READY`, `BLOCKED`, `SUCCESS`, `FAIL`, etc.).
- **MUST** state literal rule in `## Rules`: `- Never delegate tasks or invoke other agents.`
- **MUST** include explicit `task: deny` in frontmatter permission block.

### 4. Directives & Execution Limits
- **MUST** use binding keywords (`Must`, `Only`, `Never`, `Preconditions`, `Exit`).
- **MUST** set `MaxRetries = 3` on failure loops (`Review -> FIX_REQUIRED`), defaulting to `BLOCKED` on breach.
- **NEVER** use soft keywords (`should`, `prefer`, `try to`, `carefully`).
- **NEVER** include qualitative fluff, design rationale, or motivational padding.
- **NEVER** duplicate constraints across Workflow and Rules sections (Rules section owns constraints).

---

## Temperature Matrix & Line Budget

| Role Class | Examples | Temp | Rationale |
|---|---|---|---|
| Mutating Executor / Verifier | `implementation`, `review` | `0.0` | Zero variance / reproducible judgments. |
| Analyzer / Orchestrator | `analyzer`, `orchestrator` | `0.1` | Near-deterministic contract & routing logic. |
| Report / Planning | `summary-reporter`, `task-partitioner` | `0.2–0.3` | Minor lexical variety / tradeoff evaluation. |
| Creative | `brainstorm`, `naming` | `0.4–0.5` | Max 0.5 ceiling for divergent generation. |
| **Hard Ceiling** | Closed enums used | `> 0.5` forbidden | Temp $\le 0.1$ if closed enum used; `> 0.5` prohibited. |

- **Line Budget:** `mode: subagent` $\le 90$ lines (ceiling 120); `mode: primary` $\le 150$ lines (ceiling 160).
- **Tables over Prose:** Use markdown tables for any mapping of 3+ items.

---

## Compliance Checklist

```text
[ ] Frontmatter: mode, temp (matrix), permission matrix with explicit task deny.
[ ] Core Definition: Contracts table (Primary) OR Output Criteria DTO (Subagent).
[ ] Workflow: Numbered steps, slot dispatches, status routing, Human Checkpoint Gate (Primary).
[ ] Rules (FINAL): Flat bullet list. Includes "Never delegate tasks or invoke other agents" (Subagent).
[ ] Payload Isolation: No slot keywords/spawn/resume in task payloads.
[ ] Enums & Retries: Closed enums used; MaxRetries = 3 -> BLOCKED.
[ ] Line budget & No Duplication: Rules own constraints; no fluff/rationale.
```