# OpenCode Configuration & Agents

Custom agent definitions, model routing policies, and configuration optimized for OpenCode 2.x.

> **OpenCode 2.x Compatibility**: Agent configs adhere to V2 specification (ordered permissions, action renaming `shell`/`subagent`/`edit`, native reasoning settings). The authoring standard, validator, and acceptance procedure live in [`skills/opencode-agent-config/`](skills/opencode-agent-config/).

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

*Note: Model routing (`skills/opencode-routing-dev` and `skills/opencode-routing-research`) remains in this repo to handle provider-specific routing and subagent session reuse.*

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
├── AGENTS.md                # Global agent-authoring instructions (loaded by OpenCode V2)
├── agents/                  # OpenCode agent definitions
│   ├── great-builder/       # Implementation & planning pipelines
│   │   ├── quick.md         # Primary: direct edits or orchestrated parallel implementation
│   │   ├── builder.md       # Primary: plan-driven execution with parallel workers
│   │   └── planner/         # Read-only planner subagents
│   │       ├── analyzer.md  # Scope discovery and codebase analysis
│   │       └── reviewer.md  # Verifies the working-tree diff against an approved plan
│   └── research/            # Web research pipelines
│       ├── fast.md          # Low effort research orchestrator
│       ├── normal.md        # Medium effort research orchestrator
│       ├── high.md          # Maximum effort research orchestrator
│       └── shared/          # Research subagents (scout, deep, quant, skeptic, validation, timeline)
├── changelogs/              # Change history
├── skills/                  # Local repo skills
│   ├── opencode-agent-config/            # Agent authoring spec, validator, and references
│   ├── opencode-research-source-tiering/ # Shared T1/T2/T3 evidence rubric
│   ├── opencode-routing-dev/             # Model routing & session reuse for dev agents
│   └── opencode-routing-research/        # Model routing & session reuse for research agents
└── opencode.jsonc           # OpenCode main config (local, gitignored)
```

---

## Agents Summary

### 1. Great Builder (`agents/great-builder/`)
- `quick`: Unified primary for single-file fixes through multi-file parallel implementation, behind one human checkpoint.
- `builder`: Plan-driven primary; drafts or consumes a plan and executes it with up to 5 parallel workers.
- `planner/analyzer`: Read-only, depth-adjustable codebase analyzer.
- `planner/reviewer`: Read-only reviewer of the working-tree diff against an approved plan.

### 2. Research Pipelines (`agents/research/`)
- `fast`: Low effort — one search pass, minimal verification, no subagent audit.
- `normal`: Medium effort — scout, deep research, one round of skeptic/validation.
- `high`: Maximum effort — reinforced scout, multi-wave recursive deep research, multi-pass skeptic + validation.
- `shared/*`: Subagents for reconnaissance (`scout`), deep dives (`deep`), quantitative checks (`quant`), counter-evidence (`skeptic`), cross-checking (`validation`), and timelines (`timeline`).

---

## Validation

Static-check every agent file after editing it:

```bash
python3 skills/opencode-agent-config/scripts/validate_agent.py \
  agents/great-builder/*.md agents/great-builder/planner/*.md \
  agents/research/*.md agents/research/shared/*.md
```

Add `--json` for machine-readable output. It must exit `0`; warnings are review items. Static parsing is not behavioral proof — exercise the agent in the installed runtime before shipping.
