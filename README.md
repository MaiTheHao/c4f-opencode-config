<div align="center">

# OpenCode Configuration & Agents

**Custom agent definitions, model routing policies, and configuration optimized for OpenCode 2.x**

[![OpenCode 2.x](https://img.shields.io/badge/OpenCode-2.x-1f6feb?style=for-the-badge)](#)
[![Validator](https://img.shields.io/badge/Validator-must%20exit%200-3fb950?style=for-the-badge)](#validation)

</div>

---

> [!IMPORTANT]
> **OpenCode 2.x Compatibility**
> Agent configs adhere to the **V2 specification** — ordered permissions, action renaming (`shell` / `subagent` / `edit`), and native reasoning settings.
> The authoring standard, validator, and acceptance procedure live in [`skills/oc-agent-config/`](skills/oc-agent-config/).

---

## Table of Contents

| Section | Section |
|---|---|
| [Overview](#overview) | [Agents](#agents) |
| [Quick Start](#quick-start) | [Routing & Skills](#routing--skills) |
| [External Skills Setup](#external-skills-setup-required) | [Validation](#validation) |
| [Installation](#installation) | [Tooling & Diagnostics](#tooling--diagnostics) |
| [Directory Structure](#directory-structure) | [FAQ & Troubleshooting](#faq--troubleshooting) |

---

## Overview

This repository ships **two families of agents** plus the skills and tooling that keep them honest:

| | Family | What it does |
|:--:|---|---|
| | **Implementation** | Plan-driven and direct-edit build pipelines, split by effort. |
| | **Research** | Web research pipelines with evidence tiering, adversarial checking, and structured reports. |
| | **Routing** | One routing skill for both dev and research lanes; HIGH primaries pin roles and models. |
| | **Tooling** | Model routing table, catalog queries, static validation, audit and smoke tests. |

---

## Quick Start

> [!TIP]
> The three commands below are the fastest path to a working global install (Linux / macOS).
> Windows equivalents are in [Installation](#installation).

```bash
# 1) Required: workflow skills
mkdir -p ~/.agents
git clone https://github.com/MaiTheHao/c4f-agent-skills.git ~/.agents/skills

# 2) Config
git clone https://github.com/MaiTheHao/c4f-opencode-config.git ~/.config/opencode

# 3) Dependencies
cd ~/.config/opencode && npm install
```

Then validate the agent files before you ship anything:

```bash
python3 skills/oc-agent-config/scripts/validate_agent.py \
  agents/great-builder/*.md agents/great-builder/sub/*.md \
  agents/research/*.md agents/research/shared/*.md
```

---

## External Skills Setup (Required)

General agent workflow skills are managed in **[c4f-agent-skills](https://github.com/MaiTheHao/c4f-agent-skills.git)**.
Clone them into your **user agents directory**:

| OS | Target directory |
|---|---|
| Linux / macOS | `~/.agents/skills` |
| Windows | `%USERPROFILE%\.agents\skills` |

<details open>
<summary><b>Linux / macOS</b></summary>

```bash
mkdir -p ~/.agents
git clone https://github.com/MaiTheHao/c4f-agent-skills.git ~/.agents/skills
```

**Update:**

```bash
git -C ~/.agents/skills pull
```

</details>

<details>
<summary><b>Windows (PowerShell / Command Prompt)</b></summary>

```powershell
# PowerShell
New-Item -ItemType Directory -Force -Path "$HOME\.agents"
git clone https://github.com/MaiTheHao/c4f-agent-skills.git "$HOME\.agents\skills"
```

**Update:**

```powershell
git -C "$HOME\.agents\skills" pull
```

</details>

### Bundled skills in the external repo

| Skill | Purpose |
|---|---|
| `brainstorming` | Architecture & requirements clarification |
| `refactoring-code` | Code quality, SOLID, and refactoring guidelines |
| `writing-plans` | Implementation plan drafting standard |
| `executing-plans` | Checkpoint-driven execution process |
| `git-commit` | Conventional commit analysis and staging |
| `mermaid` | Workflow and architectural diagrams |
| `skill-creator` | Skill creation, iteration, and evaluation workflow |

> [!NOTE]
> `skills/oc-routing` is the **single routing skill** for both dev and research subagents.
> Every primary embeds its lane parameters and audit rules in a `### Routing` section —
> the **HIGH primaries** also pin roles and models, while the others pick the model from the skill's table.
> The evidence-tier rubric lives in `skills/oc-research-tiering`, loaded by every research agent through the `skill` tool **before** it classifies a source.

---

## Installation

### Global Usage (Recommended)

Clone this repository into your **global OpenCode configuration directory**:

| OS | Config directory |
|---|---|
| Linux / macOS | `~/.config/opencode` |
| Windows | `%USERPROFILE%\.config\opencode` *(or `%APPDATA%\opencode`)* |

<details open>
<summary><b>Linux / macOS</b></summary>

```bash
# Clone opencode config
git clone https://github.com/MaiTheHao/c4f-opencode-config.git ~/.config/opencode

# Install dependencies
cd ~/.config/opencode
npm install
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
# Clone opencode config
git clone https://github.com/MaiTheHao/c4f-opencode-config.git "$HOME\.config\opencode"

# Install dependencies
cd "$HOME\.config\opencode"
npm install
```

</details>

### Per-Project Usage

1. Place `agents/` inside `.opencode/` at the project root.
2. Ensure skills exist in `~/.agents/skills` (or `.opencode/skills/`).

> [!WARNING]
> `opencode.jsonc` is gitignored and holds machine-local configuration; it is never pushed. Keep a local backup.

---

## Directory Structure

```text
.
├── agents/                  # OpenCode agent definitions
│   ├── great-builder/       # Implementation pipelines, split by effort
│   │   ├── build-low.md     # Primary: direct edit of one small change (≤2 files)
│   │   ├── build-medium.md  # Primary: analyzer, one checkpoint, direct edit or ≤5 workers
│   │   ├── build-high.md    # Primary: plan-driven waves, up to 5 workers, mandatory review before report
│   │   └── sub/             # Read-only specialist subagents
│   │       ├── analyzer.md  # Scope discovery and codebase analysis
│   │       ├── bulk.md      # Mechanical, spec-complete edits
│   │       └── reviewer.md  # Verifies the diff or commit against an approved plan
│   └── research/            # Web research pipelines
│       ├── fast.md          # Low effort research orchestrator
│       ├── normal.md        # Medium effort research orchestrator
│       ├── high.md          # Maximum effort research orchestrator
│       └── shared/          # Research subagents (scout, deep, quant, skeptic, validation, timeline)
├── skills/                  # Local repo skills
│   ├── oc-agent-config/     # Agent authoring spec, validator, and references
│   ├── oc-research-tiering/ # T1/T2/T3 evidence rubric + ResearchReport schema
│   ├── oc-retrieval/        # Retrieval skill (`c4f-retrieval` namespace tools)
│   └── oc-routing/          # Model routing & session reuse (dev + research lanes)
├── plugins/                 # Native plugins (loaded by OpenCode)
│   ├── c4f-model-policy/    # Runtime filtering + `allowed_models` (namespace `c4f-model-policy`)
│   └── c4f-retrieval/       # Verified-context retrieval plugin
├── AGENTS.md                # Repo-level agent instructions (currently empty)
├── package.json             # Dependencies (@opencode/plugin, effect, typescript)
└── opencode.jsonc           # Local OpenCode config (gitignored)
```

---

## Agents

Two agent families plus shared routing. The **authoritative, up-to-date list of primaries and subagents** lives in the [`agents/`](agents/) directory — treat the file tree above as the source of truth rather than duplicating it here.

| Family | Directory | Role |
|---|---|---|
| Implementation | [`agents/great-builder/`](agents/great-builder/) | Effort-tiered build pipelines with read-only analyzer and reviewer subagents |
| Research | [`agents/research/`](agents/research/) | Effort-tiered research pipelines with shared research subagents |

Installed agent IDs are **namespaced by directory** — e.g. `great-builder/build-low`, `great-builder/sub/analyzer`, `research/high`, `research/shared/scout`.

> [!NOTE]
> Effort tiers (low / medium / high) select the flow, worker budget, and checkpoint policy for each family. The exact tiering behaviour is defined in the individual agent files and in `skills/oc-routing` — not restated here, to avoid drift.

---

## Routing & Skills

| Layer | Location | Notes |
|---|---|---|
| Routing skill | `skills/oc-routing/` | Single routing skill for **dev + research** lanes; session reuse |
| Tier rubric | `skills/oc-research-tiering/` | T1/T2/T3 evidence rubric + `ResearchReport` schema |
| Retrieval | `skills/oc-retrieval/` | `c4f-retrieval` namespace tooling |
| Authoring spec | `skills/oc-agent-config/` | V2 spec, validator, references |

**How routing resolves:**

1. Every primary agent embeds its **lane parameters** and **audit rules** under `### Routing`.
2. **HIGH primaries** pin both roles and models explicitly.
3. All other primaries select the model from the routing skill's table.
4. Every research agent loads `oc-research-tiering` via the `skill` tool **before** classifying a source.

---

## Validation

Static-check **every** agent file after editing it:

```bash
python3 skills/oc-agent-config/scripts/validate_agent.py \
  agents/great-builder/*.md agents/great-builder/sub/*.md \
  agents/research/*.md agents/research/shared/*.md
```

Add `--json` for machine-readable output.

> [!CAUTION]
> The validator **must exit `0`**. Warnings are review items, not passes.
> Static parsing is **not** behavioral proof — exercise the agent in the installed runtime before shipping.

| Exit code | Meaning | Action |
|:---:|---|---|
| `0` | Pass | Ship it (review warnings) |
| `≠0` | Failure | Fix the agent file, re-run |

---

## Tooling & Diagnostics

| Surface | Purpose |
|---|---|
| `tools['c4f-model-policy'].allowed_models` (`c4f-model-policy` namespace) | Routing table: model, provider, variants, routing tier, trigger |
| `c4f-retrieval` tools (`context_lookup`, `context_upsert`, `context_invalidate`, `python_symbols`) | Verified repository context |
| `python3 skills/oc-agent-config/scripts/validate_agent.py <files>` | Validate agent files |

Enforcement lives in the `c4f-model-policy` plugin; routing data comes from the
`tools['c4f-model-policy'].allowed_models` call in the `c4f-model-policy` namespace, not a shell command.

---

## FAQ & Troubleshooting

<details>
<summary><b>Skills aren't being picked up</b></summary>

Verify the skills actually exist at the expected path:

```bash
ls ~/.agents/skills                    # Linux / macOS
dir "%USERPROFILE%\.agents\skills"     # Windows
```

For per-project installs, skills may also live in `.opencode/skills/`.
Update an existing clone with `git -C ~/.agents/skills pull`.

</details>

<details>
<summary><b>The validator fails after I edit an agent</b></summary>

Re-run with machine-readable output to see exactly which rule broke:

```bash
python3 skills/oc-agent-config/scripts/validate_agent.py --json <files>
```

Check the V2 requirements: ordered permissions, action names (`shell` / `subagent` / `edit`), and native reasoning settings.

</details>

<details>
<summary><b>Windows paths differ from the docs</b></summary>

Use `%USERPROFILE%\.config\opencode` — or `%APPDATA%\opencode` if your OpenCode build resolves there. Skills go to `%USERPROFILE%\.agents\skills`.

</details>

<details>
<summary><b>Do I need the external skills repo?</b></summary>

Yes. The workflow skills are **required**; the local `skills/` folder only contains routing, tiering, retrieval, and the agent-authoring spec.

</details>

---

<div align="center">

**Built for OpenCode 2.x** · Validate → run → ship

[Back to top](#opencode-configuration--agents)

</div>