---
name: clean-code
description: Apply Clean Code principles to write, review, and refactor code into readable, maintainable, and production-ready code.
---

# Clean Code & Refactoring Guide

## When to Use
- Writing new functions, modules, or services.
- Refactoring legacy code or fixing code smells.
- Conducting code reviews and PR assessments.

---

## Core Engineering Principles

| Principle | Meaning |
|---|---|
| **SOLID** | SRP (Single Responsibility), OCP (Open-Closed), LSP (Liskov Substitution), ISP (Interface Segregation), DIP (Dependency Inversion). |
| **DRY** | Single, authoritative representation of knowledge. Eliminate duplicate logic. |
| **KISS / YAGNI** | Prefer simple solutions. Do not build features until actually required. |
| **Boy Scout Rule** | Always leave touched code cleaner than you found it. |
| **Least Surprise** | Code behavior must match standard developer expectations. |

---

## Naming Conventions

- **Intent-Revealing:** `elapsedTimeInDays` over `d`; `userAccount` over `data`.
- **Searchable & Pronounceable:** Avoid obscure abbreviations (`modymdhms` -> `modificationTimestamp`).
- **No Mental Mapping:** Avoid arbitrary single-letter variables except short loop indexes.
- **By Construct:**
  - **Class/Type/Interface:** Nouns (`OrderProcessor`, `User`).
  - **Method/Function:** Verbs (`calculateTotal()`, `isValid()`).
  - **Boolean:** Prefix `is`, `has`, `can`, `should` (`isActive`, `hasPermission`).
  - **Constant:** `MAX_RETRY_ATTEMPTS`.

---

## Functions & Methods

- **Small & SLA:** Keep <20-30 lines. One responsibility, single level of abstraction per function.
- **Few Arguments:** Prefer 0-2 args. Wrap 3+ args into options object or domain struct.
- **No Flag Args:** Split boolean flag parameters (`render(true)`) into separate functions (`renderAdmin()`, `renderUser()`).
- **Fail-Fast (Guard Clauses):**
  ```javascript
  // Good: Early returns over deep nesting
  function processOrder(order) {
    if (!order) return;
    if (!order.isPaid) throw new Error("Unpaid order");
    if (!order.hasStock) throw new Error("Out of stock");
    // core logic...
  }
  ```
- **CQS (Command-Query Separation):** Mutate state OR return value, never both in one function.

---

## Comments & Documentation

- **Self-Documenting Code > Comments:** Refactor code to explain itself (`if (employee.isEligibleForFullBenefits())` vs inline comments).
- **Good Comments:** Explain **WHY** (non-obvious intent, obscure algorithms, safety warnings, legal headers, public API specs).
- **Bad Comments:** Explaining *what* (redundant text), commented-out code (use Git), journal logs, section dividers.

---

## Objects & Encapsulation

- **Law of Demeter:** Minimize knowledge of internal structures. Avoid `a.getB().getC().doIt()`; delegate to `a.doCAction()`.
- **Tell, Don't Ask:** Tell objects what to do (`wallet.withdraw(amount)`) rather than querying state and mutating externally (`wallet.setBalance(...)`).
- **Immutability:** Default to `const`/`readonly`/immutable data structures to prevent unintended side effects.

---

## Error Handling

- **Exceptions / Result Types:** Prefer exceptions or explicit `Result<T, E>` over error codes (`-1`, `false`).
- **Avoid Null:** Do not return or accept `null`. Use Null Objects, empty collections, or `Optional`/`Maybe`.
- **Contextual Exceptions:** Provide actionable messages and failed inputs within thrown errors.

---

## Code Smells & Refactorings

| Code Smell | Issue | Refactoring |
|---|---|---|
| **Long Method / Large Class** | Too many lines / responsibilities | Extract Method / Extract Class (SRP) |
| **Primitive Obsession** | Raw primitives for domain concepts | Replace with Value Object (`Email`, `Money`) |
| **Data Clumps** | Same parameters passed together | Extract Parameter Object / DTO |
| **Feature Envy** | Method uses another class's data excessively | Move Method to data owner |
| **Switch / If Chains** | Conditional branching on type codes | Replace with Polymorphism / Strategy |
| **Dead Code** | Unused variables, methods, or branches | Delete immediately (rely on Git) |

---

## Refactoring Rules

1. **Test Safety Net:** Ensure unit tests pass before editing.
2. **Small Steps:** Make single atomic changes and re-test.
3. **Separate Concerns:** Never mix feature additions and refactoring in one commit.

---

## Clean Code Checklist

- [ ] **Naming:** Intent-revealing, searchable, consistent conventions?
- [ ] **Functions:** Short (<20-30 lines), single responsibility, guard clauses used?
- [ ] **DRY & KISS:** No duplicated logic, simplest implementation chosen?
- [ ] **Encapsulation:** Tell Don't Ask, Law of Demeter followed?
- [ ] **Error Handling:** Graceful exceptions, no `null` propagation?
- [ ] **Comments:** Self-documenting code; comments only for *why*?
- [ ] **Cleanliness:** Zero dead code, unused imports, or commented-out blocks?