---
name: oc-agent-config
description: 'Use when looking up, verifying, troubleshooting, or auditing OpenCode V2 configurations (`opencode.json`, `opencode.jsonc`, `.opencode/agents/*.md`, `~/.config/opencode/**`, MCP servers, permissions, tools, models, and skills) against official V2 documentation, schemas, and live runtime behavior.'
---

# OpenCode V2 Configuration Verification

This skill directs you to authoritative sources and verification steps so OpenCode V2 configurations work reliably at runtime. It enforces **no** custom file layouts, prompt templates, or repository style rules—always verify directly against official V2 documentation and the target runtime environment.

## Core Verification Principles

1. **Fetch official sources instead of guessing.** Never assume OpenCode V2 field names, permission action names (`shell`/`subagent` vs legacy `bash`/`task`), or defaults from memory or other frameworks. Look up the exact `/v2/docs/` URL in the source register below and fetch it.
2. **Classify every claim by evidence authority:**
   - `NATIVE`: Confirmed directly in official OpenCode V2 documentation (`D1`–`D8` at `https://opencode.ai/v2/docs/*`).
   - `UNVERIFIED`: Derived from unversioned `/docs/` pages (`S1`–`S4`), third-party references, or environment-specific behavior; must be verified against `D1`–`D8`, live tool schemas, or the installed OpenCode binary before relying on it.
3. **Never mix V1 and V2 config syntax.** OpenCode has two documented generations (`permission` object with `bash`/`task` in V1 vs `permissions` ordered array with `shell`/`subagent` in V2). Inspect existing config files before editing so you do not introduce mixed syntax or silently migrate a working setup.
4. **Verify the merged configuration.** OpenCode merges global config (`~/.config/opencode/opencode.json(c)`), project config (`./opencode.json(c)` or `./.opencode/opencode.json(c)`), and agent Markdown files in layers. Always inspect the effective merged result rather than a single file in isolation.

## Verification Workflow

1. **Identify the configuration surface** being questioned or modified (agent frontmatter, `mode`, `model` selector, `permissions` array, `experimental.policies`, `mcp` servers, built-in `tools`, or `skills` discovery).
2. **Map to the official source & check conflict traps** using the registers below.
3. **Retrieve and inspect authoritative sources:**
   - Fetch the relevant `https://opencode.ai/v2/docs/...` page(s) to confirm exact field shapes, types, and precedence rules.
   - When operating inside a workspace, also check the installed CLI/runtime version, active `~/.config/opencode/` and `./.opencode/` files, and live tool/provider schemas exposed in the session.
4. **Report with clear attribution:** Separate confirmed `NATIVE` facts (citing `D1`–`D8`) from `UNVERIFIED` or runtime-dependent items, and explicitly flag any conflict between official V2 docs, JSON schemas, and local config files.

## Official V2 Source Register (`D1`–`D8`)

Fetch the matching `/v2/docs/` endpoint directly to verify native V2 behavior:

| ID   | Topic                | Official URL                              | What to Verify                                                                                         |
| :--- | :------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| `D1` | **V2 Agents**        | `https://opencode.ai/v2/docs/agents`      | Agent file locations, frontmatter fields, `mode`, `model` inheritance, config merging, built-in agents |
| `D2` | **V2 Permissions**   | `https://opencode.ai/v2/docs/permissions` | `{ action, resource, effect }` rules, wildcard matching, evaluation precedence, approvals              |
| `D3` | **V2 Tools**         | `https://opencode.ai/v2/docs/tools`       | Built-in tool names (`read`, `edit`, `shell`, `subagent`, `execute`), parameters, session continuation |
| `D4` | **V2 Skills**        | `https://opencode.ai/v2/docs/skills`      | Skill search paths, `name.md` vs `name/SKILL.md`, case-sensitive IDs, skill frontmatter                |
| `D5` | **V2 Models**        | `https://opencode.ai/v2/docs/models`      | `provider/model#variant` selector format, case sensitivity, provider catalog resolution                |
| `D6` | **V2 Config**        | `https://opencode.ai/v2/docs/config`      | Global vs project config file locations, directory walk-up discovery, layer precedence                 |
| `D7` | **Published Schema** | `https://opencode.ai/config.json`         | JSON Schema reference (see conflict warning below before applying to V2 agents)                        |
| `D8` | **V2 Policies**      | `https://opencode.ai/v2/docs/policies`    | `experimental.policies` hard allow/deny rules outside standard agent permissions                       |

## Supplementary Source Register (`S1`–`S4`)

These pages cover areas not fully detailed on `/v2/docs/` (legacy V1 syntax, MCP server blocks, cross-OS path expansion). Treat claims from `S1`–`S4` as `UNVERIFIED` for V2 until confirmed in the target runtime:

| ID   | URL                                       | Covers                                                                                                                               |
| :--- | :---------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `S1` | `https://opencode.ai/docs/config`         | Unversioned config precedence, `instructions` array, root keys (`model`, `small_model`, `default_agent`, `agent`), `mcp` block shape |
| `S2` | `https://opencode.ai/docs/permissions`    | Legacy V1 `permission` object syntax, V1 tool keys (`bash`, `task`, `doom_loop`), `~`/`$HOME` path expansion                         |
| `S3` | `https://v2.opencode.ai/docs/permissions` | V2 `permissions` array syntax, `--auto` flag behavior, saved approval interaction with `deny`                                        |
| `S4` | `https://learnopencode.com`               | Third-party reference; use only as a navigation aid, never as sole authority                                                         |

## Known Conflicts to Watch For When Verifying

### 1. Published JSON Schema (`D7`) vs. V2 Agent Docs (`D1`, `D2`, `D6`)

- **Conflict:** `https://opencode.ai/config.json` (`D7`) exposes legacy `AgentConfig` keys (`permission`, `maxSteps`, `tools`) and a root `agent` mapping, contradicting the V2 Markdown agent contract (`permissions` array, `steps`, `shell`/`subagent` actions) in `D1`/`D2`/`D6`.
- **Verification action:** Do not convert V2 `permissions` arrays into V1 `permission` objects just to satisfy `D7`. Verify against the installed OpenCode binary or live parser.

### 2. V1 vs. V2 Permission Syntax Across Config Layers (`S1`, `S2`, `S3`)

- **Conflict:** Global config (`~/.config/opencode/opencode.jsonc`) may still use V1 `permission` object syntax (`bash`, `task`) while `.opencode/agents/*.md` uses V2 `permissions` array syntax (`shell`, `subagent`).
- **Verification action:** Inspect both layers in the user's environment before editing so you do not introduce mixed syntax into a single file or break an existing global config.

### 3. `subagent` Tool `model` Parameter (`D1`, `D3`)

- **Conflict:** `D1` and `D3` document `subagent` accepting target agent, description, prompt, background execution, and `sessionID` for continuation, whereas live runtimes may expose an optional `model` parameter.
- **Verification action:** Check the live `subagent` tool schema in the active session before passing a `model` override at dispatch time.
