# Agents

> **Source:** [OpenCode Agents Documentation](https://opencode.ai/docs/agents/)

Configure and use specialized AI assistants for specific tasks and workflows. Agents support custom prompts, models, and tool access.

> **Tip**  
> Use the plan agent to analyze code and review suggestions without making any code changes.

You can switch between agents during a session or invoke them with the `@` mention.

---

## Types

There are two types of agents: **primary agents** and **subagents**.

### Primary agents

Primary agents are the main assistants you interact with directly. Cycle through them using the **Tab** key or your configured `switch_agent` keybind. These agents handle your main conversation. Tool access is configured via permissions — for example, Build has all tools enabled while Plan is restricted.

> **Tip**  
> You can use the **Tab** key to switch between primary agents during a session.

OpenCode ships with two built-in primary agents: **Build** and **Plan**.

### Subagents

Subagents are specialized assistants that primary agents can invoke for specific tasks. You can also manually invoke them by **@ mentioning** them in your messages.

OpenCode ships with three built-in subagents: **General**, **Explore**, and **Scout**.

---

## Built-in agents

### Build

- **Mode:** `primary`

The **default** primary agent with all tools enabled. Use this for standard development work where you need full access to file operations and system commands.

### Plan

- **Mode:** `primary`

A restricted agent designed for planning and analysis. Uses a permission system to prevent unintended changes. By default, the following are set to `ask`:

- `file edits` — All writes, patches, and edits
- `bash` — All bash commands

Useful when you want the LLM to analyze code, suggest changes, or create plans without modifying your codebase.

### General

- **Mode:** `subagent`

A general-purpose agent for researching complex questions and executing multi-step tasks. Has full tool access (except `todo`) and can make file changes when needed. Use this to run multiple units of work in parallel.

### Explore

- **Mode:** `subagent`

A fast, read-only agent for exploring codebases. Cannot modify files. Use this to quickly find files by patterns, search code for keywords, or answer questions about the codebase.

### Scout

- **Mode:** `subagent`

A read-only agent for external docs and dependency research. Use this to clone a dependency repository into OpenCode's managed cache, inspect library source, or cross-reference local code against upstream implementations without modifying your workspace.

### Compaction

- **Mode:** `primary`

Hidden system agent that compacts long context into a smaller summary. Runs automatically when needed and is not selectable in the UI.

### Title

- **Mode:** `primary`

Hidden system agent that generates short session titles. Runs automatically and is not selectable in the UI.

### Summary

- **Mode:** `primary`

Hidden system agent that creates session summaries. Runs automatically and is not selectable in the UI.

---

## Usage

1. **Primary agents:** Use the **Tab** key to cycle through them during a session, or use your configured `switch_agent` keybind.

2. **Subagents** can be invoked:
   - **Automatically** by primary agents for specialized tasks based on their descriptions.
   - **Manually** by **@ mentioning** a subagent in your message:
     ```
     @general help me search for this function
     ```

3. **Navigation between sessions:** When subagents create child sessions, use `session_child_first` (default: **<Leader>+Down**) to enter the first child session from the parent.

4. Once in a child session:
   - `session_child_cycle` (default: **Right**) — cycle to the next child session
   - `session_child_cycle_reverse` (default: **Left**) — cycle to the previous child session
   - `session_parent` (default: **Up**) — return to the parent session

---

## Configuration

You can customize built-in agents or create your own. Agents can be configured in two ways.

### JSON configuration

Configure agents in your `opencode.json` config file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./prompts/build.txt}",
      "permission": {
        "edit": "allow",
        "bash": "allow"
      }
    },
    "plan": {
      "mode": "primary",
      "model": "anthropic/claude-haiku-4-20250514",
      "permission": {
        "edit": "deny",
        "bash": "deny"
      }
    },
    "code-reviewer": {
      "description": "Reviews code for best practices and potential issues",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "You are a code reviewer. Focus on security, performance, and maintainability.",
      "permission": {
        "edit": "deny"
      }
    }
  }
}
```

### Markdown configuration

Define agents using markdown files placed in:

- **Global:** `~/.config/opencode/agents/`
- **Per-project:** `.opencode/agents/`

```markdown
---
description: Reviews code for quality and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
permission:
  edit: deny
  bash: deny
---

You are in code review mode. Focus on:
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Security considerations
Provide constructive feedback without making direct changes.
```

The markdown file name becomes the agent name. For example, `review.md` creates a `review` agent.

---

## Options

### Description

Provide a brief description of what the agent does and when to use it.

```json
{
  "agent": {
    "review": {
      "description": "Reviews code for best practices and potential issues"
    }
  }
}
```

This is a **required** config option.

### Temperature

Control the randomness and creativity of the LLM's responses with `temperature`.

```json
{
  "agent": {
    "plan": {
      "temperature": 0.1
    },
    "creative": {
      "temperature": 0.8
    }
  }
}
```

Temperature values typically range from 0.0 to 1.0:

| Range | Behavior |
|---|---|
| **0.0–0.2** | Very focused and deterministic responses, ideal for code analysis and planning |
| **0.3–0.5** | Balanced responses with some creativity, good for general development tasks |
| **0.6–1.0** | More creative and varied responses, useful for brainstorming and exploration |

If no temperature is specified, OpenCode uses model-specific defaults — typically 0 for most models, 0.55 for Qwen models.

### Max steps

Control the maximum number of agentic iterations an agent can perform before being forced to respond with text only.

```json
{
  "agent": {
    "quick-thinker": {
      "description": "Fast reasoning with limited iterations",
      "prompt": "You are a quick thinker. Solve problems with minimal steps.",
      "steps": 5
    }
  }
}
```

> **Caution**  
> The legacy `maxSteps` field is **deprecated**. Use `steps` instead.

### Disable

Set to `true` to disable an agent.

```json
{
  "agent": {
    "review": {
      "disable": true
    }
  }
}
```

### Prompt

Specify a custom system prompt file for an agent.

```json
{
  "agent": {
    "review": {
      "prompt": "{file:./prompts/code-review.txt}"
    }
  }
}
```

### Model

Override the model for a specific agent.

> **Tip**  
> If you don't specify a model, primary agents use the globally configured model while subagents use the model of the primary agent that invoked them.

```json
{
  "agent": {
    "plan": {
      "model": "anthropic/claude-haiku-4-20250514"
    }
  }
}
```

The model ID uses the format `provider/model-id`.

### Tools (deprecated)

The `tools` field is **deprecated**. Prefer the agent's `permission` field for new configurations.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "tools": {
    "write": true,
    "bash": true
  },
  "agent": {
    "plan": {
      "tools": {
        "write": false,
        "bash": false
      }
    }
  }
}
```

