---
name: clean-code
description: Apply Clean Code principles to write, review, and refactor code into readable, maintainable, and production-ready code.
---

# Mission

Execute clean code principles, refactoring, and code review checks with zero tolerance for code smells.

---

# Priority Rules

## P0 Mandatory Constraints

- **Guard Clauses:** MUST fail fast and return/throw early to eliminate nested branches.
- **Boolean Flags:** MUST NOT pass boolean flags to functions. Split into dedicated functions.
- **Dead Code:** MUST delete unused variables, functions, branches, or commented-out blocks immediately. Rely on Git.
- **Functions:** LOC ≤ 20 lines. Arguments ≤ 2 (wrap 3+ in domain struct / options object). Single responsibility and level of abstraction.
- **Error Handling:** NEVER return or pass `null`. Use `Optional`/`Maybe`, empty collections, or Null Objects. Fail explicitly with descriptive exceptions/Results.
- **Refactoring Safety:** MUST verify tests pass before editing. Separate refactoring from feature changes.

## P1 Preferred Constraints

- **Naming:** Intent-revealing, searchable, pronounceable. Class=Noun (`UserProcessor`), Function=Verb (`calculateTotal`), Boolean=`is`/`has`/`can`/`should`.
- **Command-Query Separation (CQS):** Function MUST mutate state OR return a value, never both.
- **Encapsulation:** Tell, Don't Ask (`wallet.withdraw(amount)` vs checking balance externally). Obey Law of Demeter (`a.doCAction()` vs `a.getB().getC().doIt()`). Default to immutable variables (`const`/`readonly`).
- **Self-Documenting Code:** Comments ONLY for non-obvious *WHY* (algorithms, safety warnings, legal, public API specs). Never explain *WHAT*.

---

# Code Smell & Refactoring Matrix

| Code Smell | Trigger Condition | Refactoring Action |
|---|---|---|
| **Long Method / Large Class** | LOC >20 or multiple responsibilities | Extract Method / Extract Class (SRP) |
| **Primitive Obsession** | Raw primitive representing domain concept | Replace with Value Object (`Email`, `Money`) |
| **Data Clumps** | ≥3 parameters frequently passed together | Extract Parameter Object / DTO |
| **Feature Envy** | Method excessively accesses another class data | Move Method to data owner class |
| **Type Code Branching** | `switch` / `if-else` on type codes | Replace conditional with Polymorphism / Strategy |
| **Deep Nesting** | Indentation depth >2 | Apply Guard Clauses |

---

# Decision Rules

- **IF** function parameters ≥ 3 → **THEN** combine into options object / struct
- **IF** method takes boolean parameter → **THEN** split into separate functions (`actionTrue()`, `actionFalse()`)
- **IF** nested `if` statements exist → **THEN** invert condition and return early (Guard Clause)
- **IF** commented-out code detected → **THEN** delete line completely
- **IF** null check required → **THEN** replace with Null Object pattern or Optional wrapper

---

# Forbidden Patterns

- ✗ Functions > 20 LOC
- ✗ Functions with > 2 arguments
- ✗ Boolean flag parameters (`process(true)`)
- ✗ Deeply nested logic (indentation level > 2)
- ✗ Returning or passing `null`
- ✗ Commented-out code blocks
- ✗ Redundant *what* comments (`// increment i by 1`)
- ✗ Violating Command-Query Separation