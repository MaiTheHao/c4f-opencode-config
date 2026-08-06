---
name: git-commit
description: Execute git commit with conventional commit message analysis, intelligent staging, and message generation. Use when user asks to commit changes, create a git commit, or mentions "/commit". Supports auto-detecting type/scope, generating commit messages from diff, interactive staging, and secret validation.
license: MIT
allowed-tools: Bash
---

# Mission

Generate semantic, standardized conventional git commits via automated diff analysis and secure staging.

---

# Priority Rules

## P0 Mandatory Safety Constraints

- **Secrets Guard:** NEVER commit secrets (`.env`, `*.pem`, `credentials.json`, API tokens, private keys).
- **Destructive Commands:** NEVER execute destructive commands (`--force`, `git reset --hard`) unless user explicitly requests.
- **Config & Hooks:** NEVER alter `git config`. NEVER skip pre-commit hooks (`--no-verify`) unless explicitly asked.
- **Protected Branches:** NEVER force-push to `main` / `master`.
- **Hook Failure Handling:** IF commit fails due to pre-commit hooks, fix issues and create a NEW commit. Do NOT amend.

## P1 Preferred Formatting Constraints

- **Format:** `<type>[optional scope]: <description>` (Header <72 chars, present tense, imperative mood, lowercase, no trailing period).
- **Breaking Changes:** Append `!` to type/scope (e.g. `feat!: ...`) OR include `BREAKING CHANGE: <details>` in footer.
- **Atomicity:** One logical change per commit.

---

# Commit Type Matrix

| Type | Semantics |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting / whitespace (no logic change) |
| `refactor` | Code refactor (no feature or fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI configuration / script changes |
| `chore` | Maintenance / minor tasks |
| `revert` | Reverting previous commit |

---

# Execution Workflow

```
1. Inspect Status → Run `git status`, `git diff --staged` (or `git diff`), `git log --oneline -n 5`.
2. Audit Secrets → Scan staged & modified files for credentials / keys / tokens.
3. Stage Changes → Run `git add <files>` or `git add .` (selective / logical grouping).
4. Analyze Diff   → Determine Type, Scope, Description, Breaking Changes, and Issue refs (`Closes #123`).
5. Execute Commit → Run `git commit -m "<message>"` or multiline `git commit -m "$(cat <<'EOF' ... EOF)"`.
```

---

# Decision Rules

- **IF** new capability added → **THEN** type = `feat`
- **IF** bug corrected → **THEN** type = `fix`
- **IF** breaking API change introduced → **THEN** append `!` to type/scope (`feat!:`) or add `BREAKING CHANGE:` footer
- **IF** commit fails on hook error → **THEN** fix root cause and execute fresh `git commit` (Do NOT `--amend`)
- **IF** staged file matches `.env` or credential patterns → **THEN** abort commit and alert user

---

# Forbidden Patterns

- ✗ `git commit --no-verify` (unless requested)
- ✗ `git push --force` or `git reset --hard` (unless requested)
- ✗ Past tense commit messages (`fixed bug`, `added feature`)
- ✗ Capitalized subject lines or trailing periods (`Fix bug.`)
- ✗ Committing `.env` or secret key files
