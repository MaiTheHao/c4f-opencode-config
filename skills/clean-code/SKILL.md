---
name: clean-code
description: Use when writing, reviewing, or refactoring code — especially optimizing a single file or a set of related files. Improve readability, maintainability, correctness, and consistency via SOLID, cohesion/coupling, and design patterns, while preserving existing architecture and behavior. Apply principles proportionally; avoid unnecessary abstraction or refactoring.
---

# Clean Code

Act as a pragmatic senior engineer.

Improve code quality **without introducing unnecessary abstraction, behavior changes, or architectural churn**.

Optimize for:

```text
Correctness
→ Clarity
→ Maintainability
→ Consistency
→ Simplicity
```

Clean code is a means, not an end.

# PRIORITY

Apply rules in this order:

```text
P0  Correctness / Safety
P1  Existing Architecture / Project Conventions
P2  Cohesion & Coupling
P3  SOLID
P4  Simplicity / Readability
P5  Maintainability
P6  Performance
P7  Style Preferences
```

Never sacrifice a higher-priority concern merely to satisfy a lower-priority clean-code rule.

# P0 — SAFETY

## Preserve Behavior

During refactoring:

* preserve externally observable behavior
* preserve public APIs unless change is intentional
* preserve error semantics unless change is intentional
* preserve data contracts
* preserve concurrency semantics
* preserve performance characteristics when materially relevant

If behavior must change, treat it as a feature/behavior change rather than a pure refactor.

## Verify Before Refactoring

Before a non-trivial refactor:

* inspect relevant tests
* understand current behavior
* identify affected callers
* identify public contracts
* establish a verification path

Do not assume tests provide complete coverage. When practical, establish a passing baseline before changing behavior.

# P1 — PROJECT CONSISTENCY

Prefer existing project conventions over generic Clean Code doctrine.

Before introducing new abstractions, value objects, patterns, utility layers, error wrappers, or architectural structures — inspect how the project already solves similar problems.

Consistency with the surrounding codebase usually beats theoretical purity.

### Finding project standards

Look for repo-level documentation in this order: `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `docs/`, then inline conventions in the files already touched. Where the repo documents a standard, it wins over any rule in this skill.

# P2 — COHESION & COUPLING

The core lens for judging structure, whether reviewing one file or a related set.

## Cohesion (within a module/class/file)

* Everything in a unit should serve one clear purpose.
* Low cohesion signals: unrelated responsibilities bundled together; a class name that needs "and" to describe it; methods that don't touch the same fields/state.
* Fix by splitting along responsibility, not by mechanically shrinking file size.

## Coupling (between modules/files)

* Prefer depending on stable abstractions (interfaces, contracts) over concrete implementations, **only when the project already does this** (see P1).
* Watch for: circular dependencies, deep reach-through chains (`a.b.c.d.doThing()`), shared mutable state across modules, modules that know too much about each other's internals.
* When reviewing a *set* of related files, map their dependency direction first — flag coupling that goes against the intended layering (e.g., domain layer importing infrastructure).
* Prefer loose coupling + high cohesion: modules that are easy to understand alone and easy to recombine.

Do not decouple things that change together for the same reason — that's often accidental complexity, not clean code.

## Code Smells (Fowler baseline)

Each smell is a heuristic label, never a hard violation. Two rules bind this list:

- **P1 wins**: where the repo documents a convention that endorses a smell, suppress the flag.
- **Always a judgement call**: name the smell, quote the offending code, let the developer decide.

| Smell | Signal | Fix direction |
|---|---|---|
| **Mysterious Name** | Name doesn't reveal what it does/holds | Rename; if no honest name comes, the design is murky |
| **Duplicated Code** | Same logic shape in more than one hunk/file | Extract the shared shape, call from both |
| **Feature Envy** | Method reaches into another object's data more than its own | Move method onto the data it envies |
| **Data Clumps** | Same few fields/params keep travelling together | Bundle into one type |
| **Primitive Obsession** | Primitive/string standing in for a domain concept | Give the concept its own small type |
| **Repeated Switches** | Same `switch`/`if`-cascade on the same type recurs | Replace with polymorphism or a shared map |
| **Shotgun Surgery** | One logical change forces scattered edits across many files | Gather what changes together into one module |
| **Divergent Change** | One file edited for several unrelated reasons | Split so each module changes for one reason |
| **Speculative Generality** | Abstraction added for needs that don't exist yet | Delete it; inline back until a real need shows |
| **Message Chains** | Long `a.b().c().d()` navigation | Hide the walk behind one method on the first object |
| **Middle Man** | Class/function that mostly just delegates | Cut it, call the real target directly |
| **Refused Bequest** | Subclass ignores/overrides most of what it inherits | Drop inheritance, use composition |

Skip smells that tooling (linter, formatter, type checker) already enforces.

# P3 — SOLID

Apply pragmatically; each is a heuristic, not a mandate. Flag violations that cause real pain (hard to test, hard to extend, hard to change safely) — not textbook technicalities.

* **S — Single Responsibility**: a class/module should have one reason to change. If two unrelated stakeholders would ask for changes to the same file for different reasons, split it.
* **O — Open/Closed**: prefer extending behavior (new implementation, new strategy) over editing a stable, well-tested core — but only when a real extension point is needed now, not speculatively.
* **L — Liskov Substitution**: a subtype/implementation must be usable anywhere its base/interface is expected, without surprising callers (no narrowed inputs, no widened exceptions, no broken invariants).
* **I — Interface Segregation**: don't force callers to depend on methods they don't use. Prefer several small, focused interfaces over one broad one — when the project's language/patterns support this.
* **D — Dependency Inversion**: high-level logic shouldn't depend on low-level detail directly; both should depend on an abstraction — apply this only where the codebase already has that seam (P1), not by introducing a fresh layer for one call site.

SOLID violations are worth flagging when they block testing, cause fragile ripple-effect changes, or block a change the user is actually trying to make. Don't force all five onto small, stable, single-author files.

# DESIGN PATTERNS

Use patterns to name and clarify structure that already wants to exist — never to look sophisticated.

* Suggest a pattern only when it removes real duplication/branching complexity (e.g., a long `if/else`/`switch` on type → Strategy or polymorphism; construction with many optional variants → Builder/Factory; notifying multiple dependents → Observer).
* Prefer the smallest pattern that solves the problem — a single well-named function often beats a pattern.
* Never introduce a pattern speculatively ("might need this later"); that's premature abstraction.
* When a pattern already exists in the codebase, follow its shape rather than introducing a competing variant.

# CORE RULES

## Guard Clauses

Prefer early returns when they make control flow clearer. Use them to reduce unnecessary nesting. Do not mechanically flatten every conditional — avoid guard clauses that obscure the main happy path.

Target:

```text
if invalid
    return

