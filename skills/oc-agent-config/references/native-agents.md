# Native Agent Contract (D1, D6, D5)

**Load this when** verifying V2 agent file locations, frontmatter field shapes, rejected keys, or model selectors. Native facts only; the stricter family policy lives in `references/project-authoring.md`.

## File and configuration boundary

`NATIVE` [D1, D6]: agent locations are `.opencode/agents/<id>.md` and `~/.config/opencode/agents/<id>.md`; nested agent paths preserve the namespace. YAML frontmatter configures the agent; the Markdown body supplies its `system` prompt. JSONC uses `agents.<id>`. Configuration layers merge; inspect the resulting configuration, not one file in isolation.

`PROJECT`: use UTF-8, one opening/closing `---` pair, a YAML mapping, unique keys, and a non-empty body. Quote wildcards and hex colors. Resolve the installed path before naming an agent: upload basenames are not deployment IDs. Never add `$schema`, provider definitions, global `skills`, or concurrency settings to agent frontmatter.

## Supported authoring fields

`NATIVE` baseline [D1]; the "Project contract" column is our stricter authoring policy.

| Field | Native shape | Project contract |
|---|---|---|
| `description` | string | Required, non-empty, describes selection purpose |
| `mode` | `primary`, `subagent`, `all` | Required; default primary behavior is never implicit |
| `model` | model selector | Optional; string form |
| `color` | six-digit hex string | Optional; `"#3399ff"` form |
| `steps` | positive integer | Optional; never use zero or an unbounded string |
| `hidden` | boolean | Optional; visibility only |
| `disabled` | boolean | Optional; intentional removal only |
| `permissions` | rule array | Required; explicit profile |
| `request` | `headers` / `body` overlays | Omit unless a verified use requires it |
| `system` | string in configuration | In Markdown, use body instead |

`NATIVE` [D1]: agent-level `request` overlays are documented as retained but not yet sent by the V2 session runner. `steps` ends with a tool-free summary step; new user input resets the allowance. It is not a team concurrency budget.

## Rejected fields and scoped bans

`PROJECT`: reject legacy agent keys `permission`, `tools`, `prompt`, `disable`, `maxSteps`, `temperature`, and `top_p`. Reject `bash` and `task` as native permission-action aliases; author `shell` and `subagent` instead. These are structural checks, not a ban on ordinary prose or shell script names containing those words.

Preserve the original project prohibition on configuring `temperature` or `top_p` anywhere inside governed agent definitions, including `request.body`. This is a project choice, not proof that reasoning universally replaces sampling controls. Do not silently extend this document's authority to unrelated provider configuration.

`PROJECT`: unlisted agent fields require a documented spec revision plus release-specific validation. A permissive parser accepting an unknown key does not establish that the runtime uses it. In particular, `skills`, `MaxConcurrentSubagents`, retry counters, DTO definitions, and required-skill lists belong in their proper configuration layer or prompt body, not invented frontmatter keys.

## Model selectors

`NATIVE` [D5]: use `provider/model#variant`, with an optional variant. Provider and model IDs are case-sensitive; a model ID can itself contain `/`. An expanded selector uses `providerID`, `model`, and optional `variant`. Availability depends on the active location's providers and credentials; use actual catalog IDs.

`PROJECT`: prefer the string selector in handwritten agents. The project routing precondition (load skill `oc-routing` and apply the agent's embedded `### Routing` lanes before dispatch) lives in `references/project-authoring.md`.

## Configuration boundary

`UNVERIFIED` [S1]: global configuration is `~/.config/opencode/opencode.json` or `.jsonc`. Project configuration is `./opencode.json(c)` or `./.opencode/opencode.json(c)`, discovered by walking up from the working directory to the worktree root. Layers merge, and a discovered `.opencode` configuration overrides every direct configuration, even a closer one. Inspect the merged result.

`UNVERIFIED` [S1]: `instructions: ["path", "glob/*.md"]` adds extra rule files to a configuration. JSONC root keys relevant to agents are `model`, `small_model`, `default_agent`, and `agent` (singular mapping keyed by agent ID). Do not author `agents` as a plural root key.

## Model resolution and pinning

`NATIVE` [D1]: a subagent uses its configured `model`, or inherits the parent session's model when none is configured. A session stores its selected model separately, so selecting a primary agent by ID does not change that model: a `model` on a primary agent is the default for a new session, not a binding on a running one.

`NATIVE` [D1] [D6]: agent definitions merge in configuration order and later scalar values replace earlier ones, and discovered project configuration takes precedence over global configuration. The effective model is therefore decided by the last layer that names it.

`PROJECT`: pinning `model` is a default, never an enforcement gate. Three layers can change the effective model:

1. the agent's own file, rewritten through `edit` or `shell`; configuration reloads without a restart
2. any discovered project configuration that names the same agent ID, including a repository cloned from an untrusted source
3. a dispatch-time model chosen by the orchestrating agent — intentional in this family, so the orchestrator can retarget a lane without editing files

`PROJECT`: do not treat a dispatch-time model, or an override in a trusted project configuration, as a policy violation. Model enforcement belongs outside configuration: credential scope (no key, no run) and not opening untrusted projects. A rule-file check such as `AGENTS.md --check` stays advisory.

## MCP block shape

`UNVERIFIED` [S1]: `mcp` is keyed by server name directly — `"mcp": { "<name>": { "type": "local", "command": [...], "environment": {} } }`. There is no `servers` wrapper. `mcp_timeout` sets a global timeout in milliseconds.

`UNVERIFIED` [S1]: `cwd`, `codemode`, and `enabled` inside an MCP entry, and `{env:VAR}` substitution inside configuration values, are not confirmed on the installed build. `$HOME` inside a `command` array is not shell-expanded. Confirm before relying on any of them.
