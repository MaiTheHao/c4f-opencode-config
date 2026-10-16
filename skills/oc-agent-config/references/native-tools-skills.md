# Native Tools and Skills (D3, D4)

**Load this when** checking tool availability/invocation or native skill discovery and frontmatter. The project required-skill contract lives in `references/project-authoring.md`.

## Tool availability and invocation

`NATIVE` [D3]: `read` also lists directories; `list` is not a documented standalone V2 Core tool. `execute` exposes Code Mode; nested tools retain their permission checks. Code Mode cannot directly access the filesystem or network. `subagent` accepts a target agent, description, prompt, optional background execution, and a returned `sessionID` for continuation; default nesting depth is one. Browser catalog access is controlled by `browser` deny rules, with no individual browser-operation approval prompts. Session utilities do not request a built-in permission action. MCP catalogs depend on connected servers.

`PROJECT`: the samples' `list` rules MUST be removed during a future authorized migration unless a real extension documents that action. If a primary needs directory contents, explicitly decide whether to grant `read` or delegate the inspection; do not automatically broaden an orchestrator's access.

`PROJECT`: no blanket `execute` grant. Add it only when the installed tool exposure requires Code Mode or the workflow deliberately uses it. Reassess browser and session utilities when enabling that catalog. A default-deny rule is not a guarantee that every catalog utility issues a permission check.

`PROJECT`: preserve permission action `edit` for the three mutation tools, but invoke the actual available tool by its own schema. Never fabricate `spawn`, `resume`, `wait`, `list`, or `model` arguments from another agent framework.

## Skills: native behavior

`NATIVE` [D4]: discover skills in global/project OpenCode directories, compatibility directories, or root configuration `skills` entries. Root-level `name.md` and nested `name/SKILL.md` are supported. IDs derive from paths, are case-sensitive, and differ from display names. Later registrations can replace the same ID.

| Skill frontmatter | Native meaning |
|---|---|
| `name` | Display label |
| `description` | Discovery summary |
| `slash` | Interactive catalog visibility |
| `metadata.opencode/slash` | Overrides `slash` |
| `metadata.opencode/autoinvoke` | Controls model-list visibility |

`NATIVE` [D4]: frontmatter is optional; discovery needs a description. Loading uses `skill({id})`, checks permission, and adds the body. Supporting file contents require separate reads. `autoinvoke: false` does not prohibit explicit loading. Portable lowercase kebab-case IDs are recommended rather than enforced. Top-level `skills` config entries add sources; they are not an agent's required-skill list.
