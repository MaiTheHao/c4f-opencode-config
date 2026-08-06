---
name: brainstorming
description: You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
---

# Mission

Explore user intent, system architecture, and design specifications through interactive validation before writing code.

---

# Priority Rules

## P0 Mandatory Constraints

- **HARD GATE:** MUST NOT write code, scaffold projects, or execute implementation skills until design proposal is presented and explicitly approved by user.
- **Hand-off:** MUST invoke `writing-plans` skill immediately after final design spec approval.

## P1 Preferred Constraints

- **Decomposition:** If request spans multiple independent subsystems, decompose into sub-projects and brainstorm sub-project #1 first.
- **Clarification:** Ask 1 targeted question at a time (prefer multiple-choice options).
- **Proposals:** Present 2-3 technical options with trade-offs; explicitly highlight recommended option.
- **Spec Path:** Write design specs to `docs/brainstorming/specs/YYYY-MM-DD-<topic>-design.md`.

---

# Execution Workflow

```
1. Inspect Context    → Analyze workspace, existing docs, and code dependencies.
2. Ask Clarifications → Ask 1 targeted multiple-choice question at a time.
3. Propose Options    → Present 2-3 approaches (Pros/Cons + Recommended).
4. Incremental Design → Validate Architecture, Component Boundaries, Data Flow, Error Handling.
5. Spec & Self-Audit  → Save spec to docs/brainstorming/specs/YYYY-MM-DD-<topic>-design.md. Audit for TODO/TBD or contradictions.
6. Hand-off           → Upon user sign-off, trigger writing-plans skill.
```

---

# Decision Rules

- **IF** creative work / feature modification requested → **THEN** enforce `<HARD-GATE>` (no code edit until sign-off)
- **IF** multi-subsystem request → **THEN** split into sub-projects & brainstorm sequentially
- **IF** spec contains `TODO` or `TBD` → **THEN** resolve inline before presenting to user
- **IF** user approves final design spec → **THEN** immediately invoke `writing-plans` skill

---

# Forbidden Patterns

- ✗ Writing code or creating files before design approval
- ✗ Asking multiple open-ended un-structured questions simultaneously
- ✗ Producing single-option take-it-or-leave-it proposals
- ✗ Leaving `TODO`, `TBD`, or ambiguous placeholders in design specs
- ✗ Skipping the `writing-plans` hand-off step
