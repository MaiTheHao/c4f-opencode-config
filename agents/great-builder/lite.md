# Agent Config Protocol Spec (LLM Read-Only)

> Paradigm: Protocol over Prompt — deterministic API contracts over conversational instructions (v2.2, model-agnostic).

## Formatting Constraints (Read First)
This file MUST remain parseable by any LLM tokenizer, including small/MoE models (e.g. DeepSeek MoE), with no rendering layer.
- ASCII only for logic symbols: use `->`, `<=`, `>=`, `!=`, `=`. Never use LaTeX (`$...$`) or styled unicode arrows/operators.
- No nested blockquotes, no collapsible sections, no HTML tags.
- Every rule keyword (MUST / MUST NOT / NEVER / SHOULD NOT) is plain uppercase text, not italic/bold-only — bold is decorative, not load-bearing.
- Tables use standard GFM pipe syntax only (no merged cells, no multi-line cells).

## 0. Glossary (read before Rules)
| Term | Meaning |
|---|---|
| primary | Orchestrator agent (`mode: primary`). Routes work, never edits files. Exactly 1 per team. |
| subagent | Worker agent (`mode: subagent`). Executes one bounded task, returns a status. |
| slot dispatch | The orchestrator assigning a subagent instance to a task slot (e.g. `slot-1`). |
| status routing | Workflow branching based on a subagent's returned enum (`READY`, `BLOCKED`, etc). |
| DTO | The `### Output Criteria` block defining exactly what a subagent returns. |
| closed enum | A fixed, exhaustive list of allowed string values (no free text). |
| Human Checkpoint Gate | Mandatory pause where the primary presents a summary and waits for user input before mutating anything. |
| payload isolation | Rule that routing/control keywords never appear inside the text sent to a subagent. |

## 1. Scope Note
Defines HOW to structure agent configs, not WHAT roles a team must have.
- Exactly 1 `mode: primary` orchestrator (never edits files directly).
- Zero or more `mode: subagent` workers.
- Preserve existing team roles. Do not force a fixed role pipeline onto an existing team.

## 2. File Structure (Sandwich Layout)
Every config file MUST follow this top-to-bottom order. No section may be reordered, merged, or omitted (subagent skips `Subagent Contracts`; primary skips `Output Criteria`).

1. YAML Frontmatter: `description`, `mode`, `temperature`, `permission`.
2. `## Core Definition`:
   - primary: `Inputs` + `### Subagent Contracts` table.
   - subagent: `### Output Criteria` DTO (closed enums).
3. `## Execution Workflow`: numbered phases (`### N. Phase Name`), status routing, slot dispatches.
4. `## Rules`: flat bullet list. MUST be the final section. No other section may restate these constraints.

## 3. Primary Orchestrator Rules
- MUST NOT define a fixed `### Outputs` section in Core Definition — outputs are dynamic, determined at runtime by which subagents ran.
- MUST define `### Subagent Contracts` as a Markdown table: `Name | Max Amount | Subagent Contract Define`.
- MUST include exactly 1 Human Checkpoint Gate, placed at the read-only -> mutating boundary, in this exact shape:

```
N. If <ReadOnlyOutput>.Status = READY:
   - Present summary to user (scope/impact only).
   - Await: proceed | revise | re-run.
   - On proceed: next phase; on revise/re-run: return to phase.
```

- NEVER edit or write source code directly.
- NEVER place slot keywords (`slot-1`), `spawn`, or `resume` inside a subagent's `TaskDescription` payload (see payload isolation, Glossary).

## 4. Subagent Rules
- MUST define `### Output Criteria` using closed enums only (e.g. `READY | BLOCKED`, `SUCCESS | FAIL`). No free-text status fields.
- MUST include this literal bullet in `## Rules`: `- Never delegate tasks or invoke other agents.`
- MUST set `task: deny` explicitly in the frontmatter `permission` block.

