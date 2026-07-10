# Tools

Manage the tools an LLM can use.

Tools allow the LLM to perform actions in your codebase. OpenCode comes with a set of built-in tools, but you can extend it with custom tools or MCP servers.

By default, all tools are enabled and don't need permission to run. You can control tool behavior through permissions.

---

## Configure

Use the `permission` field to control tool behavior. You can **allow**, **deny**, or **require approval** (`ask`) for each tool.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "deny",
    "bash": "ask",
    "webfetch": "allow"
  }
}
```

Wildcards let you control multiple tools at once. For example, to require approval for all tools from an MCP server:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "mymcp_*": "ask"
  }
}
```

> See the [configuration documentation](./config.md) for more on permissions.

---

## Built-in Tools

### bash

Execute shell commands in your project environment.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "allow"
  }
}
```

Allows the LLM to run terminal commands such as `npm install`, `git status`, or any other shell command.

---

### edit

Modify existing files using exact string replacements.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow"
  }
}
```

Performs precise edits to files by replacing exact text matches. This is the primary way the LLM modifies code.

---

### write

Create new files or overwrite existing ones.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow"
  }
}
```

> **Note:** The `write` tool is controlled by the `edit` permission, which covers all file modifications (`edit`, `write`, `apply_patch`).

---

### read

Read file contents from your codebase.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow"
  }
}
```

Reads files and returns their contents. Supports reading specific line ranges for large files.

---

### grep

Search file contents using regular expressions.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "grep": "allow"
  }
}
```

Fast content search across your codebase. Supports full regex syntax and file pattern filtering.

---

### glob

Find files by pattern matching.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "glob": "allow"
  }
}
```

Search for files using glob patterns like `**/*.js` or `src/**/*.ts`. Returns matching file paths sorted by modification time.

---

### lsp (experimental)

Interact with your configured LSP servers to get code intelligence features such as definitions, references, hover info, and call hierarchy.

> **Note:** This tool is only available when `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` (or `OPENCODE_EXPERIMENTAL=true`).

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "lsp": "allow"
  }
}
```

**Supported operations:**

| Operation | Description |
|---|---|
| `goToDefinition` | Navigate to a symbol's definition |
| `findReferences` | Find all references to a symbol |
| `hover` | Get hover information for a symbol |
| `documentSymbol` | List symbols in a document |
| `workspaceSymbol` | Search for symbols across the workspace |
| `goToImplementation` | Navigate to a symbol's implementation |
| `prepareCallHierarchy` | Prepare call hierarchy for a symbol |
| `incomingCalls` | Get incoming calls to a function |
| `outgoingCalls` | Get outgoing calls from a function |

See the LSP Servers documentation to configure which servers are available for your project.

---

### apply_patch

Apply patches to files.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow"
  }
}
```

> **Note:** The `apply_patch` tool is controlled by the `edit` permission, which covers all file modifications (`edit`, `write`, `apply_patch`).

Applies patch files to your codebase. Useful for applying diffs and patches from various sources.

When handling `tool.execute.before` or `tool.execute.after` hooks, check `input.tool === "apply_patch"` (not `"patch"`).

`apply_patch` uses `output.args.patchText` instead of `output.args.filePath`. Paths are embedded in marker lines within `patchText` and are relative to the project root:

| Marker | Purpose |
|---|---|
| `*** Add File: <path>` | Create a new file |
| `*** Update File: <path>` | Modify an existing file |
| `*** Move to: <path>` | Rename or move a file |
| `*** Delete File: <path>` | Remove a file |

---

### skill

Load a skill (a `SKILL.md` file) and return its content in the conversation.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "skill": "allow"
  }
}
```

---

### todowrite

Manage todo lists during coding sessions.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "todowrite": "allow"
  }
}
```

> **Note:** This tool is disabled for subagents by default, but you can enable it manually.

---

### webfetch

Fetch web content.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "webfetch": "allow"
  }
}
```

Allows the LLM to fetch and read web pages. Useful for looking up documentation or researching online resources.

---

### websearch

Search the web for information.

> **Note:** This tool is only available when using the OpenCode provider or when the `OPENCODE_ENABLE_EXA` environment variable is set to a truthy value (e.g., `true` or `1`). To enable when launching: `OPENCODE_ENABLE_EXA=1 opencode`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "websearch": "allow"
  }
}
```

> **Tip:** Use `websearch` when you need to **find** information (discovery), and `webfetch` when you need to **retrieve** content from a specific URL (retrieval).

---

### question

Ask the user questions during execution.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "question": "allow"
  }
}
```

Allows the LLM to ask the user questions during a task. Useful for:
- Gathering user preferences
- Clarifying ambiguous instructions
- Getting decisions on implementation choices
- Offering choices about what direction to take

---

## Custom Tools

Custom tools let you define your own functions that the LLM can call. These are defined in your config file and can execute arbitrary code.

---

## MCP Servers

MCP (Model Context Protocol) servers allow you to integrate external tools and services, including database access, API integrations, and third-party services.

---

## Internals

Internally, tools like `grep` and `glob` use **ripgrep** under the hood. By default, ripgrep respects `.gitignore` patterns — files and directories listed in your `.gitignore` will be excluded from searches and listings.

### Ignore Patterns

To include files that would normally be ignored, create a `.ignore` file in your project root. This file can explicitly allow certain paths.

```
!node_modules/
!dist/
!build/
```

For example, this `.ignore` file allows ripgrep to search within `node_modules/`, `dist/`, and `build/` directories even if they are listed in `.gitignore`.
