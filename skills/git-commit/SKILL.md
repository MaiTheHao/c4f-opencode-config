---
name: git-commit
description: 'Execute git commit with conventional commit message analysis, intelligent staging, and message generation. Use when user asks to commit changes, create a git commit, or mentions "/commit". Supports: (1) Auto-detecting type and scope from changes, (2) Generating conventional commit messages from diff, (3) Interactive commit with optional type/scope/description overrides, (4) Intelligent file staging for logical grouping'
license: MIT
allowed-tools: Bash
---

# Git Commit with Conventional Commits

## Overview

Create standardized, semantic git commits using the Conventional Commits specification. Analyze the actual diff to determine appropriate type, scope, and message.

## Conventional Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Commit Types

| Type       | Purpose                        |
| ---------- | ------------------------------ |
| `feat`     | New feature                    |
| `fix`      | Bug fix                        |
| `docs`     | Documentation only             |
| `style`    | Formatting/style (no logic)    |
| `refactor` | Code refactor (no feature/fix) |
| `perf`     | Performance improvement        |
| `test`     | Add/update tests               |
| `build`    | Build system/dependencies      |
| `ci`       | CI/config changes              |
| `chore`    | Maintenance/misc               |
| `revert`   | Revert commit                  |

## Breaking Changes

```
# Exclamation mark after type/scope
feat!: remove deprecated endpoint

# BREAKING CHANGE footer
feat: allow config to extend other configs

BREAKING CHANGE: `extends` key behavior changed
```

## Workflow

### 1. Check Status & Review Diffs

```bash
# Check status of modified and untracked files
git status

# If files are staged, inspect staged changes
git diff --staged

# If nothing staged, inspect working tree changes
git diff

# View recent commit history
git log --oneline -n 5
```

### 2. Stage Changes

```bash
# Stage specific files
git add path/to/file1 path/to/file2

# Stage current directory recursively
git add .

# Interactive staging (hunk by hunk)
git add -p

# Unstage a file (keep local changes)
git restore --staged path/to/file
```

**Never commit secrets** (`.env`, credentials.json, private keys, API tokens).

### 3. Generate Commit Message

Analyze the diff to determine:

- **Type**: What kind of change is this (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`)?
- **Scope**: What specific module/component is affected (optional)?
- **Description**: Concise summary in present tense, imperative mood, lowercase, under 72 chars, no trailing period.

### 4. Execute Commit

```bash
# Standard commit
git commit -m "<type>[scope]: <description>"

# Amend previous commit (add staged changes without changing message)
git commit --amend --no-edit

# Multi-line commit with body/footer
git commit -m "$(cat <<'EOF'
<type>[scope]: <description>

<optional body>

<optional footer>
EOF
)"
```

## Best Practices

- One logical change per commit
- Present tense: "add" not "added"
- Imperative mood: "fix bug" not "fixes bug"
- Reference issues: `Closes #123`, `Refs #456`
- Keep description under 72 characters

## Git Safety Protocol

- NEVER update git config
- NEVER run destructive commands (--force, hard reset) without explicit request
- NEVER skip hooks (--no-verify) unless user asks
- NEVER force push to main/master
- If commit fails due to hooks, fix and create NEW commit (don't amend)
