# OpenCode Configuration & Agents

Custom agent definitions, model routing policies, and configuration optimized for OpenCode 2.x.

> **OpenCode 2.x Compatibility**: Agent configs adhere to V2 specification (ordered permissions, action renaming `shell`/`subagent`/`edit`, native reasoning settings). See [optimize-agent-config.md](optimize-agent-config.md).

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
- `clean-code`: Code quality, SOLID, and refactoring guidelines.
- `writing-plans`: Implementation plan drafting standard.
- `executing-plans`: Checkpoint-driven execution process.
- `git-commit`: Conventional commit analysis and staging.
- `mermaid`: Workflow and architectural diagrams.

*Note: Model routing (`skills/opencode-model-routing`) remains in this repo to handle provider-specific routing and subagent session reuse.*

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
│   ├── great-builder/       # Implementation & planning pipelines
│   │   ├── fast.md          # Direct analyzer, editor, and git verifier
│   │   ├── normal.md        # Parallel orchestrator
│   │   ├── planner.md       # Scope planner and plan reviewer
│   │   ├── planner/         # Planner subagents (analyzer, reviewer)
│   │   └── builder.md       # Plan-driven worker orchestrator
│   └── research/            # Web research pipelines
│       ├── fast.md          # 3-stage research orchestrator
│       ├── normal.md        # 4-stage research orchestrator
│       ├── high.md          # 8-stage research orchestrator
│       ├── extra.md         # In-depth research orchestrator
│       └── shared/          # Research subagents (scout, deep, quant, skeptic, validation)
├── changelogs/              # Change history
├── skills/                  # Local repo skills
│   └── opencode-model-routing/ # Model routing & session reuse
├── optimize-agent-config.md # Agent configuration specification
└── opencode.jsonc           # OpenCode main config
```

---

## Agents Summary

### 1. Great Builder (`agents/great-builder/`)
- `fast`: Direct analyze, edit, and git verification.
- `normal`: Orchestrator dispatching parallel analyzers and workers.
- `planner`: Read-only planner and reviewer (`brainstorming`, `writing-plans`).
- `builder`: Parallel execution engine for approved plans.

### 2. Research Pipelines (`agents/research/`)
- `fast`: 3-stage pipeline (Scout -> Deep -> Synthesis).
- `normal`: 4-stage pipeline (Parallel Scout -> Deep -> Skeptic -> Synthesis).
- `high`: 8-stage exhaustive recursive research pipeline.
- `extra`: Deep multi-phase specialized investigation.
- `shared/*`: Subagents for search reconnaissance, verification, quantitative checks, and audits.
