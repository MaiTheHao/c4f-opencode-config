# Rules

> **Source:** [OpenCode Rules Documentation](https://opencode.ai/docs/rules/)

Set custom instructions for OpenCode to tailor the LLM's behavior to your specific project.

Create an `AGENTS.md` file in your project root — similar to Cursor's rules — with instructions that will be injected into every agent session's context.

---

## Initialize

Run the `/init` command in OpenCode to scaffold a new `AGENTS.md` file:

```
/init
```

> **Tip:** Commit your project's `AGENTS.md` file to Git so your whole team benefits.

`/init` scans the important files in your repository, may ask a few targeted questions when the codebase cannot answer them, and then creates or updates `AGENTS.md` with concise, project-specific guidance.

It focuses on the information future agent sessions are most likely to need:

-   Build, lint, and test commands
-   Command order and focused verification steps when order matters
-   Architecture and repository structure that are not obvious from filenames alone
-   Project-specific conventions, setup quirks, and operational gotchas
-   References to existing instruction sources such as Cursor or Copilot rules

If an `AGENTS.md` already exists, `/init` improves it in place instead of blindly replacing it.

---

## Example

You can also create `AGENTS.md` manually. Here is a sample:

```markdown
# SST v3 Monorepo Project
This is an SST v3 monorepo with TypeScript. The project uses bun workspaces for package management.

## Project Structure
- `packages/` - Contains all workspace packages (functions, core, web, etc.)
- `infra/` - Infrastructure definitions split by service (storage.ts, api.ts, web.ts)
- `sst.config.ts` - Main SST configuration with dynamic imports

## Code Standards
- Use TypeScript with strict mode enabled
- Shared code goes in `packages/core/` with proper exports configuration
- Functions go in `packages/functions/`
- Infrastructure should be split into logical files in `infra/`

## Monorepo Conventions
- Import shared modules using workspace names: `@my-app/core/example`
```

---

## Types

OpenCode reads `AGENTS.md` from multiple locations.

### Project

Place an `AGENTS.md` in your project root for project-specific rules. These only apply when you are working in that directory or its sub-directories.

### Global

Global rules live at `~/.config/opencode/AGENTS.md` and apply across all OpenCode sessions. Because this file is not committed to Git or shared with your team, use it for personal preferences.

### Claude Code Compatibility

For users migrating from Claude Code, OpenCode supports Claude Code's file conventions as fallbacks:

| Source | File Path | Condition |
|---|---|---|
| Project rules | `CLAUDE.md` in the project directory | Used if no `AGENTS.md` exists |
| Global rules | `~/.claude/CLAUDE.md` | Used if no `~/.config/opencode/AGENTS.md` exists |
| Skills | `~/.claude/skills/` | See Agent Skills for details |

To disable Claude Code compatibility, set one of these environment variables:

```bash
export OPENCODE_DISABLE_CLAUDE_CODE=1        # Disable all .claude support
export OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1 # Disable only ~/.claude/CLAUDE.md
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1 # Disable only .claude/skills
```

---

## Precedence

When OpenCode starts, it looks for rule files in the following order:

1. **Local files** — traverses upward from the current directory (`AGENTS.md`, then `CLAUDE.md`)
2. **Global file** — `~/.config/opencode/AGENTS.md`
3. **Claude Code file** — `~/.claude/CLAUDE.md` (unless disabled)

The first matching file wins in each category.

---

## Custom Instructions

You can specify additional instruction files in your project's `opencode.json` or the global `~/.config/opencode/opencode.json`. This lets you and your team reuse existing rules without duplicating them into `AGENTS.md`.

**opencode.json**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["CONTRIBUTING.md", "docs/guidelines.md", ".cursor/rules/*.md"]
}
```

Remote URLs are also supported, allowing you to load instructions from the web:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["https://raw.githubusercontent.com/my-org/shared-rules/main/style.md"]
}
```

> **Note:** Remote instructions are fetched with a 5-second timeout. All instruction files are combined with your `AGENTS.md` files.

---

## Referencing External Files

While OpenCode does not automatically parse file references inside `AGENTS.md`, you can achieve similar functionality in two ways.

### Using opencode.json (Recommended)

Use the `instructions` field in `opencode.json` to declare external files with glob support:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["docs/development-standards.md", "test/testing-guidelines.md", "packages/*/AGENTS.md"]
}
```

### Manual Instructions in AGENTS.md

You can teach OpenCode to read external files by providing explicit instructions in your `AGENTS.md`. This approach uses file reference syntax (e.g., `@path/to/file.md`) that the agent learns to follow.

**AGENTS.md**

```markdown
# TypeScript Project Rules

## External File Loading
CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They are relevant to the SPECIFIC task at hand.

Instructions:
- Do NOT preemptively load all references — use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## Development Guidelines
For TypeScript code style and best practices: @docs/typescript-guidelines.md
For React component architecture and hooks patterns: @docs/react-patterns.md
For REST API design and error handling: @docs/api-standards.md
For testing strategies and coverage requirements: @test/testing-guidelines.md

## General Guidelines
Read the following file immediately as it is relevant to all workflows: @rules/general-guidelines.md.
```

This approach lets you:

-   Create modular, reusable rule files
-   Share rules across projects via symlinks or Git submodules
-   Keep `AGENTS.md` concise while referencing detailed guidelines
-   Ensure OpenCode loads files only when needed

> **Tip:** For monorepos or projects with shared standards, using `opencode.json` with glob patterns is more maintainable than manual file references.
