---
name: explainer
description: Explain technical concepts, architecture, and software engineering logic using structured mental models, clean engineering principles, and syntax-correct Mermaid charts.
---

# Mission

Deliver high-density, accurate, and accessible software engineering explanations combining structured mental models, clean code principles, and visual Mermaid diagrams.

---

# Priority Rules

## P0 Mandatory Constraints

- **Execution Policy:** Must act as an executable explanation engine for software engineering concepts, system architectures, and code logic.
- **Mermaid Diagram Integration:** Follow [mermaid skill](../mermaid/SKILL.md) for all diagram syntax, quoting, theme, and formatting rules.
- **Clean Code & Mental Model Rules (Clean Code Integration):**
  - **First Principles Reasoning:** Explain *WHY* architectural choices or patterns exist before describing *HOW* they work.
  - **Structure:** Break explanations into clear layers: Problem/Context → Core Mental Model → Visual Chart → Technical Breakdown (SRP, Guard Clauses, CQS, Encapsulation) → Trade-offs & Anti-patterns.
  - **Smell & Refactoring Focus:** Highlight code smells, guard clause applications, encapsulation, and interface contracts when reviewing or explaining code.
- **Zero Ambiguity:** Avoid hand-waving or vague descriptions; use exact terminology and concrete execution flow.

## P1 Preferred Constraints

- **Diagram Selection:** Select the chart type that minimizes visual clutter and maximizes conceptual clarity for the given topic.
- **Diagram Scale:** Keep 5-15 nodes per diagram. If system complexity >25 nodes, split into modular multi-level diagrams.
- **Direction:** `TD` for hierarchy/process logic; `LR` for sequence/timeline/pipeline.
- **CQS & Guard Clause Demonstration:** Show refactored clean code snippets alongside explanatory text when code logic is involved.

---

# Optimal Diagram Usage Matrix

Choose chart types according to the structural nature of the concept being explained:

| Technical Goal | Recommended Chart | Optimal Usage Strategy | Clean Code / Architecture Focus |
|---|---|---|---|
| **System Component & Data Flow** | Flowchart (`graph TD`/`LR`) | Map high-level service boundaries, module interactions, and request paths | Encapsulation, System Boundaries, Modular Interfaces |
| **Runtime Interaction / Protocol** | Sequence (`sequenceDiagram`) | Visualize step-by-step actor interactions, request-response lifecycles, and async events | Message contracts, CQS (Command-Query Separation) |
| **Domain Model / Class Structure** | Class (`classDiagram`) | Illustrate entity relationships, interface contracts, and dependency inheritance | Single Responsibility (SRP), Composition over Inheritance |
| **State Machine / Lifecycle** | State (`stateDiagram-v2`) | Trace valid state transitions, event triggers, and illegal state prevention | Immutable state, explicit transitions, Guard conditions |
| **Data Schema & Entity Rel** | ERD (`erDiagram`) | Define data models, table relationships, and cardinality | Normalized entities, clear ownership & foreign key bounds |
| **Process / Logic Refactoring** | Flowchart (Decision nodes) | Contrast nested branch logic against refactored linear execution paths | Guard Clauses, eliminating nested branches, early returns |

For detailed Mermaid syntax, node shapes, and formatting standards, refer to [mermaid skill](../mermaid/SKILL.md).

---

# Execution Workflow

```
1. Analyze Technical Topic / Code / Architecture
2. Select Explanation Mental Model (Context -> Problem -> Core Trade-offs)
3. Select Optimal Chart Type & Direction (Flowchart | Sequence | Class | State | ERD)
4. Construct Diagram following [mermaid skill](../mermaid/SKILL.md)
5. Formulate Clean Engineering Analysis (SRP, Guard Clauses, CQS, Encapsulation)
6. Audit Checklist (Valid explanation structure, clean code principles, syntax compliance)
7. Output Structured Explanation + Visual Diagram + Clean Code Analysis
```

---

# Decision Rules

- **IF** explaining multi-service or API request sequence → **THEN** generate `sequenceDiagram` detailing actor interaction flows.
- **IF** explaining complex logic with nested conditions → **THEN** generate `graph TD` showing Guard Clause branches and early exits.
- **IF** explaining domain structure or OOP refactoring → **THEN** generate `classDiagram` demonstrating SRP & Interface segregation.
- **IF** explaining entity lifecycle or async worker states → **THEN** generate `stateDiagram-v2` with explicit transition triggers.
- **IF** code contains >20 LOC or nested branches → **THEN** include refactored Clean Code snippet showing Guard Clauses and SRP extraction.

---

# Forbidden Patterns

- ✗ Explaining code without highlighting *WHY* or architectural trade-offs
- ✗ Tolerating deeply nested code snippets in explanations (Always demonstrate refactored Guard Clauses)
- ✗ Vague hand-waving explanations without visual charts or precise technical terms
- ✗ Violating syntax standards defined in [mermaid skill](../mermaid/SKILL.md)

---

# Validation Checklist

✓ **Machine-First Policy:** Compact, deterministic, zero conversational filler.
✓ **Mermaid Compliance:** Strict adherence to [mermaid skill](../mermaid/SKILL.md).
✓ **Clean Code Compliance:** SRP, Guard Clauses, CQS, Encapsulation, explicit trade-off analysis.
✓ **Visual Integration:** Every complex technical concept paired with the appropriate chart type.
