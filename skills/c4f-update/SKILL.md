---
name: c4f-update
description: "Bootstrap, update and post-update verification for the two C4F config repositories (~/.config/opencode from c4f-opencode-config, ~/.agents/skills from c4f-agent-skills). Use this whenever the user asks to install, set up, initialize, bootstrap or configure OpenCode on a machine, to update, refresh, pull, sync or version-check the config repo or the skills repo, to find out whether they are behind, when an update hits a conflict or an 'untracked working tree files would be overwritten' abort, or when they ask why agents, skills or plugins changed after a pull. `install` clones what is missing, fast-forwards what is behind, installs plugin dependencies and seeds opencode.jsonc, so a fresh harness becomes usable in one command. Prefer scripts/c4f_update.py over hand-written git sequences. Not for authoring or fixing agent files — that is oc-agent-config."
---

# c4f-update

Three commands, one script. `install` is idempotent: it is both the first-run bootstrap and the everyday update, so the same command works on an empty machine, a half-installed one and a healthy one.

## Targets

| Repo | Role | Path (Linux/macOS) | Windows | Origin | Branch |
|---|---|---|---|---|---|
| `c4f-opencode-config` | `main` | `~/.config/opencode` | `%USERPROFILE%\.config\opencode` (fallback `%APPDATA%\opencode`) | `https://github.com/MaiTheHao/c4f-opencode-config.git` | `master` |
| `c4f-agent-skills` | `skills` | `~/.agents/skills` | `%USERPROFILE%\.agents\skills` | `https://github.com/MaiTheHao/c4f-agent-skills.git` | `master` |

`--only main|skills` limits `install` to one repo. `--repo PATH` (repeatable, global) targets another clone and skips the expected-origin/branch checks.

## What install does, per repo

| Step | Behaviour |
|---|---|
| Path missing or empty | `git clone` (creates parent dirs) |
| Path is a git repo | `pull --ff-only` when clean and behind, otherwise report and leave the tree untouched |
| Path is not a git repo and not empty | **Refuse.** Nothing is moved, renamed or deleted; print the one manual step |
| Deps | `npm install` when `package.json` exists and `node_modules` is missing (`--no-deps` skips) |
| Config | Create `opencode.jsonc` (`$schema`, `experimental.subagent_depth: 2`) **only when absent**; an existing file is never rewritten (`--no-config` skips) |
| Verify | Validator across `agents/**/*.md`, failures classified by ownership |

Repos are handled independently: a blocked `main` does not stop `skills` from being installed.

## Contract

- **Never** run `git reset --hard`, `git checkout -- .`, `git clean`, a blind `git stash --include-untracked`, or a wholesale `--ours`/`--theirs` conflict resolution in these repos. The script never does; do not add it.
- **Fast-forward only.** Dirty, diverged, untracked-clash and in-progress states are user decisions: `references/manual-update.md`.
- **Never overwrite** an existing `opencode.jsonc`, `cli.json`, `service.json`, `local/`, `node_modules` or the tracked `plugins/model-insights/*.json`. Those are runtime state and credentials, not repo content.
- **Never edit agent, skill or plugin files so validation passes during an install/update.** Upstream content that fails the validator is reported as drift, not repaired. Authoring fixes belong to `oc-agent-config`.

## Workflow

1. **Install** — `python3 ~/.config/opencode/skills/c4f-update/scripts/c4f_update.py install`. Add `--only main` or `--only skills` when the user asks for one repo. On a machine with no clone this must be the first command.
2. **Read the output before reporting.** Each repo prints one block: `clone` / `update` / `state`, then `deps`, `config`, `local`. The verify block follows.
3. **Report and stop.** Do not re-run `status` afterwards: `install` already printed the resulting state.

Use `status` only when the user asks a read-only question ("am I behind?"). Report like this:

```markdown
| Repo | Result | State |
|---|---|---|
| `~/.config/opencode` | cloned → `18d1ef8` | clean, deps installed, `opencode.jsonc` created |
| `~/.agents/skills` | updated `a0cfee8` → `fe110c0` (4 commits) | clean |

verify: 5/11 pass — 6 upstream drift, 0 local. Hint: Subagents/Routing are H2, validator expects H3.
Local-only: `cli.json` / `service.json` are credentials, created by the OpenCode CLI.
```

If the verify block says `layout drift`, the pull carried upstream files that the stale validator rejects: report it as a validator/spec decision, not as update damage. `review needed` means some failures are structural (permissions, body sections, line budget) and some are layout: name both, and let the user decide the upstream fix.

## Verdicts (`status`)

| Verdict | Exit | Meaning and next move |
|---|---|---|
| `up-to-date` | 0 | Nothing to pull, no local work |
| `local-changes` | 0 | Nothing to pull; local edits or untracked files only |
| `ready` | 10 | Clean and behind → `install` |
| `ahead-only` | 11 | Local commits not pushed; ask whether they are intentional |
| `diverged` | 11 | Local commits plus incoming; manual rebase flow |
| `dirty` | 11 | Behind, but modified tracked paths; commit or stash deliberately first |
| `untracked-clash` | 11 | An untracked file also exists upstream; rename it first |
| `wrong-origin`, `wrong-branch`, `no-origin` | 20 | Fix the clone before anything else |
| `in-progress`, `detached-head` | 20 | Finish/abort the merge/rebase, or check out the branch |
| `not-a-repo` | 20 | Path missing or not a git work tree |

Exit codes: `0` done, `10` update available (status only), `11` human decision required (manual flow, deps failed, or validation failures), `20` fatal precondition.

## Verify buckets

`verify` runs `skills/oc-agent-config/scripts/validate_agent.py --json` (requires PyYAML) and classifies each failing file by ownership:

| Bucket | Meaning | Action |
|---|---|---|
| `local` | File differs from `HEAD`: your edit | Fix now, or revert it deliberately |
| `introduced` | File was changed by the install/update just run | Inspect before blaming the update; often new upstream content |
| `upstream` | File identical to `HEAD`, untouched by the pull | Report as upstream drift; never edit it during an install |

A `hint` line (e.g. `Subagents is H2, validator expects H3`) means the validator and the agent files disagree on layout. That is spec/validator lag, not update damage — say so and offer to fix upstream as a separate change.

`install` exits `0` when provisioning succeeded even if verify reports upstream-only drift; standalone `verify` exits `11` on any hard failure, because it is the dedicated gate.

## Flags

| Command | Flags |
|---|---|
| `install` | `--only both\|main\|skills`, `--no-deps`, `--no-config`, `--no-verify` |
| `status` | `--json` (machine-readable), `--no-fetch` (offline) |
| `verify` | `--json` |

`--repo PATH` is global: place it before the command (`… --repo /path/to/clone install`).

## Notes

- The first `install` on a fresh clone runs `npm install`; give the tool call a generous timeout (5-10 minutes) instead of killing it. Re-running `install` resumes nothing already done.
- Missing PyYAML surfaces as a validator error line; install it (`pip install pyyaml`) instead of parsing the validator by hand.
- Windows: run the same `python3 ~/.config/opencode/skills/c4f-update/scripts/c4f_update.py …` commands in PowerShell. There is no separate PowerShell wrapper.
- The script never stages, commits or pushes. Preserving local commits is the manual flow.