## 5. Language & Determinism Rules
- MUST use binding keywords only: `Must`, `Only`, `Never`, `Preconditions`, `Exit`.
- NEVER use soft/hedging keywords: `should`, `prefer`, `try to`, `recommended`, `ideally`.
- NEVER include qualitative fluff, design rationale, or motivational padding in any section.
- NEVER duplicate a constraint across `Execution Workflow` and `Rules` — `Rules` is the single owner of constraints; `Workflow` only describes sequence and routing.

## 6. Retry & Failure Handling
- Any failure loop (e.g. `Review -> FIX_REQUIRED`) MUST set `MaxRetries = 3`.
- On breach of `MaxRetries`, the subagent MUST default its status to `BLOCKED` and stop — it MUST NOT retry silently or invent a new status.

## 7. Temperature Matrix & Line Budget

| Role Class | Examples | Temp | Rationale |
|---|---|---|---|
| Mutating Executor / Verifier | implementation, review | 0.0 | Zero variance, reproducible judgments. |
| Analyzer / Orchestrator | analyzer, orchestrator | 0.1 | Near-deterministic contract and routing logic. |
| Report / Planning | summary-reporter, task-partitioner | 0.2-0.3 | Minor lexical variety, tradeoff evaluation. |
| Creative | brainstorm, naming | 0.4-0.5 | Divergent generation, 0.5 hard ceiling. |

Hard rules (override the table above when in conflict):
- If the role's `Output Criteria` uses a closed enum, temp MUST be `<= 0.1` regardless of role class.
- Temp `> 0.5` is forbidden for every role class, no exceptions.
- Line budget: `mode: subagent` target `<= 90` lines, hard ceiling `120`. `mode: primary` target `<= 150` lines, hard ceiling `160`.
- Any mapping of 3+ items MUST use a Markdown table, never prose.

## 8. Canonical Minimal Templates
Use these skeletons as the literal starting point. Do not invent alternate section names.

### 8.1 Primary skeleton
```
---
description: <one line>
mode: primary
temperature: 0.1
permission:
  task: allow
  edit: deny
---

## Core Definition
Inputs: <list>

### Subagent Contracts
| Name | Max Amount | Subagent Contract Define |
|---|---|---|
| <name> | <n> | <what it returns> |

## Execution Workflow
### 1. <Phase Name>
<steps, slot dispatch, status routing>

### N. Human Checkpoint Gate
If <ReadOnlyOutput>.Status = READY:
   - Present summary to user (scope/impact only).
   - Await: proceed | revise | re-run.
   - On proceed: next phase; on revise/re-run: return to phase.

## Rules
- Never edit or write source code directly.
- Never place slot keywords, spawn, or resume inside subagent task payloads.
```

### 8.2 Subagent skeleton
```
---
description: <one line>
mode: subagent
temperature: 0.0
permission:
  task: deny
---

## Core Definition
### Output Criteria
- Status: READY | BLOCKED
- <field>: <type>

## Execution Workflow
### 1. <Phase Name>
<steps, MaxRetries = 3 if a failure loop exists>

## Rules
- Never delegate tasks or invoke other agents.
- <role-specific constraints>
```

## 9. Compliance Checklist
```text
[ ] Frontmatter: mode, temp (matches matrix), permission block with explicit task: deny (subagent).
[ ] Core Definition: Subagent Contracts table (primary) OR Output Criteria DTO with closed enums (subagent).
[ ] Workflow: numbered phases, slot dispatches, status routing, exactly 1 Human Checkpoint Gate (primary only).
[ ] Rules is the final section, flat bullet list, includes "Never delegate tasks or invoke other agents" (subagent).
[ ] Payload isolation: no slot keywords / spawn / resume inside any TaskDescription payload.
[ ] Enums closed, MaxRetries = 3 on every failure loop, defaults to BLOCKED on breach.
[ ] Line budget respected; Rules is the sole owner of constraints (no duplication, no fluff).
[ ] File uses only ASCII logic symbols (no LaTeX, no styled unicode arrows).
```