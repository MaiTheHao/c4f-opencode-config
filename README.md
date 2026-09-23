# OpenCode Custom Configuration & Agents (OpenCode 2.x)

This repository contains custom agent definitions, workflows (skills), and configuration guidelines optimized natively for **OpenCode 2.x**, a highly configurable AI agentic coding system.

These settings are designed to be loaded globally (under `~/.config/opencode/`) or per-project (under `.opencode/`) to provide specialized agents for high-throughput software implementation and multi-stage research pipelines.

> [!NOTE]
> **OpenCode 2.x Compatibility**: All agent frontmatters and configs in this repository strictly adhere to the OpenCode V2 native specification (`permissions` ordered arrays, action renaming `shell`/`subagent`/`edit`, and `request.body.temperature`). For details, see [`optimize-agent-config.md`](file:///home/maithehao/.config/opencode/optimize-agent-config.md).

---

## Installation & Setup

Configure and set up OpenCode according to your use case below:

### Option 1: Per-Project Usage
1. Clone or download this repository.
2. Move the `agents/` and `skills/` directories into the root of your target project (under `.opencode/`).
3. Setup complete!

### Option 2: Global Usage
1. Clone or download this repository.
2. Move all repository contents into the global OpenCode configuration directory on your machine:
   - **Linux / macOS**: `~/.config/opencode/`
   - **Windows**: `%USERPROFILE%\.config\opencode\` (or `%APPDATA%\opencode\`)
3. Open a terminal in the target configuration directory and run:
   ```bash
   npm install
   ```

---

### Non-Essential Files (Cleanup / Storage Optimization)
If you wish to clean up or minimize the configuration bundle for production/storage, the following files and directories are optional and can be removed:
- `README.md` (This instruction file)
- `.gitignore` (Git configuration file)

---

## Directory Structure

```text
.
├── agents/                  # OpenCode 2.x agent definitions (Markdown + Frontmatter)
│   ├── great-builder/       # Fast implementation & analysis workflow agents
│   │   ├── fast.md          # Primary direct analyzer, editor, and git verifier
│   │   ├── fast/            # Fast specialist subagents (analyzer)
│   │   ├── normal.md        # Standard primary orchestrator
│   │   └── normal/          # Standard specialist subagents (analyzer)
│   └── research/            # Stage-based web research pipelines
│       ├── fast.md          # 3-stage research pipeline orchestrator
│       ├── normal.md        # 4-stage research pipeline orchestrator
│       ├── high.md          # 8-stage research pipeline orchestrator
│       └── shared/          # Shared specialist subagents (scout, deep, timeline, quant, skeptic, validation)
├── skills/                  # Extensible task-specific instructions (Skills)
│   ├── brainstorming/       # Architecture & requirement clarification workflow
│   ├── clean-code/          # SOLID, cohesion, and refactoring guidelines
│   ├── executing-plans/     # Checkpoint-driven execution process
│   ├── git-commit/          # Conventional commit message analysis and staging
│   ├── mermaid/             # Architecture and workflow diagram generator
│   ├── skill-creator/       # Skill authoring and eval toolkit
│   ├── subagent-reuse/      # Subagent session tracking and lifecycle reuse
│   └── writing-plans/       # Standard implementation plan formatting
├── optimize-agent-config.md # Standard specification for agent configurations (V2)
└── opencode.jsonc           # Main OpenCode configuration file
```

---

## Agents Overview (OpenCode 2.x)

OpenCode 2.x agents are defined in Markdown format (`.md`) with YAML frontmatter specifying their parameters, modes, and tool execution permissions using native V2 schemas.

### 1. Great Builder (`agents/great-builder/`)
A high-throughput implementation pipeline built to complete features and fix bugs quickly and safely with explicit human checkpoint gates.
- **Fast (`great-builder/fast` - Primary)**: Directly analyzes, edits, and verifies git status inline; delegates to `explore` and `general` when broad context is required.
- **Normal (`great-builder/normal` - Primary)**: Orchestrate-only agent that dispatches parallel analyzers (`great-builder/normal/analyzer`) and up to 4 parallel implementation units (`general`).
- **Specialist Subagents**:
  - `great-builder/fast/analyzer`: Fast read-only codebase analyzer for targeted scope discovery and execution contracts.
  - `great-builder/normal/analyzer`: In-depth cross-file reasoning, dependency analysis, and impact synthesis.

### 2. Research Pipelines (`agents/research/`)
A set of stage-based research pipelines that progressively discover, deep-dive, validate, and synthesize reports on complex topics.
- **Primary Pipelines**:
  - `research/fast`: 3-stage pipeline (Scout &rarr; Deep &rarr; Synthesis).
  - `research/normal`: 4-stage pipeline (Scout x2 &rarr; Parallel Deep &rarr; Skeptic Audit &rarr; Validation &rarr; Synthesis).
  - `research/high`: 8-stage pipeline (Triple Scout &rarr; Merge &rarr; Parallel Research &rarr; Gap Analysis &rarr; Recursive Research &rarr; Skeptic Audit &rarr; Validation &rarr; Synthesis).
- **Specialist Subagents (`research/shared/`)**:
  - `scout`: Maps research territory via web reconnaissance and produces tagged sub-queries.
  - `deep`: Performs iterative search and source-tier verification.
  - `timeline`: Tracks historical event chronological context and staleness risk.
  - `quant`: Scrutinizes quantitative numbers, sample sizes, and methodology.
  - `skeptic`: Actively searches for counter-evidence and minority rebuttals.
  - `validation`: Conducts independent cross-checks on findings and flags contradictions.

---

## Skills

Located in the `skills/` directory, these folder structures extend the capabilities of the agents through structured instruction sets (`SKILL.md`) and prompts.
- **`brainstorming`**: Step-by-step sequence to brainstorm architecture, evaluate options, and verify specifications before making changes.
- **`clean-code`**: Engineering principles for readability, correctness, and maintainability.
- **`writing-plans`**: Standard formatting structure to document implementation plans.
- **`executing-plans`**: Step-by-step process for executing and validating planned code.
- **`git-commit`**: Structured git commit staging and conventional message generation.
- **`mermaid`**: Visual diagram generation for markdown documents.
- **`skill-creator`**: Tools and workflows to build, evaluate, and optimize skills.
