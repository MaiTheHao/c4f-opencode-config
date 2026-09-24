---
name: opencode-model-routing
description: >-
  Route agent roles, subagents, and model selection on provider opencode-go. Use whenever
  deciding which model to assign to a task, configuring subagents, or picking models for code,
  planning, review, scouting, analysis, or bulk processing. Covers cost-first (default: cheap)
  vs quality-first escalation modes, variant choice, and data-governance limits.
---

# Model Routing

Routes 14 agent roles across 4 models on provider `opencode-go`.
Target format: `opencode-go/<model>#<variant>` (or `opencode-go/<model>` when the model has no variants).

---

## 1. Role Definitions

| Role | Group | What it does | Typical trigger |
|---|---|---|---|
| `code` | Code | Implement feature / fix bug end-to-end (agentic tool loop) | "implement X", "fix bug Y" |
| `code-cheap` | Code | Execute already-decided plan steps; the plan carries the reasoning | "apply step N", plan execution |
| `bulk-edit` | Code | Mechanical repeated edits across many files (rename, API propagation, boilerplate) | codemod, mass replace |
| `refactor` | Code | High-risk structural / multi-file change with hidden coupling | "refactor module", "restructure" |
| `test` | Code | Write/repair tests, run-fix loops, coverage expansion | "add tests", "fix failing tests" |
| `research-scout` | Research | Broad recon, exploratory searches, low rigor per query | first-pass scoping |
| `research-deep` | Research | Deep dive on one narrow sub-question, primary sources, high rigor | "dig into X" |
| `analyze` | Analysis | Read code/logs/docs, root-cause analysis, architectural breakdown | "why does this happen" |
| `quant` | Analysis | Extract and audit numbers, benchmarks, methodology | "how much", "audit the methodology" |
| `review` | Review | Code/PR review, defect finding, quality gate | "review this PR" |
| `skeptic` | Review | Adversarial audit: challenge claims, hunt counter-evidence | "find flaws in this argument" |
| `validation` | Review | Cross-check outputs for consistency, contradictions, regressions | "do these agree" |
| `quick` | General | Low-latency small tasks: classify, extract metadata, commit message | single small query |
| `bulk` | General | High-volume text generation: summaries, docs, changelogs | mass summarization |

---

## 2. Routing Modes

- **`cheap` (default, cost-first):** use the minimum quota that reliably succeeds, for every role.
- **`quality` (opt-in):** only on an explicit high-stakes signal: "high accuracy", "critical", "production", "security-grade", "cần chính xác cao", "đừng sai".
- **Role-scoped escalation:** escalate only the role that decides the final deliverable. Keep `code-cheap`, `bulk-edit`, `research-scout` on `cheap`.
- **Cheap-first priority:** `code`, `bulk-edit`, `code-cheap` always run on the cheapest competent model; maximum performance is not their goal.
- **Data-governance gate:** hard veto in both modes (see Rule 4).

---

## 3. Routing Model Table

### Routing

| Role | `cheap` (default) | `quality` (opt-in) |
|---|---|---|
| `code` | `glm-5.3-flash#high` | `deepseek-v4.1-flash#max` |
| `code-cheap` | `glm-5.3-flash#low` | `deepseek-v4.1-flash#high` |
| `bulk-edit` | `glm-5.3-flash#low` | `glm-5.3-flash#high` (rarely worth it) |
| `refactor` | `glm-5.3-flash#high` | `deepseek-v4.1-flash#max` |
| `test` | `glm-5.3-flash#high` | `deepseek-v4.1-flash#max` |
| `research-scout` | `deepseek-v4.1-flash#low` | `deepseek-v4.1-flash#high` |
| `research-deep` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `analyze` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `quant` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `review` | `deepseek-v4.1-flash#high` | `mimo-v2.6-pro` |
| `skeptic` | `deepseek-v4.1-flash#high` | `muse-spark-1.3-contributor#xhigh` (public data only); else `mimo-v2.6-pro` |
| `validation` | `deepseek-v4.1-flash#high` | `deepseek-v4.1-flash#max` |
| `quick` | `glm-5.3-flash#low` | `glm-5.3-flash#high` |
| `bulk` | `muse-spark-1.3-contributor#low` (public only); else `glm-5.3-flash#low` | same as `cheap` |

All targets are prefixed `opencode-go/`. Verifier rows (`review`, `skeptic`, `validation`) assume the generator runs on GLM; see Rule 3 for the swap.

---

## 4. Variants

| Model | Variants | Notes |
|---|---|---|
| `glm-5.3-flash` | `low`, `high`, `max` | Vendor default is `max`; thinking cannot be disabled. `#low` for mechanical/bulk, `#high` for logic and review, `#max` only when escalating |
| `deepseek-v4.1-flash` | `low` (=50), `high` (=75), `max` (=100) reasoning effort | Never `#low` for `analyze`, `research-deep`, `quant`; `#low` is for scout triage only |
| `mimo-v2.6-pro` | none | Route by model ID alone, no suffix |
| `muse-spark-1.3-contributor` | `minimal`, `low`, `medium`, `high`, `xhigh` | `#max` is unavailable on Contributor tier; `#xhigh` is the ceiling |

---

## 5. Rules

1. **Default to `cheap`.** Start from the cheap column; escalate only on an explicit quality trigger.
2. **Escalate per role.** Raise only the role that decides the final deliverable; supporting roles stay cheap.
3. **Family diversity for verifiers.**
   - `review` MUST NOT share a model family with the generator (`code` / `code-cheap`).
   - `skeptic` and `validation` SHOULD use a different family from the generator.
   - Table defaults assume a GLM generator. If the generator runs on DeepSeek (e.g. `quality` `code`/`refactor`/`test`), swap the verifier to `glm-5.3-flash#high` (`#max` in `quality`); `review` in `quality` stays on MiMo.
4. **Data-governance gate (hard veto, both modes).** NEVER send proprietary or sensitive data (private codebase, incident logs, PII, internal docs) to `muse-spark-1.3-contributor`. Use Muse only for open/public text (`bulk`) or public skeptic audits. When in doubt, use GLM.
5. **Muse latency.** Budget 23-45s TTFT. Never use Muse for `quick`, `research-scout`, or interactive review loops.
6. **Quota watch.**
   - The DeepSeek $60 cap ends **2026-09-27** and drops to $15, level with MiMo; GLM is then the only large pool.
   - When DeepSeek quota runs low, fall back `analyze`, `research-deep`, `quant` to `glm-5.3-flash#high` (`#max` in `quality`) and apply Rule 3.
   - GLM speed varies by backend (43-454 t/s): pin a fast provider for latency-sensitive tasks.
7. **Tie-break.** Prefer the cheaper model unless the user explicitly asked for maximum quality.