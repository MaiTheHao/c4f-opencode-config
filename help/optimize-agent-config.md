# Agent Configuration Design Principles

The core directive of effective agent prompting is:

> **Do not write prompts as conversational instructions. Define them as protocols or interfaces.**

This paradigm separates basic prompts from scalable multi-agent systems.

---

## 1. Declarative Specifications

An agent configuration is not a user manual; it is a **specification**.

- **Incorrect:**
  ```text
  You should analyze the task carefully before implementation.
  ```
- **Correct:**
  ```text
  Owns

  - Scope discovery
  ```

Large Language Models (LLMs) do not require context on *why* a constraint exists; they require clear ownership of *what* is under their responsibility.

---

## 2. Single-Purpose Sections

Do not mix concerns within a single section.

- **Incorrect:**
  ```text
  Workflow

  - Analyze...
  - Read...
  - Verify...
  ```
  *This mixes state, permissions, and actions.*
- **Correct:** Use distinct sections for separate concerns:
  ```text
  Role

  Owns

  Inputs

  Preconditions

  Output

  Never

  Exit
  ```

Each section must serve a single, unambiguous purpose.

---

## 3. Noun-Based Roles and Tasks

Prioritize nouns over verbs to minimize ambiguity.

- **Incorrect:**
  ```text
  Analyze the scope.
  ```
- **Correct:**
  ```text
  Scope Discovery
  ```
  or
  ```text
  Owns

  - Scope Discovery
  ```

---

## 4. Constraint-Based Behaviors

Avoid soft directives such as "should", "try to avoid", or "prefer". Enforce strict constraints using deterministic keywords.

- **Incorrect:** "Try to avoid..." / "Should..." / "Prefer..."
- **Correct:** Use standard constraint blocks:
  ```text
  Never

  ...

  Must

  ...

  Only

  ...
  ```

---

## 5. Omit Explanations and Motivations

Do not explain the reasoning behind a directive.

- **Incorrect:**
  ```text
  Do not scan the entire repository because it consumes too many tokens.
  ```
- **Correct:**
  ```text
  Read

  - Entry point
  - Related files
  ```

LLMs require instruction, not justification.

---

## 6. Standardized Vocabulary

Maintain a consistent, standardized terminology across all configuration files to reinforce pattern recognition.

- **Incorrect:** Alternating between synonyms (e.g., using `Input`, `Parameters`, and `Receive` in different files).
- **Correct:** Stick to a fixed set of keywords:
  ```text
  Inputs
  Output
  Never
  Exit
  Status
  ```

---

## 7. Schema-Defined Outputs

Always define the structure of expected outputs. Use schemas and enums to prevent open-ended responses.

- **Incorrect:**
  ```text
  Return affected files.
  ```
- **Correct:**
  ```text
  Output

  AffectedFiles:

  RequiredChanges:

  Constraints:
  ```

For states, define strict enums:
  ```text
  Status

  READY
  BLOCKED
  ```

---

## 8. Single-Source-of-Truth Artifacts

Avoid passing disparate, unstructured results between different agents (e.g., separate `Analyzer Result`, `Review Result`, `Implementation Summary`).

- **Correct:** Define a single standard object (e.g., `Execution Contract`) that is passed and updated across the entire pipeline.

---

## 9. Exclusive Ownership

Each responsibility must have a single owner. This is the strongest invariant of a multi-agent system.

- **Example:**
  - `Analyzer` owns `Scope Discovery`
  - `Implementation` owns `Code Modification`
  - `Review` owns `Verification`

Responsibilities must never overlap.

---

## 10. State Machine Workflows

Do not represent workflows as sequential paragraphs ("First", "Then", "Finally"). Model them as state machines.

- **Correct:**
  ```text
  CLASSIFY

  ↓

  ANALYZE

  ↓

  IMPLEMENT

  ↓

  VERIFY

  ↓

  REPORT
  ```

LLMs process state transitions more reliably than conversational steps.

---

## 11. Explicit Preconditions

Define states that must be satisfied before execution starts, rather than embedding checks within the instructions.

- **Incorrect:**
  ```text
  Only implement when ready.
  ```
