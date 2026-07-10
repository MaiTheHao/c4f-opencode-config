# Custom Tools

> **Source:** [OpenCode Custom Tools Documentation](https://opencode.ai/docs/custom-tools/)

Create tools the LLM can call in opencode.

Custom tools are functions you create that the LLM can call during conversations. They work alongside opencode's built-in tools like `read`, `write`, and `bash`.

---

## Creating a Tool

Tools are defined as **TypeScript** or **JavaScript** files. However, the tool definition can invoke scripts written in **any language** — TypeScript or JavaScript is only used for the tool definition itself.

### Location

Tools can be placed in one of two locations:

| Scope | Path |
|-------|------|
| **Local** (per-project) | `.opencode/tools/` |
| **Global** (all projects) | `~/.config/opencode/tools/` |

### Structure

The recommended way to create tools is using the `tool()` helper, which provides type-safety and built-in validation.

**File:** `.opencode/tools/database.ts`

```ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Query the project database",
  args: {
    query: tool.schema.string().describe("SQL query to execute"),
  },
  async execute(args) {
    // Your database logic here
    return `Executed query: ${args.query}`
  },
})
```

The **filename** becomes the **tool name**. The example above creates a `database` tool.

#### Multiple Tools Per File

You can export multiple tools from a single file. Each export becomes a separate tool named `<filename>_<exportname>`.

**File:** `.opencode/tools/math.ts`

```ts
import { tool } from "@opencode-ai/plugin"

export const add = tool({
  description: "Add two numbers",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args) {
    return (args.a + args.b).toString()
  },
})

export const multiply = tool({
  description: "Multiply two numbers",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args) {
    return (args.a * args.b).toString()
  },
})
```

This creates two tools: `math_add` and `math_multiply`.

#### Name Collisions with Built-in Tools

Custom tools are keyed by tool name. If a custom tool uses the same name as a built-in tool, the custom tool takes precedence.

**File:** `.opencode/tools/bash.ts`

```ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Restricted bash wrapper",
  args: {
    command: tool.schema.string(),
  },
  async execute(args) {
    return `blocked: ${args.command}`
  },
})
```

> **Note:** Prefer unique names unless you intentionally want to replace a built-in tool. If you want to disable a built-in tool but not override it, use [permissions](./permissions.md).

### Arguments

You can use `tool.schema` (which is built on [Zod](https://zod.dev)) to define argument types:

```ts
args: {
  query: tool.schema.string().describe("SQL query to execute")
}
```

You can also import Zod directly and return a plain object:

```ts
import { z } from "zod"

export default {
  description: "Tool description",
  args: {
    param: z.string().describe("Parameter description"),
  },
  async execute(args, context) {
    return "result"
  },
}
```

### Context

Tools receive a `context` object with information about the current session.

**File:** `.opencode/tools/project.ts`

```ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Get project information",
  args: {},
  async execute(args, context) {
    const { agent, sessionID, messageID, directory, worktree } = context
    return `Agent: ${agent}, Session: ${sessionID}, Message: ${messageID}, Directory: ${directory}, Worktree: ${worktree}`
  },
})
```

| Context Field | Description |
|---------------|-------------|
| `agent` | The active agent type |
| `sessionID` | Current session identifier |
| `messageID` | Current message identifier |
| `directory` | Session working directory |
| `worktree` | Git worktree root directory |

Use `context.directory` for the session working directory. Use `context.worktree` for the git worktree root.

---

## Examples

### Write a Tool in Python

You can write your tool logic in any language. Here's an example that adds two numbers using Python.

First, create the Python script:

**File:** `.opencode/tools/add.py`

```py
import sys

a = int(sys.argv[1])
b = int(sys.argv[2])
print(a + b)
```

Then create the tool definition that invokes it:

**File:** `.opencode/tools/python-add.ts`

```ts
import { tool } from "@opencode-ai/plugin"
import path from "path"

export default tool({
  description: "Add two numbers using Python",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args, context) {
    const script = path.join(context.worktree, ".opencode/tools/add.py")
    const result = await Bun.$`python3 ${script} ${args.a} ${args.b}`.text()
    return result.trim()
  },
})
```
