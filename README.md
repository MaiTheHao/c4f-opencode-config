# OpenCode Custom Configuration & Agents

This repository contains custom agent definitions, workflows (skills), and help documentation for **OpenCode**, a highly configurable AI agentic coding system.

These settings are designed to be loaded globally (under `~/.config/opencode/`) or per-project (under `.opencode/`) to provide specialized agents for brainstorming, high-throughput software implementation, and multi-stage research pipelines.

---

## Directory Structure

```text
.
├── agents/                  # Configuration files defining custom AI agents
│   ├── brainstorming/       # Design & planning workflow agents
│   ├── great-builder/       # Fast implementation workflow agents
│   └── research/            # Stage-based research pipeline agents
├── help/                    # Reference guides for OpenCode features
├── skills/                  # Extensible task-specific instructions (Skills)
└── opencode.jsonc           # Main configuration file
```

---

## Agents Overview

OpenCode agents are defined in Markdown format (`.md`) with YAML frontmatter specifying their parameters, modes, and tool execution permissions.

### 1. Brainstorming (`agents/brainstorming/`)
A structured workflow geared towards evaluation, specification, and implementation planning before touching code modifications.
- **Orchestrator (`brainstorming/orchestrator` - Primary)**: Main interface that evaluates user requests, delegates specification to subagents, and drives execution.
- **Specialist Subagents**:
  - `brainstorming/research`: Scopes codebase analysis and evaluates tradeoffs.
  - `brainstorming/plan-writer`: Generates detailed execution plans.
  - `brainstorming/implementation`: Implements changes outlined in approved plans.
  - `brainstorming/review`: Evaluates completed work.

### 2. Great Builder (`agents/great-builder/`)
A high-throughput implementation pipeline built to complete features and fix bugs extremely quickly without design specs or extensive planning.
- **Orchestrator (`great-builder/orchestrator` - Primary)**: Directly routes tasks based on active codebase patterns and constraints.
- **Specialist Subagents**:
  - `great-builder/analyzer`: Performs targeted scans of relevant files.
  - `great-builder/implementation`: Automatically edits codebase and applies changes.
  - `great-builder/review`: Audits changes for correctness and issues.

### 3. Research Pipelines (`agents/research/`)
A set of stage-based research pipelines that progressively discover, deep-dive, validate, and synthesize reports on complex topics.
- **Primary Pipelines**:
  - `research/fast`: 3-stage pipeline (Scout &rarr; Deep &rarr; Synthesis).
  - `research/normal`: 4-stage pipeline (Scout x2 &rarr; Parallel Deep &rarr; Validation &rarr; Synthesis).
  - `research/high`: 8-stage pipeline (Scout x3 &rarr; Merge &rarr; Parallel Research &rarr; Validation &rarr; Gap Analysis &rarr; Recursive Research &rarr; Re-Validation &rarr; Synthesis).
- **Specialist Subagents (`research/shared/` & specific versions)**:
  - `scout`: Performs initial territory mapping and outputs sub-queries.
  - `deep`: Performs iterative search and source-tier verification.
  - `timeline`: Tracks historical event chronological context.
  - `quant`: Identifies and parses original quantitative research/numbers.
  - `skeptic`: Acts as a red-team searching for counter-evidence.
  - `validation`: Conducts independent cross-checks on findings.

---

## Skills

Located in the `skills/` directory, these folder structures extend the capabilities of the agents through structured instruction sets (`SKILL.md`) and prompts.
- **`brainstorming`**: Step-by-step sequence to brainstorm architecture, evaluate options, and verify specifications.
- **`writing-plans`**: Standard formatting structure to document implementation plans before making changes.
- **`executing-plans`**: Step-by-step process for executing and validating planned code.

---

## Guides (`help/`)

The guides in the `help/` directory are compiled, rewritten, and formatted for AI agent comprehension based on the official OpenCode documentation pages:
- [Agents Guide](help/agents.md) — Source: [OpenCode Agents Documentation](https://opencode.ai/docs/agents/)
- [Custom Tools Guide](help/custom-tools.md) — Source: [OpenCode Custom Tools Documentation](https://opencode.ai/docs/custom-tools/)
- [MCP Servers Guide](help/mcp-servers.md) — Source: [OpenCode MCP Servers Documentation](https://opencode.ai/docs/mcp-servers/)
- [Permissions Guide](help/permissions.md) — Source: [OpenCode Permissions Documentation](https://opencode.ai/docs/permissions/)
- [Policies Guide](help/policies.md) — Source: [OpenCode Policies Documentation](https://opencode.ai/docs/policies/)
- [Rules Guide](help/rules.md) — Source: [OpenCode Rules Documentation](https://opencode.ai/docs/rules/)
- [Tools Guide](help/tools.md) — Source: [OpenCode Tools Documentation](https://opencode.ai/docs/tools/)
