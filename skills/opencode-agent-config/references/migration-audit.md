# Migration Audit: Supplied Agents

**Load this when** migrating or auditing the supplied agent family and its cross-file dependencies. Labels identify uploaded files, not inferred installed IDs.

`normal.md` and `normal (1).md` have different roles and MUST NOT be merged because of their similar names.

| File | Role / lines | Findings to address in a future authorized change |
|---|---|---|
| `normal.md` | Builder orchestrator / 72 | `list` lacks a documented Core target; per-call `model` requires live-schema proof; duplicate orchestrate-only wording; missing implementation failure/cancel transitions; success requires defined verification, not an empty diff |
| `planner.md` | Planner/reviewer / 90 | `list`; `.env.*` is not covered by its explicit `.env` deny; `writing-plans` path is unknown; draft writes contradict the old universal mutation gate; `git diff *` is broader than strict inspection; cancel and report schemas need definition |
| `fast.md` | Solo researcher / 51 | Default-deny web profile is coherent; solo exemption applies; `UserTopic` is a prompt variable, not a native tool input; skill supporting-file dependencies and provider availability require checks |
| `normal (1).md` | Research orchestrator / 71 | Custom child/DTO definitions missing; no global concurrency cap; routing mechanism unverified; audit diversity uses soft `SHOULD`; report truncation must retain evidence references and uncertainty |
| `extra.md` | Extended researcher / 119 | `UNLIMITED` in concurrent-slot column conflicts with numeric capacity semantics; define operational stop budget; preserve 16 global cap; distinguish scout capacity 8 from initial 5; do not require disjoint sources at the cost of authoritative verification |

All supplied YAML frontmatters use the native ordered `permissions` shape and an initial catch-all deny. All five fit the primary line target. All four delegating primaries include the routing sentence and a Subagents table. None of those observations proves that referenced children, models, tools, or skills are installed.

## Cross-file dependency findings

| Dependency | Observed status | Acceptance requirement |
|---|---|---|
| `great-builder/planner/analyzer`, `great-builder/planner/reviewer` | Referenced; definitions absent | Verify IDs, modes, own permissions, and output contracts |
| `general` | Built-in ID referenced; effective override unknown | Verify installed effective configuration and implementation report contract |
| `research/shared/{scout,deep,timeline,quant,skeptic,validation}` | Custom IDs referenced; definitions absent | Verify every child; do not substitute a nonexistent built-in scout |
| `brainstorming`, `writing-plans`, `opencode-routing-dev`, `opencode-routing-research` | Referenced; bodies absent | Verify discovery, loading, references, and compatibility |
| Per-call/resume `model` argument | Required by sample prose; not verified | Inspect actual schema or supported routing extension |
| `execute` dependency | No sample grants it | Verify direct-tool exposure before deciding whether it is required |
| No-delegation / research read-only | Parent prose only for unseen custom children | Inspect and test effective child permissions |

## Changes made to the original optimization specification

- Added version/date/evidence status, source links, and an explicit schema-conflict record.
- Separated native runtime behavior from stricter project authoring rules.
- Added `disabled`, complete `request` shape and its documented runtime limitation.
- Replaced global keyword bans with structural checks; retained the project sampling prohibition.
- Added tool/resource distinctions, skill dependency checks, and routing-capability verification.
- Reconciled solo agents, planner artifacts, approval vocabulary, finite concurrency, retries, and success criteria.
- Added a file-by-file migration backlog and executable acceptance procedure; no primary-agent file was changed.
