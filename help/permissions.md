# Permissions

Control which actions require approval to run.

OpenCode uses the `permission` config to decide whether a given action should run automatically, prompt you, or be blocked.

> **Note:** As of `v1.1.1`, the legacy `tools` boolean config is deprecated and has been merged into `permission`. The old `tools` config is still supported for backwards compatibility.

---

## Actions

Each permission rule resolves to one of the following:

| Value     | Behavior                    |
|-----------|-----------------------------|
| `"allow"` | Run without approval.       |
| `"ask"`   | Prompt for approval.        |
| `"deny"`  | Block the action.           |

---

## Auto Mode

Start OpenCode with `--auto` to automatically approve permission requests that are not explicitly denied.

```bash
opencode --auto
```

You can also use auto mode with `opencode run`:

```bash
opencode run --auto "Refactor this module"
```

- Explicit `"deny"` rules are **always enforced** — auto mode only changes requests that would otherwise ask for approval.
- In the TUI, open the command palette and select **Enable auto-approve permissions** or **Disable auto-approve permissions** to toggle modes.
- When auto mode is active, the prompt displays a muted `auto` indicator next to the current agent.

---

## Configuration

You can set permissions globally (with `"*"`) and override specific tools.

**opencode.json**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "ask",
    "bash": "allow",
    "edit": "deny"
  }
}
```

You can also set all permissions at once:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow"
}
```

---

## Granular Rules (Object Syntax)

For most permissions, you can use an object to apply different actions based on the tool input.

**opencode.json**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask",
      "git *": "allow",
      "npm *": "allow",
      "rm *": "deny",
      "grep *": "allow"
    },
    "edit": {
      "*": "deny",
      "packages/web/src/content/docs/*.mdx": "allow"
    }
  }
}
```

Rules are evaluated by pattern match, with the **last matching rule winning**. A common pattern is to put the catch-all `"*"` rule first, followed by more specific rules.

### Wildcards

Permission patterns use simple wildcard matching:

| Pattern | Meaning                              |
|---------|--------------------------------------|
| `*`     | Matches zero or more of any character |
| `?`     | Matches exactly one character         |

All other characters match literally.

### Home Directory Expansion

Use `~` or `$HOME` at the start of a pattern to reference your home directory. This is particularly useful for `external_directory` rules.

| Pattern                  | Resolves To                          |
|--------------------------|--------------------------------------|
| `~/projects/*`           | `/Users/username/projects/*`         |
| `$HOME/projects/*`       | `/Users/username/projects/*`         |
| `~`                      | `/Users/username`                    |

### External Directories

Use `external_directory` to allow tool calls that touch paths outside the working directory where OpenCode was started. This applies to any tool that takes a path as input (for example `read`, `edit`, `glob`, `grep`, and many `bash` commands).

**opencode.json**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/projects/personal/**": "allow"
    }
  }
}
```

Any directory allowed here inherits the same defaults as the current workspace. Add explicit rules when a tool should be restricted in these paths:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/projects/personal/**": "allow"
    },
    "edit": {
      "~/projects/personal/**": "deny"
    }
  }
}
```

---

## Available Permissions

OpenCode permissions are keyed by tool name, plus a couple of safety guards:

| Permission            | Description                                                                  |
|-----------------------|------------------------------------------------------------------------------|
| `read`                | Reading a file (matches the file path).                                      |
| `edit`                | All file modifications (covers `edit`, `write`, `patch`).                    |
| `glob`                | File globbing (matches the glob pattern).                                    |
| `grep`                | Content search (matches the regex pattern).                                   |
| `bash`                | Running shell commands (matches parsed commands like `git status --porcelain`). |
| `task`                | Launching subagents (matches the subagent type).                             |
| `skill`               | Loading a skill (matches the skill name).                                    |
| `lsp`                 | Running LSP queries (currently non-granular).                                |
| `question`            | Asking the user questions during execution.                                   |
| `webfetch`            | Fetching a URL (matches the URL).                                            |
| `websearch`           | Web search (matches the query).                                              |
| `external_directory`  | Triggered when a tool touches paths outside the project working directory.    |
| `doom_loop`           | Triggered when the same tool call repeats 3 times with identical input.       |

---

## Defaults

If you don't specify anything, OpenCode starts from permissive defaults:

- Most permissions default to `"allow"`.
- `doom_loop` and `external_directory` default to `"ask"`.
- `read` is `"allow"`, but `.env` files are denied by default:

```json
{
  "permission": {
    "read": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      "*.env.example": "allow"
    }
  }
}
```

---

## What "Ask" Does

When OpenCode prompts for approval, the UI offers three outcomes:

| Outcome   | Behavior                                                                 |
|-----------|--------------------------------------------------------------------------|
| `once`    | Approve just this request.                                               |
| `always`  | Approve future requests matching the suggested patterns (for the rest of the current session). |
| `reject`  | Deny the request.                                                        |

---

## Agents

You can override permissions per agent. Agent permissions are merged with the global config, and agent rules take precedence.

**opencode.json**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask",
      "git *": "allow",
      "git commit *": "deny",
      "git push *": "deny",
      "grep *": "allow"
    }
  },
  "agent": {
    "build": {
      "permission": {
        "bash": {
          "*": "ask",
          "git *": "allow",
          "git commit *": "ask",
          "git push *": "deny",
          "grep *": "allow"
        }
      }
    }
  }
}
```

You can also configure agent permissions in Markdown frontmatter:

**~/.config/opencode/agents/review.md**

```markdown
---
description: Code review without edits
mode: subagent
permission:
  edit: deny
  bash: ask
  webfetch: deny
---
Only analyze code and suggest changes.
```

> **Tip:** Use pattern matching for commands with arguments. `"grep *"` allows `grep pattern file.txt`, while `"grep"` alone would block it. Commands like `git status` work for default behavior but require explicit permission (like `"git status *"`) when arguments are passed.
