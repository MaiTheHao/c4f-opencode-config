---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

<announce>

"I'm using the writing-plans skill to create the implementation plan."

</announce>

<rules>

- Save plan to: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- If the spec covers multiple independent subsystems, suggest splitting into separate plans — one per subsystem.
- No placeholders. Every step must contain actual content:
  - Never: "TBD", "TODO", "implement later", "add appropriate error handling", "write tests for the above" (without test code), "similar to Task N".
  - Always: exact file paths, complete code blocks for every code step, exact commands with expected output.
- DRY. YAGNI. TDD. Frequent commits.

</rules>

<file-structure>

Before defining tasks, map out which files will be created or modified and their responsibilities.

- Each file has one clear responsibility.
- Files that change together should live together. Split by responsibility, not technical layer.
- In existing codebases: follow established patterns. Only split an existing file if it's unwieldy and you're already modifying it.

</file-structure>

<task-structure>

A task is the smallest unit with its own test cycle worth a reviewer's gate. Fold setup/scaffolding/docs into the task that needs them. Split only where a reviewer could reject one task while approving its neighbor.

Each task produces an independently testable deliverable.

Template:

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [exact signatures from earlier tasks]
- Produces: [exact function names, parameter and return types for later tasks]

- [ ] **Step 1: Write the failing test**
```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```
- [ ] **Step 2: Run test — expect FAIL**
`pytest tests/path/test.py::test_name -v`

- [ ] **Step 3: Write minimal implementation**
```python
def function(input):
    return expected
```
- [ ] **Step 4: Run test — expect PASS**
`pytest tests/path/test.py::test_name -v`

- [ ] **Step 5: Commit**
```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

</task-structure>

<plan-header>

Every plan MUST start with:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies/libraries]

## Global Constraints
[Project-wide requirements — version floors, dependency limits, naming rules, platform requirements. One line each, exact values from spec.]

---
```

</plan-header>

<self-review>

After writing the complete plan, check against the spec:

1. **Spec coverage:** Every spec requirement maps to a task?
2. **Placeholder scan:** Any patterns from `<rules>` above? Fix them.
3. **Type consistency:** Signatures, method names, and property names consistent across all tasks?

Fix inline. If a requirement has no task, add it.

</self-review>

<execution-handoff>

After saving the plan, offer:

> "Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:
> 1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
> 2. **Inline Execution** — execute in this session using executing-plans, batch with checkpoints.
> Which approach?"

- Subagent-Driven → use `superpowers:subagent-driven-development`.
- Inline Execution → use `superpowers:executing-plans`.

</execution-handoff>