### Permissions

Configure permissions to manage what actions an agent can take. Each permission key accepts one of:

- `"ask"` — Prompt for approval before running the tool
- `"allow"` — Allow all operations without approval
- `"deny"` — Disable the tool

| Key | Tools it gates |
|---|---|
| `read` | `read` |
| `edit` | `write`, `edit`, `apply_patch` |
| `glob` | `glob` |
| `grep` | `grep` |
| `list` | `list` |
| `bash` | `bash` |
| `task` | `task` |
| `external_directory` | Any tool that reads or writes files outside the project worktree |
| `todowrite` | `todowrite`, `todoread` |
| `webfetch` | `webfetch` |
| `websearch` | `websearch` |
| `lsp` | `lsp` |
| `skill` | `skill` |
| `question` | `question` |
| `doom_loop` | Recovery prompts when an agent appears stuck |

Override permissions per agent in JSON:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "deny"
  },
  "agent": {
    "build": {
      "permission": {
        "edit": "ask"
      }
    }
  }
}
```

Set permissions in Markdown agents:

```markdown
---
description: Code review without edits
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git diff": allow
    "git log*": allow
    "grep *": allow
  webfetch: deny
---
Only analyze code and suggest changes.
```

Set permissions for specific bash commands:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": {
      "permission": {
        "bash": {
          "git push": "ask",
          "grep *": "allow"
        }
      }
    }
  }
}
```

### Mode

Control the agent's mode with the `mode` config. Options: `primary`, `subagent`, or `all`. Defaults to `all`.

### Hidden

Hide a subagent from the `@` autocomplete menu with `hidden: true`.

```json
{
  "agent": {
    "internal-helper": {
      "mode": "subagent",
      "hidden": true
    }
  }
}
```

> **Note:** Only applies to `mode: subagent`.

### Task permissions

Control which subagents an agent can invoke via the Task tool with `permission.task`.

```json
{
  "agent": {
    "orchestrator": {
      "mode": "primary",
      "permission": {
        "task": {
          "*": "deny",
          "orchestrator-*": "allow",
          "code-reviewer": "ask"
        }
      }
    }
  }
}
```

> **Tip:** Rules are evaluated in order — the **last matching rule wins**.

### Color

Customize the agent's visual appearance with the `color` option. Use a valid hex color (e.g., `#FF5733`) or a theme color: `primary`, `secondary`, `accent`, `success`, `warning`, `error`, `info`.

```json
{
  "agent": {
    "creative": {
      "color": "#ff6b6b"
    },
    "code-reviewer": {
      "color": "accent"
    }
  }
}
```

### Top P

Control response diversity with `top_p`. Values range from 0.0 to 1.0.

```json
{
  "agent": {
    "brainstorm": {
      "top_p": 0.9
    }
  }
}
```

### Additional options

Any other options specified in an agent configuration are passed through directly to the provider as model options.

```json
{
  "agent": {
    "deep-thinker": {
      "description": "Agent that uses high reasoning effort for complex problems",
      "model": "openai/gpt-5",
      "reasoningEffort": "high",
      "textVerbosity": "low"
    }
  }
}
```

---

## Create agents

Create new agents using the following command:

```
opencode agent create
```

This interactive command will ask where to save the agent, what it should do, generate an appropriate system prompt, let you select permissions, and create a markdown file.

---

## Use cases

| Agent | Purpose |
|---|---|
| **Build** | Full development work with all tools enabled |
| **Plan** | Analysis and planning without making changes |
| **Review** | Code review with read-only access plus documentation tools |
| **Debug** | Focused investigation with bash and read tools enabled |
| **Docs** | Documentation writing with file operations but no system commands |

---

## Examples

### Documentation agent

```markdown
---
description: Writes and maintains project documentation
mode: subagent
permission:
  bash: deny
---

You are a technical writer. Create clear, comprehensive documentation.
Focus on:
- Clear explanations
- Proper structure
- Code examples
- User-friendly language
```

### Security auditor

```markdown
---
description: Performs security audits and identifies vulnerabilities
mode: subagent
permission:
  edit: deny
---

You are a security expert. Focus on identifying potential security issues.
Look for:
- Input validation vulnerabilities
- Authentication and authorization flaws
- Data exposure risks
- Dependency vulnerabilities
- Configuration security issues
```
