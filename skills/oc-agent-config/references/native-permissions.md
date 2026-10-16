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

## Permissions, approvals, and hard policies

`NATIVE` [D8]: `experimental.policies` is a separate configuration surface with `allow|deny`, not `ask`. A permission policy can hard-deny a tool check after ordinary permissions and saved approvals; policy allow does not itself grant tool access. Broader policy authority can restrict project configuration. The policy action named `permission` is valid here and is not the legacy agent key banned in `references/native-agents.md`.

`PROJECT`: an agent specification cannot override organization policy, client limitations, or the host's approval handling. Keep a human workflow checkpoint separate from native `ask` permissions. A chat approval does not rewrite denied permissions; an allowed tool does not prove the user approved an implementation scope.
