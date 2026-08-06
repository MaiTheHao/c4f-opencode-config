---
name: optimize_agent_skill
description: Optimize LLM skills for maximum semantic density, minimal token usage, deterministic execution, and high instruction fidelity. Transform human-oriented documentation into compact machine-oriented policies.
---

# Mission

Transform skills into machine-first execution policies.

Prioritize:

1. Accuracy
2. Semantic Density
3. Token Efficiency
4. Deterministic Behavior
5. Maintainability

Never optimize readability at the expense of execution quality.

---

# Preconditions

Apply ONLY when input is an executable agent skill.

Input SHOULD primarily contain:

- Execution rules
- Constraints
- Decision logic
- Workflow
- Policies

Do NOT apply to:

- Documentation
- Tutorials
- Knowledge bases
- Architecture documents
- Specifications
- API references
- RFCs
- ADRs
- Blog posts

---

# Assumptions

Input may contain:

- Duplicated rules
- Mixed documentation
- Inconsistent formatting
- Redundant explanations

Optimize structure without inventing new policies.

---

# Design Philosophy

A skill is an executable policy.

It is NOT:

- Documentation
- Tutorial
- Knowledge Base
- Best Practices Guide

Every token must satisfy at least one objective:

- Add executable constraints
- Reduce ambiguity
- Improve reasoning consistency

Otherwise remove it.

---

# Optimization Workflow

Apply in the following order:

1. Remove redundancy.
2. Normalize terminology.
3. Merge equivalent rules.
4. Convert prose into executable rules.
5. Reorganize by execution priority.
6. Validate semantic preservation.
7. Validate compression.

---

# Semantic Preservation

Optimization MUST preserve behavioral intent.

Never:

- Change behavioral meaning
- Weaken constraints
- Broaden rules
- Narrow rules
- Alter execution logic
- Invent new policies

Only optimize representation, not behavior.

---

# Compression Rules

## Eliminate

Remove whenever possible:

- Background knowledge
- Long explanations
- Narrative writing
- Marketing wording
- Decorative headings
- Duplicate principles
- Repeated checklists
- Obvious examples

---

## Compress

Prefer:

- Keywords
- Rule tables
- Checklists
- Decision trees
- IF → THEN rules

Instead of descriptive paragraphs.

---

## Merge

Merge related concepts into a single rule block.

Example:

Objects

✓ Encapsulation
✓ Tell > Ask
✓ Law of Demeter
✓ Immutable

Avoid splitting highly related concepts across multiple sections.

---

## Examples

Examples are expensive.

Keep examples only if they define behavior that cannot be expressed as a rule.

Otherwise remove them.

---

# Rule Format

Prefer compact syntax.

Functions

✓ SRP
✓ <30 LOC
✓ ≤2 args
✓ Guard Clause
✗ Boolean Flag

Avoid explanatory prose.

---

# Decision Rules

Convert guidance into executable logic.

IF duplicated logic
→ Apply DRY

IF function >30 LOC
→ Extract Method

IF class has multiple responsibilities
→ Split Class

IF boolean parameter exists
→ Split APIs

IF nested condition
→ Guard Clause

Decision rules have higher retrieval accuracy than descriptive text.

---

# Priority Model

## P0 Mandatory

Hard constraints.

Violations should always be corrected.

---

## P1 Preferred

Apply unless stronger constraints exist.

---

## P2 Optional

Apply only when beneficial.

---

# Structural Rules

Prefer shallow hierarchy.

Recommended structure:

Mission

Workflow

Mandatory Rules

Preferred Rules

Forbidden Patterns

Decision Rules

Validation

Avoid unnecessary heading depth.

---

# Token Optimization Rules

Reduce token usage by:

- Removing duplicated wording
- Using canonical terminology
- Using symbols (✓ ✗ →)
- Eliminating repeated context
- Avoiding verbose explanations
- Keeping one concept in one location

---

# Validation

A production-ready skill should satisfy:

✓ Machine-first

✓ Single source of truth

✓ Zero duplicated knowledge

✓ High semantic density

✓ Deterministic execution

✓ Minimal context footprint

✓ Easy incremental extension

✓ Behavioral intent preserved

---

# Quality Metrics

Evaluate every skill against:

- Accuracy
- Density
- Compression Ratio
- Retrieval Efficiency
- Determinism
- Extensibility
- Maintainability

Optimization should improve all metrics without changing behavioral intent.

---

# Forbidden Patterns

Do not produce:

- Human tutorials
- Educational articles
- Storytelling
- Large prose blocks
- Repeated principles
- Duplicate validation lists
- Decorative formatting
- Redundant examples

Replace them with executable rules whenever possible.