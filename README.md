# OpenCode Configuration & Agents

Custom agent definitions, model routing policies, and configuration optimized for OpenCode 2.x.

> **OpenCode 2.x Compatibility**: Agent configs adhere to V2 specification (ordered permissions, action renaming `shell`/`subagent`/`edit`, native reasoning settings). The authoring standard, validator, and acceptance procedure live in [`skills/oc-agent-config/`](skills/oc-agent-config/).

---

## External Skills Setup (Required)

General agent workflow skills are managed in [c4f-agent-skills](https://github.com/MaiTheHao/c4f-agent-skills.git). Clone them to your user agents directory:

- **Linux / macOS**: `~/.agents/skills`
- **Windows**: `%USERPROFILE%\.agents\skills`

#### Linux / macOS:
```bash
mkdir -p ~/.agents
git clone https://github.com/MaiTheHao/c4f-agent-skills.git ~/.agents/skills
```

To update:
```bash
git -C ~/.agents/skills pull
```

#### Windows (PowerShell / Command Prompt):
```powershell
# PowerShell
New-Item -ItemType Directory -Force -Path "$HOME\.agents"
git clone https://github.com/MaiTheHao/c4f-agent-skills.git "$HOME\.agents\skills"
```

To update:
```powershell
git -C "$HOME\.agents\skills" pull
```

Bundled skills in external repo:
- `brainstorming`: Architecture & requirements clarification.
- `refactoring-code`: Code quality, SOLID, and refactoring guidelines.
- `writing-plans`: Implementation plan drafting standard.
- `executing-plans`: Checkpoint-driven execution process.
- `git-commit`: Conventional commit analysis and staging.
- `mermaid`: Workflow and architectural diagrams.
- `skill-creator`: Skill creation, iteration, and evaluation workflow.

*Note: `skills/oc-routing` is the single routing skill for both dev and research subagents. Every primary embeds its lane parameters and audit rules in `### Routing`; the HIGH primaries also pin roles and models, while the others pick the model from the skill's table. The evidence-tier rubric lives in `skills/oc-research-tiering`, loaded by every research agent through the `skill` tool before it classifies a source.*

## Installation

### Global Usage (Recommended)

Clone this repository into your global OpenCode configuration directory:

- **Linux / macOS**: `~/.config/opencode`
- **Windows**: `%USERPROFILE%\.config\opencode` (or `%APPDATA%\opencode`)

#### Linux / macOS:
```bash
# Clone opencode config
git clone https://github.com/MaiTheHao/c4f-opencode-config.git ~/.config/opencode

# Install dependencies
cd ~/.config/opencode
npm install
```

#### Windows (PowerShell):
```powershell
# Clone opencode config
git clone https://github.com/MaiTheHao/c4f-opencode-config.git "$HOME\.config\opencode"

# Install dependencies
cd "$HOME\.config\opencode"
npm install
```

### Per-Project Usage
1. Place `agents/` in `.opencode/` at project root.
2. Ensure skills exist in `~/.agents/skills` (or `.opencode/skills/`).

---

## Directory Structure

```text
.
├── agents/                  # OpenCode agent definitions
│   ├── great-builder/       # Implementation pipelines, split by effort
│   │   ├── build-low.md     # Primary: direct edit of one small change (≤2 files)
│   │   ├── build-medium.md  # Primary: analyzer, one checkpoint, direct edit or ≤5 workers
│   │   ├── build-high.md    # Primary: plan-driven waves, up to 5 workers, review on request
│   │   └── sub/             # Read-only specialist subagents
│   │       ├── analyzer.md  # Scope discovery and codebase analysis
│   │       └── reviewer.md  # Verifies the diff or commit against an approved plan
│   └── research/            # Web research pipelines
│       ├── fast.md          # Low effort research orchestrator
│       ├── normal.md        # Medium effort research orchestrator
│       ├── high.md          # Maximum effort research orchestrator
│       └── shared/          # Research subagents (scout, deep, quant, skeptic, validation, timeline)
├── skills/                  # Local repo skills
│   ├── oc-agent-config/     # Agent authoring spec, validator, and references
│   ├── oc-research-tiering/ # T1/T2/T3 evidence rubric + ResearchReport schema
│   ├── oc-retrieval/        # Retrieval MCP tooling skill
│   └── oc-routing/          # Model routing & session reuse (dev + research lanes)
├── scripts/                 # Policy tooling (tracked)
│   ├── show_models.py       # Model catalog query, allowlist check, routing table
│   └── c4f.py               # protect (file modes) | audit | smoke | doctor
└── opencode.jsonc           # OpenCode main config (not gitignored; commit it)
```

---

## Agents Summary

### 1. Great Builder (`agents/great-builder/`)

Installed IDs are namespaced: `great-builder/build-low`, `great-builder/build-medium`,
`great-builder/build-high`, `great-builder/sub/analyzer`, and
`great-builder/sub/reviewer`.

| Agent | Effort | Flow | Use |
|---|---|---|---|
| `great-builder/build-low` | Low (green) | Direct edit, no subagents or checkpoint | ≤2 files, clear change |
| `great-builder/build-medium` | Medium (yellow) | Analyzer → one checkpoint → direct edit or ≤5 workers | Feature or fix across a few files |
| `great-builder/build-high` | High (red) | Existing plan or Self-Plan → approval → dependency waves → verify; review on request | Large or high-risk change |

- `sub/analyzer`: Read-only, depth-adjustable codebase analyzer.
- `sub/reviewer`: Read-only reviewer of the diff or commit against an approved plan.
- `skills/oc-routing`: Shared model/lane routing; each build tier embeds its own dev lanes in `### Routing`.

### 2. Research Pipelines (`agents/research/`)
- `fast`: Low effort — solo researcher, 1-2 search passes, inline self-check, no subagent audit.
- `normal`: Medium effort — scout, deep research, one round of skeptic/validation.
- `high`: Maximum effort — reinforced scout, multi-wave recursive deep research, multi-pass skeptic + validation.
- `shared/*`: Subagents for reconnaissance (`scout`), deep dives (`deep`), quantitative checks (`quant`), counter-evidence (`skeptic`), cross-checking (`validation`), and timelines (`timeline`).

---

## Validation

Static-check every agent file after editing it:

```bash
python3 skills/oc-agent-config/scripts/validate_agent.py \
  agents/great-builder/*.md agents/great-builder/sub/*.md \
  agents/research/*.md agents/research/shared/*.md
```

Add `--json` for machine-readable output. It must exit `0`; warnings are review items. Static parsing is not behavioral proof — exercise the agent in the installed runtime before shipping.
