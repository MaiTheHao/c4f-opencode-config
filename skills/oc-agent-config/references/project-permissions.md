# Project Permission Invariants and Fragments

**Load this when** authoring or reviewing a permission profile, or copying a reusable fragment. Native matching semantics and action/resource names live in `references/native-permissions.md`.

## Invariants

- MUST start each governed agent's own permissions with `{ action: '*', resource: '*', effect: deny }`, then grant only capabilities needed by its workflow. The only exception is a designated open agent (see "Designated open agent"); it is named in its own description and never inferred.
- MUST evaluate the complete merged ruleset; a later broad allow can reopen an earlier restriction. Place every exception after the broad rule it narrows (for example, an `.env.example` allow after the `*.env.*` deny).
- MUST include `{ action: subagent, resource: '*', effect: deny }` in each custom leaf subagent. Audit the child's effective rules independently.
- MUST grant only catalog-confirmed child IDs and skill IDs. A name in a Markdown table does not register an agent or a skill.
- SHOULD default primary agents to `skill: '*' -> allow` (family default). A primary whose workflow names its skills MAY allowlist exactly those IDs instead. Loading a skill is not authorization for every action it describes.
- MUST deny shell by default for strict read-only profiles. If commands are required, review each permitted command's effects and configuration-dependent behavior.
- MUST keep any shell allowlist narrow: listing and read-only git commands only. Commands that print file content (`cat`, `head`, `tail`, `rg`) bypass `read` rules and stay off the list; use the `read`, `grep`, and `glob` tools instead.
- MUST review content-search, shell, MCP, browser, and child-agent paths separately when protecting sensitive files. A `read` deny alone is not an information-isolation boundary: `grep` matches by pattern rather than path, and `git diff` / `git show` print tracked file content.
- MUST test root and nested `.env` / `.env.*` cases. `*.env` alone does not cover `.env.production`. The default policy keeps `.env.example` readable, so re-allow it after the `*.env.*` rule. Profiles that can edit also need matching `edit` rules.
- MUST use explicit directory scope for writable plan artifacts. Never treat permission matching as shell-style `globstar` semantics.
- MUST use `deny`, not `ask`, for anything that must never run. `ask` is a prompt; saved "Allow always" approvals become allow rules and never override a `deny`.
- SHOULD NOT restate an effect already given by a broader fallback (for example `git commit * ask` under `shell * ask`).
- NEVER resolve a blocked dependency by adding an unrestricted shell, filesystem, or MCP allow. Designating an open agent is a profile decision, not a way to unblock a dependency.

## Reusable fragments

These are project-authored examples, not replacement files. Adapt them only after checking the workflow and live catalog. Each fragment is independently rooted at default deny, except the designated open agent; do not concatenate fragments blindly.

### Solo web research

```yaml
permissions:
- { action: '*', resource: '*', effect: deny }
- { action: question, resource: '*', effect: allow }
- { action: websearch, resource: '*', effect: allow }
- { action: webfetch, resource: '*', effect: allow }
- { action: skill, resource: '*', effect: allow }
```

### Orchestration-only primary

```yaml
permissions:
- { action: '*', resource: '*', effect: deny }
- { action: question, resource: '*', effect: allow }
- { action: skill, resource: '*', effect: allow }
- { action: subagent, resource: 'team/analyzer', effect: allow }
- { action: subagent, resource: 'team/implementer', effect: allow }
```

`team/analyzer` and `team/implementer` are illustrative IDs, not claims that these agents exist. Skills needing local references require a separately reviewed read grant or a compatible workflow.

### Planner artifact exception

```yaml
permissions:
- { action: '*', resource: '*', effect: deny }
- { action: question, resource: '*', effect: allow }
- { action: read, resource: '*', effect: allow }
- { action: read, resource: '*.env', effect: deny }
- { action: read, resource: '*.env.*', effect: deny }
- { action: read, resource: '*.env.example', effect: allow }
- { action: glob, resource: '*', effect: allow }
- { action: grep, resource: '*', effect: allow }
- { action: edit, resource: 'local/*', effect: allow }
- { action: skill, resource: '*', effect: allow }
```

