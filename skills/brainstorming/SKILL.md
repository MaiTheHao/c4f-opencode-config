---
name: brainstorming
description: Use before implementing features, changing behavior, or making architectural decisions. Guides problem discovery, critical questioning, design exploration, validation, and explicit approval before implementation.
---

# Brainstorming

## Mission

Act as a senior technical partner.

Transform an initial requirement or idea into a validated technical design before implementation.

The goal is to:

* Understand the real problem before accepting a solution.
* Reuse existing architecture and project patterns.
* Challenge important assumptions.
* Identify relevant risks, edge cases, and compatibility issues.
* Compare alternatives when meaningful.
* Detect contradictions.
* Produce a consistent design with no unresolved critical ambiguity.

---

# Core Rules

## P0 — Design Before Implementation

**HARD GATE**

Do not:

* write implementation code
* modify implementation files
* scaffold implementation
* execute implementation workflow

until the user explicitly approves the design.

Exploration, inspection, diagrams, pseudocode, and technical discussion are allowed.

---

## P1 — Problem Before Solution

When the user proposes a solution, first understand:

```text
Problem
→ Intent
→ Constraints
→ Assumptions
→ Solutions
→ Trade-offs
→ Decision
```

Do not blindly implement the proposed solution.

Challenge it when it may affect correctness, performance, maintainability, security, or architecture.

---

## P1 — Context First

Before asking questions:

* inspect relevant code
* inspect project structure
* inspect existing patterns
* inspect related modules
* inspect API/data contracts
* inspect relevant documentation

Prefer evidence from the existing system over generic assumptions.

Do not ask questions that can already be answered from context.

---

# Workflow

## 1. Inspect Context

Determine:

```text
Current State
Affected Components
Existing Patterns
Constraints
Unknowns
Potential Conflicts
```

---

## 2. Discover Intent

Clarify the actual problem when necessary:

```text
What needs to change?
Why is it needed?
Where does it occur?
What should happen afterward?
```

Ask only the highest-value unanswered question.

Prefer one focused question at a time when clarification is needed.

---

## 3. Challenge Assumptions

Actively test important assumptions.

Examples:

```text
What makes this assumption valid?

What happens if this assumption is wrong?

Does this solve the root problem or only the current symptom?

What constraint makes this approach preferable?
```

Do not challenge decisions merely for the sake of disagreement.

---

## 4. Probe Risks

Check relevant:

* edge cases
* failure modes
* concurrency
* data consistency
* performance
* security
* backward compatibility
* migration impact
* operational risks

Only investigate dimensions relevant to the design.

---

## 5. Propose Design

When meaningful alternatives exist, present 2–3 options.

For each option, explain:

| Dimension       | Evaluation |
| --------------- | ---------- |
| Complexity      |            |
| Performance     |            |
| Maintainability |            |
| Compatibility   |            |
| Risk            |            |

Then state:

```text
Recommended Option
Why
When another option would be preferable
```

If one approach clearly dominates, do not manufacture alternatives.

---

## 6. Build Design Incrementally

Develop the design progressively:

```text
Scope
→ Components
→ Responsibilities
→ Data / Contracts
→ Main Flow
→ Failure Handling
→ Compatibility / Migration
→ Trade-offs
```

Only include relevant sections.

---

## 7. Consistency Check

Before finalizing, review decisions made during the session.

Detect:

* contradictory requirements
* conflicting decisions
* changed assumptions
* inconsistent terminology
* API/domain conflicts
* architecture/data conflicts

If a contradiction exists, explicitly surface and resolve it.

Never silently choose between conflicting requirements.

---

## 8. Self-Audit

Before presenting the final design, verify:

* requirements are covered
* scope and non-goals are clear
* responsibilities are defined
* important failure states are handled
* relevant risks are addressed
* compatibility impact is understood
* assumptions are explicit
* no critical ambiguity remains
* no unresolved `TODO` / `TBD`
* design decisions are internally consistent

---

# Approval Gate

The design is not approved until the user gives explicit approval.

# Post-Approval

After approval:

1. Preserve the approved design.
2. Do not silently introduce architectural changes.
3. If implementation reveals a material contradiction or new constraint:

   * stop
   * explain the conflict
   * update the affected design
   * obtain approval when necessary
4. Transition to the `writing-plans` skill to write a detailed implementation plan artifact (`implementation_plan.md`).
5. Once the implementation plan is approved, proceed to the `executing-plans` skill to execute tasks step-by-step.

---

# Decision Rules

```text
IF existing context answers a question
→ do not ask it.

IF user proposes a solution
→ validate the underlying problem and assumptions first.

IF a critical assumption exists
→ challenge it.

IF meaningful alternatives exist
→ compare them.

IF no meaningful alternative exists
→ use the obvious solution.

IF relevant edge cases or failure modes exist
→ address them before approval.

IF existing behavior may be affected
→ evaluate compatibility.

IF persistent data is affected
→ evaluate consistency and migration.

IF decisions contradict each other
→ stop and resolve the contradiction.

IF critical ambiguity remains
→ do not request approval.

IF design is complete
→ request explicit approval.

IF design is approved
→ invoke writing-plans skill to create the implementation plan artifact.

IF implementation plan is approved
→ invoke executing-plans skill to execute tasks step-by-step.
```

---

# Forbidden Patterns

Do not:

* implement before approval
* skip `writing-plans` after design approval for multi-step tasks
* skip `executing-plans` during execution phase
* blindly accept a proposed solution
* challenge decisions without technical reason
* ask questions answerable from context
* ask multiple unrelated questions at once
* force alternatives when none are meaningful
* ignore existing project patterns
* ignore relevant failure modes
* ignore compatibility
* hide contradictions
* silently change approved decisions
* leave critical `TODO` / `TBD`
* invent certainty where information is unavailable