- **Correct:**
  ```text
  Preconditions

  Status = READY
  ```

---

## 12. Explicit Exit Conditions

Define exact termination states to prevent agents from self-determining when to finish.

- **Correct:**
  ```text
  Exit

  REQUEST_ANALYZER
  ```
  or
  ```text
  Exit

  BLOCKED
  ```

---

## 13. Declarative Logic Over Procedural Prose

Do not use verbose conditional sentences. Use structural constraints and exit states instead.

- **Incorrect:**
  ```text
  If the implementation discovers another file that needs modification, it should ask the analyzer...
  ```
- **Correct:**
  ```text
  Never

  - Expand scope

  Exit

  REQUEST_ANALYZER
  ```

---

## 14. Structured Fields Over Natural Language

Replace descriptive output requests with structured keys.

- **Incorrect:**
  ```text
  The analyzer should output the status and affected files.
  ```
- **Correct:**
  ```text
  Output

  Status:

  AffectedFiles:

  RequiredChanges:
  ```

---

## 15. Standardized Status Enums

Enforce precise enums instead of natural language phrases for statuses.

- **Incorrect:** "Looks good" / "Need some fixes" / "Need more information"
- **Correct:** Use precise enums:
  - `PASS`
  - `FIX_REQUIRED`
  - `BLOCKED`

---

## 16. Space-Free Field Keys

Use clean key formatting without spaces (e.g., PascalCase or camelCase) to mimic Data Transfer Objects (DTOs) and parser-friendly keys.

- **Incorrect:** `Affected Files`, `Required Changes`
- **Correct:** `AffectedFiles`, `RequiredChanges`

---

## 17. Single Abstraction per Section

Ensure that each section header contains only the information defined by its abstraction.

- **Incorrect:** Mixing configuration instructions inside input definitions:
  ```text
  Inputs

  Task

  Do not modify the source directory.
  ```
- **Correct:** Keep constraint instructions in constraint-based sections (e.g., `Never`).

---

## 18. Eliminate Adjectives

Remove fluff adjectives that do not translate to programmatic constraints. LLMs generally ignore qualifiers.

- **Incorrect:** "Carefully analyze...", "Thoughtfully review...", "Comprehensively compile..."
- **Correct:** Use direct verbs/nouns: "Analyze...", "Review...", "Compile..."

---

## 19. Eliminate Motivations

Do not include reasoning or design motivations within prompts. Prompts are execution specs, not design documents.

- **Incorrect:** "To avoid bugs, do not modify files outside scope."
- **Correct:**
  ```text
  Never

  - Modify files outside scope
  ```

---

## 20. Interface-Like Prompt Layouts

Structure the entire agent prompt so that it reads like an interface or class definition.

- **Example:**
  ```text
  Role

  Analyzer

  Owns

  - ScopeDiscovery

  Inputs

  - Task
  - EntryPoint

  Read

  - EntryPoint
  - RelatedFiles

  Output

  ExecutionContract

  Never

  - ModifyCode
  - ExpandScope

  Exit

  READY
  BLOCKED
  ```

This structure presents a clean API boundary rather than a prose guide.

---

## 21. "Protocol, Not Prompt" Paradigm

This is the guiding philosophy of agent design. An effective configuration is not a verbose, "clever" prompt. It is a strict **protocol** defined by:

* **Roles:** Each agent has exactly one defined role.
* **Ownership:** Each responsibility has exactly one owner.
* **Artifacts:** Data transferred between agents is serialized into predefined schemas.
* **State:** The execution path is defined by explicit states and state transitions.
* **Constraints:** Behaviors are governed by `Must`, `Never`, `Only`, `Preconditions`, and `Exit` conditions, rather than soft directives like `should` or `prefer`.
* **Determinism:** Outputs are limited to strict field keys and enums, avoiding natural language variations.
* **Orthogonality:** Each section and agent handles a single concept without overlapping.

In short, design agent configuration files as an **API Contract** or a **Domain-Specific Language (DSL)**, rather than a prompt trying to convince an AI to perform well. A robust protocol eliminates ambiguity and forces deterministic execution across the system.
