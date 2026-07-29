# Great Builder: Explorer Subagent & Dynamic Feedback Loop Design Specification

- **Date**: 2026-07-29
- **Status**: Approved
- **Target Subsystem**: Great Builder Multi-Agent Suite (`/home/maithehao/.config/opencode/agents/great-builder/`)

---

## 1. Overview & Problem Statement

Currently, the Great Builder agent suite consists of four primary agents:
1. `orchestrator.md` (Primary Coordinator)
2. `analyzer.md` (Master Execution Contract Generator)
3. `implementation.md` (Code Modification Executor)
4. `review.md` (Verification & Quality Inspector)

### Problems Identified:
- `implementation.md` and `review.md` (and `analyzer.md`) frequently overload their context windows when performing repository searches, reading large files, or attempting scope discovery.
- `orchestrator.md` cannot read files directly (its file modification/reading permissions are restricted) and needs rich, structured, token-optimized context (line ranges, compact logic snippets, dependency hints) rather than plain file paths.
- There is no specialized subagent to perform fast, targeted search/inspection using Linux base CLI tools (`find`, `grep`, `awk`, `sed`, `head`, `tail`, `wc`, `stat`) in parallel.

### Solution:
Introduce `explorer.md`, a dedicated information extraction and codebase exploration subagent, controlled exclusively by `orchestrator.md`. Furthermore, establish a **Dynamic Re-Exploration Feedback Loop** allowing `analyzer`, `implementation`, and `review` to request additional information via `REQUEST_EXPLORER` statuses.

---

## 2. Architecture & Responsibilities

```
                          +------------------+
                          |   Orchestrator   |
                          +--------+---------+
                                   |
                 +-----------------+-----------------+
                 | (Parallel)                        | (Delegates Tasks)
                 v                                   v
       +------------------+                +------------------+
       |   explorer.md    | <===Re-call=== |   analyzer.md    |
       |  (CLI Exploration|  (STATUS:      |  (Contract Spec) |
       | & Snippet Extra.)|   REQUEST_     +------------------+
       +------------------+   EXPLORER)              |
                 ^                                   v
                 |                         +------------------+
                 +===========Re-call====== | implementation.md|
                 |                         |   (Code Edit)    |
                 |                         +------------------+
                 |                                   |
                 |                                   v
                 +===========Re-call====== +------------------+
                                           |    review.md     |
                                           |  (Verification)  |
                                           +------------------+
```

### Responsibility Matrix:
- **`explorer.md`**: Owns targeted codebase search, symbol location, and context snippet extraction via Linux CLI. Outputs token-optimized findings to `orchestrator.md`.
- **`orchestrator.md`**: Owns pipeline scheduling, task decomposition, parallel worker dispatch, patch merging, and re-exploration loop handling.
- **`analyzer.md`**: Owns scope discovery and Master Execution Contract generation using Explorer's structural output.
- **`implementation.md`**: Owns code edits strictly within designated `AffectedFiles`.
- **`review.md`**: Owns diff verification and contract compliance checks strictly on modified files.

---

## 3. Specification: `explorer.md`

**File Path**: `/home/maithehao/.config/opencode/agents/great-builder/explorer.md`

```markdown
---
description: Codebase Explorer & Information Extractor. High-speed targeted codebase search using Linux CLI commands. Synthesizes key logic, snippets, and structural insights for Orchestrator with token-optimized output.
mode: subagent
temperature: 0.1
permission:
  read: allow
  list: allow
  grep: allow
  glob: allow
  edit: deny
  write: deny
  task: deny
  skill:
    "*": deny
  bash:
    "*": deny
    "ls*": allow
    "pwd*": allow
    "find*": allow
    "locate*": allow
    "which*": allow
    "whereis*": allow
    "stat*": allow
    "cat*": allow
    "head*": allow
    "tail*": allow
    "grep*": allow
    "awk*": allow
    "sed*": allow
    "wc*": allow
    "git log*": allow
    "git status*": allow
  webfetch: deny
  websearch: deny
  todowrite: deny
---

<identity>

Explorer. High-speed codebase investigation and semantic context extractor.

</identity>

<context>

- **Input:** Target goal, scope hint, inspection mode, and required response schema from Orchestrator.
- **Scope:** Repository investigation using Linux CLI search tools.
- **Forbidden:** Modify code, write to files, propose architecture redesign, perform full file dumps.

</context>

<cli_rules>

- Leverage Linux CLI tools for maximum speed and efficiency:
  - `find` / `locate`: Fast file and directory hierarchy discovery.
  - `grep` / `rg`: Rapid pattern matching across codebase.
  - `awk` / `sed`: Extract precise line ranges and structured code blocks.
  - `head` / `tail`: Inspect file headers, imports, or signatures without loading full files.
  - `stat` / `wc`: Inspect file metadata, modifications, and line counts.
- Never output raw full files. Always filter and trim code snippets using `awk`/`sed`/`head` to minimize token consumption.

</cli_rules>

<output>

Return as inline response text. Do not write to any file.

```
EXPLORATION_SUMMARY:
  - <2-3 sentence high-level overview directly addressing TARGET_GOAL>

KEY_FINDINGS:
  - FILE: <filepath>:<line_start>-<line_end>
    ROLE: <purpose of this code block regarding the task>
    SNIPPET: |
      <compact, trimmed snippet extracted via CLI>

DEPENDENCIES_FOUND:
  - <discovered imported modules, interfaces, or related config paths>

RECOMMENDED_AFFECTED_SCOPE:
  - <file path> | <reason why this file should be in Execution Contract>
```

</output>
```

---

## 4. Updates to `orchestrator.md`

**File Path**: `/home/maithehao/.config/opencode/agents/great-builder/orchestrator.md`

### Key Changes:
1. **Permission**: Grant access to `great-builder/explorer`.
2. **Workflow**: Insert `EXPLORE` phase before `ANALYZE`.
3. **Loop Handling**: Add explicit `REQUEST_EXPLORER` recovery branches to re-invoke `great-builder/explorer` when subagents indicate missing context.

---

## 5. Updates to Existing Subagents (`analyzer`, `implementation`, `review`)

### 1. `analyzer.md`
- **Scope Constraint**: Must consume Explorer's findings rather than scanning repository-wide.
- **Status Addition**:
  - `STATUS: READY | BLOCKED | REQUEST_EXPLORER`
  - `EXPLORATION_REQUEST: <specific query/symbol if STATUS = REQUEST_EXPLORER>`

### 2. `implementation.md`
- **Scope Constraint**: Operates strictly on `AffectedFiles`.
- **Exit Status Addition**:
  - `EXIT_STATUS: SUCCESS | REQUEST_ANALYZER | REQUEST_EXPLORER`
  - `EXPLORATION_REQUEST: <missing signature/component details if EXIT_STATUS = REQUEST_EXPLORER>`

### 3. `review.md`
- **Scope Constraint**: Verifies modified diffs against Execution Contract.
- **Result Addition**:
  - `RESULT: PASS | FIX_REQUIRED | REQUEST_EXPLORER`
  - `EXPLORATION_REQUEST: <missing context for verification if RESULT = REQUEST_EXPLORER>`

---

## 6. Verification Plan

### Manual Verification
1. Inspect generated agent Markdown configuration files for correct YAML frontmatter syntax, valid permissions, and clear role prompts.
2. Verify token optimization rules across all subagent schemas.
3. Validate that `orchestrator.md` correctly coordinates `explorer`, `analyzer`, `implementation`, and `review`.