This fragment grants search, not secret isolation. It deliberately grants no shell or children; add exact dependencies only after their review. It assumes `local/*` is the chosen plan-artifact root and does not exempt environment files inside that root from a separate write-policy decision.

### Scoped-edit primary with git allowlist

```yaml
permissions:
- { action: '*', resource: '*', effect: deny }
- { action: question, resource: '*', effect: allow }
- { action: read, resource: '*', effect: allow }
- { action: read, resource: '*.env', effect: deny }
- { action: read, resource: '*.env.*', effect: deny }
- { action: read, resource: '*.env.example', effect: allow }
- { action: glob, resource: '*', effect: allow }
- { action: grep, resource: '*', effect: allow }
- { action: edit, resource: '*', effect: allow }
- { action: edit, resource: '*.env', effect: deny }
- { action: edit, resource: '*.env.*', effect: deny }
- { action: edit, resource: '*.env.example', effect: allow }
- { action: shell, resource: '*', effect: ask }
- { action: shell, resource: 'ls *', effect: allow }
- { action: shell, resource: 'git status *', effect: allow }
- { action: shell, resource: 'git diff *', effect: allow }
- { action: shell, resource: 'git log *', effect: allow }
- { action: skill, resource: '<skill-id>', effect: allow }
- { action: subagent, resource: 'team/analyzer', effect: allow }
- { action: subagent, resource: 'team/implementer', effect: allow }
```

`<skill-id>` and the `team/*` IDs are placeholders to replace with catalog-confirmed IDs. Add `git add *` only for an agent that owns commits; commits and pushes fall to `ask` through the shell fallback. `git diff` and `git log` can still print tracked secrets, so this is not secret isolation.

### Designated open agent

```yaml
permissions:
- { action: '*', resource: '*', effect: allow }
- { action: read, resource: '*.env', effect: ask }
- { action: read, resource: '*.env.*', effect: ask }
- { action: read, resource: '*.env.example', effect: allow }
```

This is the only fragment not rooted at default deny. It restates OpenCode's base policy last so global rules cannot narrow the agent, which suits a chat and coordination agent. Every limit beyond environment-file reads is behavioral and lives in the agent text, so shell, edit, MCP, web, and child launches all run unprompted. Add `deny` rules for anything that must never run.

`PROJECT`: this profile is a declared exception to the default-deny opener. It is recorded in `scripts/accepted_exceptions.json` and must be re-reviewed whenever the agent changes; an opened-tier profile that is not declared there is a failure, not a variant.

## Merged-ruleset review

`PROJECT`: a permission profile is correct only if it holds across every configuration layer, not inside one file. Agent rules are appended after global rules and the last matching rule wins, so a broad allow in an agent silently reopens a global deny.

`UNVERIFIED` [S2]: this repository denies `edit` on its own policy file and allowlist from the global configuration (`~/.config/opencode/opencode.jsonc`). Any agent that grants `{ action: edit, resource: '*', effect: allow }` reopens both.

Mandatory checks after authoring any profile that contains a broad allow:

1. List every rule granting `edit`, `shell`, or a wildcard action with effect `allow`.
2. For each, confirm a LATER rule in the same file denies the policy paths below, or confirm the broad allow does not reach them.
3. Confirm the deny is repeated inside the agent, not inherited from the global configuration.

Reusable fragment — place it AFTER every broad allow:

```yaml
  - { action: edit, resource: '~/.config/opencode/AGENTS.md', effect: deny }
  - { action: edit, resource: '~/.config/opencode/scripts/*', effect: deny }
```

`PROJECT`: a deny expressed only as a relative path is not equivalent to the expanded absolute path used by the global configuration. Keep the strings identical to the global rule so the two layers agree; treat a relative-only deny as unverified.

`PROJECT`: `edit` permission does not restrict shell writes. A profile that grants `shell: '*' -> allow` reaches the same files through `sed -i` or `chmod`, so review file modes as the hard boundary.