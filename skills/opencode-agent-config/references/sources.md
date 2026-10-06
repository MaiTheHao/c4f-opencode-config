# Authority, Evidence, and Sources

**Load this when** refreshing native evidence, recording a source conflict, or citing where a `NATIVE` contract comes from. Referenced from the "Authority model" section of `SKILL.md`.

## Authority layers

Every requirement belongs to exactly one layer:

| Label | Meaning | How to verify |
|---|---|---|
| `NATIVE` | Behavior described by current official V2 documentation | Check the corresponding source and the installed V2 build |
| `PROJECT` | Policy adopted by this agent family | Review this specification and its acceptance checks |
| `UNVERIFIED` | Environment-dependent capability or missing dependency | Inspect the actual catalog/schema/configuration and run a focused smoke check |

A project policy can narrow behavior; it cannot create a tool, grant authority, invent an input field, or make an unsupported setting effective. When evidence conflicts, record the conflict and leave the affected capability unverified. NEVER silently migrate the configuration to another major version.

## Official source register

| ID | Official source | Use |
|---|---|---|
| D1 | [V2 Agents](https://opencode.ai/v2/docs/agents) | Agent files, fields, discovery, merging, built-ins |
| D2 | [V2 Permissions](https://opencode.ai/v2/docs/permissions) | Rule matching, resources, defaults, approvals |
| D3 | [V2 Tools](https://opencode.ai/v2/docs/tools) | Available operations and invocation contracts |
| D4 | [V2 Skills](https://opencode.ai/v2/docs/skills) | Skill discovery, IDs, frontmatter, loading |
| D5 | [V2 Models](https://opencode.ai/v2/docs/models) | Model selectors and variants |
| D6 | [V2 Config](https://opencode.ai/v2/docs/config) | Configuration locations and precedence |
| D7 | [Published config schema](https://opencode.ai/config.json) | Compatibility check; conflict recorded below |
| D8 | [V2 Policies](https://opencode.ai/v2/docs/policies) | Hard restrictions outside ordinary agent permissions |

Use `/v2/docs/` sources for this specification. Unversioned `/docs/` pages and historical design proposals are not substitutes for the V2 contract.

## Observed schema conflict — OPEN

On the review date, D6 linked to D7, but the fetched D7 exposed legacy `AgentConfig` fields including `permission`, `maxSteps`, and `tools`, and a root `agent` mapping. This does not match the native V2 authoring contract in D1/D2/D6. [D7]

**Resolution policy:** use the V2 documentation baseline for authoring; require a schema or parser tied to the installed V2 release before claiming runtime validation. NEVER "fix" native `permissions` into `permission` merely to satisfy this fetched schema. NEVER invent a versioned schema URL. Record the exact URL, retrieval date, runtime version, and any source commit used during a future verification.

No OpenCode executable was available in the review environment. Custom subagents, installed skills, live tool schemas, provider credentials, and merged agent configurations were not supplied. Their existence and behavior remain `UNVERIFIED`.
