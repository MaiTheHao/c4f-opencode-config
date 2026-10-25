# Native Permission Contract (D2, D8)

**Load this when** resolving rule matching, action/resource names, wildcard behavior, or hard policies (`experimental.policies`). Project invariants and reusable fragments live in `references/project-permissions.md`.

## Rule model

`NATIVE` [D2]: a rule has string `action`, string `resource`, and `effect: allow|ask|deny`. Evaluation uses the last matching rule; no match means `ask`. However, agents begin with base rules, including broad allow and sensitive-read/external-directory checks. An omitted rule therefore does not imply denial. Agent rules follow global rules. Child permissions are independent of the parent's.

| Action | Matched resource |
|---|---|
| `read`, `edit` | Normalized path; `edit` covers write/patch |
| `glob`, `grep` | Glob pattern / search regex respectively |
| `shell` | Scanned command text |
| `subagent`, `skill` | Agent ID / skill ID |
| `webfetch`, `websearch` | URL / query |
| `question`, `execute` | `*` |
| `external_directory` | Canonical directory boundary |
| `<server>_<tool>` | `*` for the MCP tool |

`NATIVE` [D2]: `*` spans slashes; `?` matches one character; matching covers the whole value. Shell patterns ending ` *` also match the bare command. Multiple checked resources resolve deny before ask before allow. External file access also needs directory authorization. Home expansion applies to path rules, not shell text. Saved approvals never override configured deny.

## Generation differences

`UNVERIFIED` [S2] [S3]: two syntax generations are documented. Do not mix them in one surface.

| Surface | v1 | v2 |
|---|---|---|
| Shape | `permission` object or string | `permissions` array of `{ action, resource, effect }` |
| Edit action | `edit` covers edit, write, patch, multiedit | `edit` |
| Shell action | `bash` | `shell` |
| Delegation | `task` | `subagent` |
| Default when no rule matches | most surfaces `allow`; `doom_loop` and `external_directory` `ask` | `ask` |

`UNVERIFIED` [S2]: in v1 the tool keys are `edit`, `bash`, `read`, `glob`, `grep`, `webfetch`, `external_directory`, and `doom_loop`. Agent rules are merged after global rules and take precedence, so an agent's later broad allow overrides a global deny.

`UNVERIFIED` [S3]: in v2, `--auto` approves every action that is not explicitly denied. A saved "always" approval never overrides a configured deny.

## Permissions, approvals, and hard policies

`NATIVE` [D8]: `experimental.policies` is a separate configuration surface with `allow|deny`, not `ask`. A permission policy can hard-deny a tool check after ordinary permissions and saved approvals; policy allow does not itself grant tool access. Broader policy authority can restrict project configuration. The policy action named `permission` is valid here and is not the legacy agent key banned in `references/native-agents.md`.

`PROJECT`: an agent specification cannot override organization policy, client limitations, or the host's approval handling. Keep a human workflow checkpoint separate from native `ask` permissions. A chat approval does not rewrite denied permissions; an allowed tool does not prove the user approved an implementation scope.

## Limits and cross-OS notes

`UNVERIFIED` [S2]: `external_directory` is decided before `read` or `edit` on the same path. A path outside the working directory therefore needs its own decision; expanding `~` does not make a path part of the workspace.

`UNVERIFIED` [S2]: leading `~`, `~/`, `$HOME`, and `$HOME/` are expanded at configuration load in `external_directory`, `read`, and `edit` patterns. They are NOT expanded in shell command text, and `$HOME` inside a `command` array is not shell-expanded. `$HOME` is not set natively on Windows; prefer `~` in patterns.

`UNVERIFIED` [S2]: matching normalizes slashes and is case-insensitive on Windows. `*` spans slashes, `?` matches one character, everything else is literal. A pattern ending in ` *` also matches the command with no arguments.

`UNVERIFIED` [S2]: `edit` permission does not constrain shell writes. `sed -i`, `chmod`, and similar commands bypass it entirely. Hard protection requires file modes (`chmod 444`, `chattr +i`), not permissions.

## Cross-file precedence

`UNVERIFIED` [S2]: agent rules are appended after global rules and the last matching rule wins. A broad allow in an agent therefore reopens a global deny on the same resource, including a policy file that constrains the agent itself. Authoring must review the merged ruleset across files, never one file alone, and must repeat a policy-path deny inside any agent that grants a broad allow.
