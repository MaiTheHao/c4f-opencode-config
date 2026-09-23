---
name: subagent-reuse
description: Reuse existing subagent sessions instead of spawning new ones when continuing work, giving feedback, fixing errors, or dispatching follow-up tasks.
---

# Subagent Reuse & Resume Protocol

- **Capture ID on spawn**: whenever a subagent is created, record whatever session/conversation identifier the harness returns.
- **Reuse for follow-ups**: send all further feedback, fixes, or related tasks to that same session via its recorded ID — never spawn a new subagent when a resumable one already exists.
- **Verify if unsure**: if a list/status check is available, confirm the session is still alive/idle before reusing; if it's dead, spawn fresh and record the new ID.