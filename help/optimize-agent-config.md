# Agent Config Protocol Spec (LLM Read-Only)

## Reference Data
- **Line budget:** `mode: subagent` ≤ 90 lines; `mode: primary` ≤ 150 lines.
- **Temperature:** mutating executor / verifier `0.0` · analyzer / orchestrator `0.1` · report / planning `0.2–0.3` · creative ≤ `0.5`; use ≤ `0.1` when closed enums are present.
- **Tables over prose:** use markdown tables for any mapping of 3+ items.

## Structure (Sandwich Layout)
1. **YAML Frontmatter:** `description`, `mode`, `temperature`, `permission`.
2. **`## Core Definition`:** primary → `Inputs` + `Subagent Contracts` table (`Name | Max Amount | Contract Define`); subagent → `Inputs` + `### Output Criteria` DTO with closed enums.
3. **`## Execution Workflow`:** numbered phases (`### N. Phase Name`), slot dispatches, status routing.
4. **`## Rules`:** flat bullet list; MUST be the final section.

## Primary Orchestrator
- Define dynamic outputs (no fixed `### Outputs` section).
- Include 1 Human Checkpoint Gate at the read-only → mutating boundary: present summary, await `proceed` | `revise` | `cancel`; omit the gate only if the pipeline never mutates files.
- Never edit or write source code directly.
- Never pass slot keywords, `spawn`, or `resume` inside subagent task payloads.

## Subagent
- Output Criteria must use closed enums.
- Include `task: deny` in the permission block.
- Include a no-delegation rule in `## Rules` (e.g., "Never delegate tasks or invoke other agents.").

## Global Rules
- Binding keywords only (`Must`, `Only`, `Never`, `Precondition`); no soft keywords (`should`, `prefer`, `try to`), no fluff, rationale, or motivational padding.
- No constraint duplication across Workflow and Rules — Rules owns constraints.
- Default `MaxRetries = 3` on failure loops, transitioning to `BLOCKED` on breach, unless the pipeline specifies otherwise.
