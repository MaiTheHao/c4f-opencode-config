# [Track Name] Implementation Plan: [Feature Name]

> **Assigned Agent**: [Agent Name, e.g., OpenCode Agent / Subagent]  
> **Track / Domain**: [Backend / Frontend / Database / Documentation / etc.]  
> **Master Plan**: `local/agents/brainstorming/plans/YYYY-MM-DD-<feature-name>.md`  
> **Execution Standard**: Execute with `executing-plans` (strict TDD, task-by-task execution, verification).

---

## 1. Goal & Architecture Constraints

**Goal**: [One-sentence overview of track deliverables]

### Non-Negotiable Constraints
- **Constraint 1**: [e.g., No raw SQL / type-safe queries / zero N+1]
- **Constraint 2**: [e.g., Strict interface typing / backward compatibility]
- **Constraint 3**: [e.g., Strict error handling without masking]

---

## 2. Shared Contracts & Interfaces

[Define or link DTOs, API endpoints, JSON payloads, or event schemas required for this track]

```typescript
// Contract definition / interface snippet
```

---

## 3. Proposed File Changes

### [Component / Module Name]
#### `[NEW/MODIFY/DELETE]` `path/to/file1.ext`
- **Purpose**: ...
- **Code template / signature**:
```[language]
// Required code pattern
```

---

## 4. Detailed Tasks (executing-plans compatible)

### Task 1: [Component / Step Name]
- **Files**: `path/to/file1.ext`
- **Verification**: `[verification command, e.g., mvn test -Dtest=... / npm test]`

- [ ] **Step 1: Write failing test / verify initial failure**
- [ ] **Step 2: Implement minimal logic according to spec**
- [ ] **Step 3: Run verification command & ensure exit code 0 (PASS)**

### Task 2: [Next Step Name]
- **Files**: `path/to/file2.ext`
- **Verification**: `[verification command]`

- [ ] **Step 1: Implement logic / integrate component**
- [ ] **Step 2: Run verification command & ensure exit code 0 (PASS)**

---

## 5. Verification Commands

The executing agent **MUST run** these commands before concluding:
```bash
# Compile / Build
[build command, e.g., mvn clean test-compile / npm run build]

# Lint / Syntax check
[lint command, e.g., node --check file.js / eslint / ruff check]

# Test suite
[test command]
```
> [!IMPORTANT]
> All verification commands must exit with code `0` (BUILD SUCCESS / PASS).

---

## 6. MANDATORY PROTOCOL: Generate Walkthrough Artifact

Upon completing all tasks in this plan via `executing-plans`, the executing agent **MUST** generate:
- **File path**: `local/agents/brainstorming/plans/<track>_walkthrough.md`
- **Required contents**:
  1. **Summary**: Overview of completed items.
  2. **Modified / New Files Table**: List of all altered files.
  3. **Verification Evidence**: Actual terminal outputs proving all tests/builds passed (exit code 0).
  4. **Deviations**: Any necessary deviations or state "None".