if unauthorized
    return

perform main operation
```

rather than deeply nested control flow.

## Functions

Prefer functions with one clear responsibility, a coherent abstraction level, meaningful names, limited parameters, and manageable complexity.

### Heuristics

```text
~20–30 LOC
~2–3 parameters
nesting depth ≤ 2–3
```

These are **signals, not laws**. Refactor when size, parameter count, or nesting creates real comprehension or maintenance problems. Do not split code solely to satisfy a line count.

## Parameters

Multiple parameters are acceptable when they are conceptually independent, obvious at the call site, stable, and not repeatedly passed together.

Consider a parameter/options object when: parameters form a meaningful domain concept, several callers pass the same group, named fields materially improve clarity, or the object has useful invariants/behavior. Do not create one merely because a function has three parameters.

## Boolean Flags

Boolean parameters are a **design smell**, not an absolute prohibition.

Prefer separate functions when the boolean selects materially different behavior:

```text
sendEmail()
sendEmailWithAttachment()
```

A boolean is acceptable when it represents a small, genuinely orthogonal toggle (e.g., `verbose`, `dryRun`) that doesn't branch the function's core logic.

## Naming

Names should reveal intent without needing a comment. Prefer domain vocabulary already used in the project over generic terms (`data`, `info`, `helper`, `manager` as a catch-all).

## Duplication

Remove duplication only when it represents the *same concept* changing for the *same reason*. Coincidentally similar code serving different concerns should stay separate (DRY is about knowledge, not text similarity).

## Comments & Error Handling

Prefer self-explanatory code over comments; use comments only for *why* (non-obvious constraints, tradeoffs, workarounds), never for *what* the code already says. Fail fast on invalid state, and keep error handling at a consistent abstraction level — don't leak low-level exception detail into high-level business logic.

# WORKFLOW

**Single file**: read it fully, identify its stated/implied responsibility, check internal cohesion, then apply P0→P7 in order. Report findings before large changes.

**Set of related files**: map dependencies/shared concerns first (coupling), identify intended layering (P1), then review each file's cohesion and SOLID relative to its role — don't review files in isolation once a cross-file smell (circular dependency, leaky abstraction, duplicated responsibility) surfaces.

Always summarize: what changed, why, and what was deliberately left alone — especially where a "textbook" fix was skipped for P0/P1 reasons.