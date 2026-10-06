# AGENTS.md

Global guidance loaded in every project. Apply it whenever you create, edit, audit, or migrate an **OpenCode V2 agent** or agent configuration.

## Authority and sources

- Use the `opencode-agent-config` skill for any change under `agents/` or to agent frontmatter, permissions, workflow, or routing. It owns the contract; do not hand-roll conventions.
- Treat the current V2 documentation (<https://opencode.ai/v2/docs/>) as the source of truth. Do not answer V2 questions from memory when a doc page covers them.
- Label each requirement `NATIVE` (documented), `PROJECT` (this family's policy), or `UNVERIFIED` (environment-dependent). Never present a policy as native behavior.

## Frontmatter

- UTF-8, one `---` … `---` pair, YAML mapping, unique keys, non-empty body.
- Required: `description`, `mode`, `permissions`. Optional: `model`, `color`, `steps`, `hidden`, `disabled`, `request`.
- NEVER add `$schema`, global `skills`, provider definitions, concurrency settings, `temperature`, or `top_p` to an agent.
- Reject legacy keys `permission`, `tools`, `prompt`, `disable`, `maxSteps`. Author the `shell` and `subagent` actions, never `bash`/`task`.

## Permissions

- Ordered rules `{ action, resource, effect }`; the last matching rule wins.
- MUST open an agent's rules with `{ action: '*', resource: '*', effect: deny }`, then grant only what its workflow needs.
- Every custom leaf subagent MUST contain `{ action: subagent, resource: '*', effect: deny }`.
- Evaluate the complete merged ruleset: a later broad allow can reopen an earlier restriction.

## Body

- Three sections, in order: `## Context`, `## Workflow`, `## Rules`. `## Rules` is last and flat.
- One owner per requirement: `## Workflow` references a rule instead of restating it.
- Declare required skills once, as a bullet in `## Rules`; load each before its first dependent action.
- Delegating primaries MUST carry a model-routing precondition (`opencode-routing-dev` or `opencode-routing-research`) before the first child dispatch.
- Size budgets (physical lines): primary ≤ 150 (hard 160); specialist subagent ≤ 90 (hard 120).

## Verification

- After editing any `agents/*.md`, run the static validator and make it pass:

  ```sh
  python3 ~/.config/opencode/skills/opencode-agent-config/scripts/validate_agent.py <files...>
  ```

  Add `--json` for machine-readable output. Treat warnings as review items.
- Static parsing is not behavioral proof. Exercise the agent in the installed runtime before claiming it works.
- Report native, project-policy, and dependency checks separately; never mark a check complete by weakening a rule or adding a blanket allow.

## Configuration facts

- Project instructions live in `AGENTS.md`. V2 reads `AGENTS.md` only and does not fall back to `CLAUDE.md`; the config `instructions` array is accepted but not loaded.
- Global config is `~/.config/opencode/opencode.json(c)`. Terminal-only settings belong in `cli.json`, not `opencode.jsonc`.
- Never invent a capability. If a tool, model ID, skill ID, or child ID is not confirmed in the live catalog, mark it `UNVERIFIED`.

---

Repository-specific conventions (layout, commands) for the OpenCode configuration repo itself live in that repo's `README.md`.
