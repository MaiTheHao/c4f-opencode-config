---
name: clean-code
description: Apply Uncle Bob's Clean Code principles to refactor working code into readable, maintainable, and production-ready code.
risk: safe
source: ClawForge
---

# Clean Code

## 🎯 When to Use
Writing new code, reviewing PRs, refactoring legacy code, or raising team standards.

## 📌 Directives

### 1. Naming
- **Intention-revealing**: Use searchable, pronounceable names (`elapsedTimeInDays`, not `d`).
- **Classes**: Nouns (`Customer`). **Methods**: Verbs (`postPayment`). Avoid vague names (`Data`, `Manager`).

### 2. Functions
- **SRP & One Abstraction Level**: Do one thing well. Keep under ~20 lines.
- **Args**: Ideal 0, max 1–2 (3+ needs justification). No hidden side effects/global mutations.

### 3. Comments
- Code > Comments. Self-document with clean methods (e.g., `if employee.isEligible()`).
- Keep legal/TODOs; purge redundant/misleading/noisy comments.

### 4. Formatting
- **Newspaper structure**: High-level concepts top, details bottom. Declare variables near usage.

### 5. Objects & Boundaries
- Hide internals via interfaces. Follow **Law of Demeter** (avoid `a.getB().getC()`).
- Prefer exceptions over return codes. Never pass or return `null`.

### 6. Testing (TDD & F.I.R.S.T)
- Follow 3 Laws of TDD. Tests must be **F**ast, **I**ndependent, **R**epeatable, **S**elf-validating, **T**imely.

### 7. Code Smells to Kill
Eliminate Rigidity, Fragility, Immobility, Viscosity, Needless Complexity, and Duplication.

## ✅ Quick Checklist
- [ ] Function < 20 lines & does 1 task?
- [ ] ≤ 2 arguments & no `null` passed/returned?
- [ ] Names searchable & intention-revealing?
- [ ] Self-documenting code over comments?
- [ ] Covered by unit tests?