---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

<announce>

"I'm using the executing-plans skill to implement this plan."

</announce>

<workflow>

1. **Load & Review Plan**
   - Read the plan file.
   - Identify any questions or concerns.
   - If concerns exist: raise with partner before starting.
   - If none: create todos for all plan items and proceed.

2. **Execute Tasks** — for each task:
   - Mark as `in_progress`.
   - Follow each step exactly as written.
   - Run verifications as specified.
   - Mark as `completed`.

3. **Complete Development** — after all tasks verified:
   - Announce: "I'm using the finishing-a-development-branch skill to complete this work."
   - Use `superpowers:finishing-a-development-branch`.

</workflow>

<stop-conditions>

STOP immediately and ask for help when:
- Blocker: missing dependency, test fails, instruction unclear.
- Plan has critical gaps preventing start.
- Verification fails repeatedly.

Do not guess. Do not force through blockers.

</stop-conditions>

<rules>

- Review plan critically before executing.
- Follow plan steps exactly. Do not skip verifications.
- Never start implementation on `main`/`master` without explicit user consent.
- Return to Step 1 (Review) if partner updates the plan or fundamental approach needs rethinking.

</rules>

<integration>

- `superpowers:writing-plans` — creates the plan this skill executes.
- `superpowers:using-git-worktrees` — ensures isolated workspace.
- `superpowers:finishing-a-development-branch` — completes development after all tasks.

</integration>
