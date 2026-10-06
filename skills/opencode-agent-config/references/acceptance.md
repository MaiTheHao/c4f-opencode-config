# Acceptance Procedure

**Load this when** about to declare any agent change complete, or when running the acceptance procedure. Run in the target project/configuration context. Use disposable files and child sessions for behavioral checks; do not probe permissions on real secrets or production operations.

1. **Identify:** record runtime version/build, agent deployment IDs, input hashes, requested scope, and this spec revision.
2. **Refresh evidence:** open only relevant current V2 sources; check schema identity and document differences before changing the baseline.
3. **Parse:** run `python3 scripts/validate_agent.py <agent.md>` for the machine-checkable subset (duplicate keys, required/rejected fields, forbidden sampling keys, permission invariants, body layout, line budget), then review anything it cannot see (types, enums, semantics) by hand.
4. **Resolve:** inspect the merged agent entry and live catalog, including global/project overrides, policies, saved approvals, skill winners, and child definitions.
5. **Trace capabilities:** map each workflow operation to a callable tool, its permission action/resource, and dependencies. Resolve all required-but-denied operations without blanket grants.
6. **Review behavior:** check layout, routing precondition, table/allowlist agreement, closed output contracts, failure transitions, gates, slot limits, operational budgets, and line budgets.
7. **Validate in runtime:** load the actual Markdown with the installed parser, confirm discovery by exact ID, then exercise the relevant cases below. YAML parsing alone is not runtime validation.
8. **Review changes:** compare against the initial state and approved scope; preserve unrelated work. Report successful checks separately from skipped or blocked checks.
9. **Record:** update this specification when a rule changes; apply agent changes only when requested. Never mutate all profiles merely because the source-of-truth file was revised.

## Focused behavioral cases

| Case | Expected result under the selected project profile |
|---|---|
| Catch-all deny followed by exact allow | Allowed target succeeds; a neighboring target is denied |
| Leaf child attempts delegation | Denied by the child's effective rule |
| Solo researcher attempts edit/shell/child call | Denied |
| Planner writes `local/check.md` vs `src/check.ts` | Artifact allowed; source mutation denied |
| Read `.env`, `.env.production`, nested equivalents | Explicit project deny applies; check other access channels separately |
| Read authorized external fixture | Directory and read rules both satisfied |
| Load missing / denied required skill | Report exact dependency failure, never claim readiness |
| Continue a child session | Correct returned handle and preserved task contract |
| Unsupported `model` argument | Not sent; use verified route or report blocker |
| Enable Code Mode with nested edit denied | Nested edit remains denied; review exposed utility exceptions |
| Implementation scope expands | Update affected-file plan and obtain required scope authorization |
| Child result malformed / retry limit reached | Correct bounded failure transition |
| Research budget exhausted with open gaps | Qualified synthesis; gaps explicitly retained |

## Acceptance record

```text
SpecRevision: 2.0.0
RuntimeVersion: <actual version, or UNVERIFIED>
AgentIDs: <resolved installed IDs>
ChangedFiles: <paths and actions>
NativeSchemaCheck: PASS | FAIL | UNVERIFIED
ProjectPolicyCheck: PASS | FAIL | UNVERIFIED
RuntimeSmokeCheck: PASS | FAIL | UNVERIFIED
DependencyCheck: PASS | FAIL | UNVERIFIED
Exceptions: <explicitly accepted scope/size exceptions, or none>
RemainingBlockers: <specific blockers, or none>
```

For this revision: documentation review and local static checks were completed. The remote schema conflict remains open. Runtime smoke and installed-dependency checks are `UNVERIFIED`; this specification does not certify the sample agents as deployment-ready.
