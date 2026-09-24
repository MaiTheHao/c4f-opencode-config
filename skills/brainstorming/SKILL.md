---
name: brainstorming
description: Use before implementing features, changing behavior, or making architectural decisions. Use whenever a request would create or modify code, interfaces, data, or architecture, even if the user does not say "brainstorm". Classifies the task, inspects context, aligns on intent, designs with trade-offs, and gets explicit approval before any implementation.
---

# Brainstorming

Act as a senior technical partner. Turn a request into a **validated design before implementation**.

Priorities: evidence over assumptions · reuse of existing architecture · explicit trade-offs · minimal necessary ceremony.

## Hard Gate

**No implementation before explicit approval of the stage required by the chosen path** (see Step 1).

- Allowed before approval: read code/docs, search the repo, run read-only commands, investigate APIs and dependencies, draw diagrams, write pseudocode.
- Not allowed: write or modify implementation files, scaffold, install dependencies, invoke implementation skills, execute plans.

Approval applies only to the stage actually presented. Approving an idea does not approve a design or plan that has not been presented yet; approving one task does not approve the next. Ambiguous replies are not approval while material decisions remain open. Valid examples: "Approved", "Proceed with this design".

## Step 1: Classify

Say the path out loud so the user can override it (e.g. "This looks bounded, so I'll give a short design in chat").

| Path | When | Output | Approval required |
|---|---|---|---|
| **Spike** | Feasibility question ("can we…", "quick and dirty"). Result is an answer, not code to keep. | Question + probe plan in 2–3 sentences, then findings as a recommendation. Anything built is labeled throwaway. | The question and probe |
| **Bounded** | Well-scoped change to a flow that already exists in the repo. | Short design in chat: approach, files touched, testing. No plan document. | The in-chat design |
| **Architectural** | New project or subsystem, restructured components, changed interfaces others depend on. | Full design in chat (sectioned, with alternatives), then hand off to `writing-plans`. | The design; the plan is approved inside `writing-plans` |

- When in doubt, take the heavier path. No existing flow to read means not bounded.
- The path only upgrades, never downgrades. If hidden complexity appears, stop, say so, and step up.
- If the request spans multiple independent subsystems, decompose first and brainstorm one sub-project at a time.

## Step 2: Inspect

Before asking anything, inspect what is relevant: code, structure, existing patterns, API/data contracts, tests, config, docs, recent commits.

- Never ask what the context can answer.
- If external knowledge materially affects the design, research it first.

## Step 3: Align on Intent

- Identify the problem, intended outcome, who it is for, success criteria, and constraints.
- If purpose is missing, ask one focused question at a time (multiple choice when possible). Batch only tightly related questions. Assume reasonably for non-critical gaps.
- Write back a short note: **Goal / Constraints / Success criteria / Assumptions**, with assumptions marked separately from what the user said. Invite correction and incorporate it before designing. If the request already supplies these, reflect them instead of re-asking.
- Treat a user-proposed solution as a hypothesis: verify it solves the root problem.

## Step 4: Challenge and Risks

Challenge only what materially affects correctness, security, performance, reliability, compatibility, data integrity, or operations.

- For key assumptions ask: Why is it valid? What happens if it is wrong? Does it solve the root problem?
- Check only relevant risks: edge cases, failure modes, concurrency, data consistency, backward compatibility, migration, observability, rollback.

## Step 5: Design

- **Alternatives:** compare 2–3 materially different approaches (complexity, risk, compatibility, operational impact). Lead with the recommendation and say when another would win. If one approach is clearly right, use it. Never manufacture alternatives.
- **YAGNI:** remove anything the success criteria do not require.
- **Existing code:** follow current patterns. Include targeted improvements only where they affect this work. No unrelated refactoring.
- **Isolation:** units with one clear purpose, well-defined interfaces, independently testable.
- **Sections (only the relevant ones):** Scope, Non-goals, Components and responsibilities, Interfaces/contracts, Data model, Main flow, Failure handling, Compatibility/migration, Observability, Trade-offs.
- **Depth:** trivial → concise design; moderate → focused design + risks; complex → full design + alternatives.
- **Architectural path:** present the design in sections and confirm after each. Do not write a spec file; the approved in-chat design is the input to `writing-plans`.

## Step 6: Consistency Check

Before requesting approval, verify:

- No contradictory requirements or decisions, no changed assumptions, consistent terminology, no scope creep.
- No placeholder, TODO/TBD, or requirement open to two readings.
- Requirements, scope, non-goals, success criteria, failure states, compatibility, and trade-offs are all explicit.

Surface any contradiction explicitly and resolve it. Never silently pick a side. Do not block approval over non-critical uncertainty.

## Step 7: Approval

Present the design and ask for explicit approval. Do not request approval while critical ambiguity remains.

Architectural path, in order:

1. Design approval → permits invoking `writing-plans` only.
2. Plan approval (handled by `writing-plans`) → permits `executing-plans`.

## After Approval

The approved design is the implementation contract. Do not silently change the architecture.

- **Spike:** report the recommendation.
- **Bounded:** implement through the normal workflow (TDD applies).
- **Architectural:** `writing-plans` → plan approved → `executing-plans`. Invoke no other skill in between.

If implementation reveals a material new constraint or contradiction:

```text
STOP → explain the discovery → identify the affected decision
→ propose the design change → re-approve if material → resume
```

Minor details that do not alter the approved design need no re-approval.

## Red Flags

| Thought | Reality |
|---|---|
| "Too simple to need a design" | Bounded still gets a short design in chat. |
| "It's bounded, I'll start while they read" | Present, then stop until you hear yes. |
| "I'll call it bounded to skip the full design" | Using a label to skip work means take the heavier path. |
| "It grew, but I'm almost done" | Hidden complexity upgrades the path. Stop and say so. |

## Never

- Implement or modify implementation files before approval.
- Blindly accept a proposed solution.
- Ask questions the context can answer, or turn clarification into an interview.
- Force alternatives, or apply maximum ceremony to trivial tasks.
- Ignore existing patterns, failure modes, or compatibility impact.
- Hide contradictions, or claim certainty without evidence.
- Leave critical TODO/TBD unresolved.