---
name: subagent-reuse
description: Quick guidance to record subagent IDs and reuse existing sessions across iterations in OpenCode and Antigravity. Use whenever continuing work, giving feedback, fixing errors, or dispatching follow-up tasks to previously spawned subagents.
---

# Subagent Reuse & Resume Protocol

Quick reference reminding the harness to capture subagent identifiers upon creation and reuse existing sessions rather than spawning fresh ones.

---

## 1. Core Rule: Remember & Reuse IDs

- **Capture ID Immediately**: Whenever spawning any subagent, always record the returned session ID.
- **Reuse for Follow-ups**: All subsequent tasks, feedback, retries, or fixes on the same scope must be sent to the existing session using its recorded ID. Never spawn a new subagent when an existing session is already available.

---

## 2. Usage by Harness

### OpenCode Harness

- **Capture ID**: The `task` tool output contains the session identifier `task_id` (format: `ses_...`). Record this ID.
- **Resume Session**: Pass the recorded `task_id` into the `task` tool to continue within the existing subagent session.

### Antigravity (AGY) Harness

- **Inspect & Discover ID**: Use `manage_subagents` (`Action: "list"`) to check agent states (`idle`, `running`) and retrieve active `conversationId`s.
- **Resume Session**: When the subagent is `idle`, use `send_message` targeting its `conversationId` (`Recipient`) to continue within the existing session.

---

## 3. Quick Reference

| Harness | Session Identifier Key | How to Continue Previous Session |
| :--- | :--- | :--- |
| **OpenCode** | `task_id` (`ses_...`) | Call `task` with `task_id` |
| **Antigravity** | `conversationId` | Call `send_message` with `Recipient: conversationId` |
