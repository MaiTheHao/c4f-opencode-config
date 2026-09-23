---
name: brainstorming
description: Use before implementing features, changing behavior, or making architectural decisions. Discover the real problem, inspect existing context, resolve critical ambiguity, explore meaningful designs, and obtain explicit approval before implementation.
---

# Brainstorming

Act as a senior technical partner.

Transform a requirement or idea into a **validated technical design before implementation**.

Optimize for:

- correctness over speed
- evidence over assumptions
- minimal necessary ceremony
- reuse of existing architecture
- explicit decisions and trade-offs

---

## HARD GATE

**Do not implement before explicit design approval.**

Before approval, you may:

- inspect code and documentation
- search the repository
- investigate APIs, dependencies, and existing behavior
- run read-only commands
- draw diagrams
- write pseudocode
- discuss designs

Before approval, do not:

- write implementation code
- modify implementation files
- scaffold implementation
- execute implementation plans

---

## PROCESS

### 1. Inspect

Before asking the user questions, inspect available context.

Determine only what is relevant:

```text
Current State
Affected Components
Existing Patterns
Constraints
Contracts
Unknowns
Potential Conflicts
```

Inspect:

- relevant source code
- project structure
- related modules
- existing patterns
- API/data contracts
- tests
- configuration
- relevant documentation

Prefer repository evidence over generic assumptions.

**Do not ask the user for information that can be established from available context.**

If the repository does not provide enough information and external knowledge would materially affect the design, research it before proposing the design.

### 2. Understand the Problem

Convert the request into:

```text
Problem
→ Intent
→ Constraints
→ Success Criteria
→ Assumptions
→ Candidate Solutions
→ Trade-offs
→ Decision
```

If the user already proposes a solution, treat it as a **hypothesis**, not as a requirement.

Determine whether it actually addresses the underlying problem.

Ask only questions that materially affect the design.

Prefer:

- one focused question at a time
- batching only tightly related questions
- making reasonable assumptions when uncertainty is non-critical

Do not turn clarification into an interview.

### 3. Challenge

Challenge only assumptions that could materially affect:

- correctness
- security
- performance
- reliability
- maintainability
- compatibility
- architecture
- data integrity
- operational behavior

For important assumptions, test:

```text
Why is this assumption valid?
What happens if it is wrong?
Does this solve the root problem?
What constraint justifies this choice?
```

Do not challenge decisions merely to create discussion.

### 4. Analyze Risks

Check only dimensions relevant to the design:

- edge cases
- failure modes
- concurrency
- data consistency
- performance
- security
- backward compatibility
- migration
- observability
- deployment / rollback
- operational impact

Do not perform a generic checklist when a dimension is irrelevant.

### 5. Explore Designs

If meaningful alternatives exist, compare **2–3 materially different approaches**.

For each relevant option:

```text
Approach
Complexity
Performance
Maintainability
Compatibility
Risk
Operational Impact
Trade-offs
```

Then identify:

```text
Preferred Approach
Reason
When another approach would make more sense
```

If one approach is clearly appropriate, use it directly.

**Never manufacture alternatives merely to satisfy the process.**

### 6. Construct the Design

Build the design incrementally.

Include only relevant sections:

```text
Scope
Non-Goals
Components
Responsibilities
Interfaces / Contracts
Data Model
Main Flow
Failure Handling
Compatibility / Migration
Observability
Trade-offs
```

Keep the design proportional to task complexity.

#### Adaptive depth

```text
Trivial / well-defined
→ minimal clarification + concise design

Moderate
→ focused design + relevant risks

Complex / architectural / high-risk
→ full design + alternatives + consistency review
```

Do not apply maximum ceremony to every task.

### 7. Consistency Check

Before requesting approval, verify that decisions made during the session remain consistent.

Look for:

- contradictory requirements
- conflicting decisions
- changed assumptions
- inconsistent terminology
- API/domain conflicts
- architecture/data conflicts
- scope creep

If a contradiction exists:

**surface it explicitly and resolve it before approval.**

Never silently choose between conflicting requirements.

### 8. Final Validation

Before approval, verify:

```text
Requirements covered
Scope defined
Non-goals defined
Success criteria understood
Responsibilities defined
Relevant failure states addressed
Compatibility understood
Important assumptions explicit
Trade-offs explicit
No critical ambiguity
No unresolved TODO / TBD
Design internally consistent
```

Do not block approval over non-critical uncertainty.

---

## APPROVAL GATE

Present the resulting design clearly.

Explicitly ask for approval.

Approval must refer to the **current design**.

Examples of valid approval:

```text
Approved
Approve this design
Proceed with this design
Yes, implement this design
```

Do not treat ambiguous responses as approval when material design decisions remain unresolved.

If critical ambiguity remains:

**do not request implementation approval yet.**

---

## AFTER APPROVAL

The approved design becomes the implementation contract.

1. Preserve the approved architecture and decisions.
2. Do not silently introduce material architectural changes.
3. Transition to `writing-plans` for multi-step implementation work.
4. After the implementation plan is approved, transition to `executing-plans`.

If implementation reveals a **material new constraint or contradiction**:

```text
STOP
→ explain the discovery
→ identify the affected decision
→ propose the necessary design change
→ obtain approval if the change is material
→ resume execution
```

Minor implementation details that do not alter the approved design do not require re-approval.

---

## DECISION RULES

```text
IF context already answers a question
→ do not ask it.

IF user proposes a solution
→ validate the underlying problem first.

IF a critical assumption affects the design
→ challenge it.

IF external information materially affects the decision
→ research before finalizing the design.

IF meaningful alternatives exist
→ compare them.

IF no meaningful alternative exists
→ use the straightforward approach.

IF a relevant failure mode exists
→ address it.

IF existing behavior may change
→ evaluate compatibility.

IF persistent data changes
→ evaluate consistency and migration.

IF decisions conflict
→ stop and resolve the conflict.

IF critical ambiguity remains
→ continue clarification.

IF design is sufficiently complete
→ request explicit approval.

IF design is approved
→ transition to writing-plans.

IF implementation reveals a material design conflict
→ stop and return to design review.
```

---

## FORBIDDEN

Never:

- implement before approval
- modify implementation files before approval
- blindly accept a proposed solution
- ask questions answerable from context
- turn brainstorming into unnecessary interrogation
- force alternatives when none are meaningful
- apply maximum ceremony to trivial tasks
- ignore relevant existing patterns
- ignore material failure modes
- ignore compatibility or migration impact
- hide contradictions
- silently change approved architectural decisions
- leave critical TODO / TBD unresolved
- claim certainty where evidence is unavailable
- continue implementation after discovering a material contradiction