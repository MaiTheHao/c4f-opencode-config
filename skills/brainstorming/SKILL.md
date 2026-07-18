---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

<hard-gate>

Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. Applies to EVERY request regardless of perceived simplicity.

</hard-gate>

<checklist>

Execute in order:

1. **Explore project context** — check files, docs, recent commits.
2. **Ask clarifying questions** — one at a time. Focus on purpose, constraints, success criteria.
3. **Propose 2-3 approaches** — with tradeoffs and your recommendation.
4. **Present design** — in sections scaled to complexity, get approval after each section.
5. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit.
6. **Spec self-review** — scan for placeholders, contradictions, ambiguity, scope issues. Fix inline.
7. **User reviews spec** — wait for explicit approval before proceeding.
8. **Invoke `writing-plans` skill** — the ONLY next skill. Do NOT invoke any other.

</checklist>

<rules>

- One question per message. Never stack multiple questions.
- Prefer multiple choice over open-ended.
- YAGNI: remove unnecessary features ruthlessly.
- If the request spans multiple independent subsystems, decompose first. Each subsystem gets its own spec → plan → implementation cycle.
- In existing codebases: explore structure before proposing changes. Follow existing patterns. Don't propose unrelated refactors.
- Visual companion (browser): offer just-in-time — only when a question is genuinely visual (mockup/wireframe/diagram), not just a UI topic. Offer as its own standalone message. If accepted, read `skills/brainstorming/visual-companion.md`.

</rules>

<workflow>

**Understanding the idea:**
- Assess scope before asking detail questions. Flag decomposition needs immediately.
- Ask questions one at a time to refine the idea.

**Exploring approaches:**
- Propose 2-3 approaches with tradeoffs.
- Lead with your recommendation and justify it.

**Presenting the design:**
- Scale each section to its complexity.
- Ask after each section whether it looks right.
- Cover: architecture, components, data flow, error handling, testing.

**After design approval:**
- Write spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
- Run spec self-review:
  1. Placeholder scan: any TBD/TODO/vague requirements? Fix them.
  2. Internal consistency: sections contradict? Architecture matches features?
  3. Scope check: focused enough for one plan, or needs decomposition?
  4. Ambiguity: any requirement interpretable two ways? Pick one and make it explicit.
- Ask user to review: `"Spec written and committed to <path>. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."`
- Wait for approval. If changes requested, fix and re-run spec self-review. Only proceed once approved.
- Invoke `writing-plans` skill.

</workflow>
