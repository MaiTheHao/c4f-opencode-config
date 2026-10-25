# Updating the C4F Config Repositories

**Load this when** the user asks to check the version, update, or resolve update conflicts in either C4F repository. Git commands are the primary contract; the inline scripts at the bottom are convenience wrappers for Linux/macOS and Windows. Based on `README.md` at the main repo root — where this reference and README disagree, README wins for user docs and the discrepancy is recorded below.

## Targets

| Repo | Default install path | Origin | Branch |
|---|---|---|---|
| `c4f-opencode-config` (main) | Linux/macOS: `~/.config/opencode` · Windows: `%USERPROFILE%\.config\opencode` (fallback `%APPDATA%\opencode`) | `https://github.com/MaiTheHao/c4f-opencode-config.git` | `master` |
| `c4f-agent-skills` (skills) | Linux/macOS: `~/.agents/skills` · Windows: `%USERPROFILE%\.agents\skills` | `https://github.com/MaiTheHao/c4f-agent-skills.git` | `master` |

Substitute `$REPO` below with one target path. Run `git -C "$REPO" remote get-url origin` once to confirm the clone actually points at the expected origin before trusting any update result.

## Protected and local-only areas

Never let an update pipeline touch these, and never proactively move them:

| Area | Status | Why it is protected |
|---|---|---|
| `cli.json`, `service.json`, `local/`, `node_modules`, `bun.lock`, `__pycache__/` | Gitignored (main repo) | Runtime config and credentials; not pushed, not updated, not backed up |
| `opencode.jsonc` | NOT gitignored; untracked until committed | Main OpenCode config. `.gitignore` no longer excludes it, so it shows in `git status` and `git clean -fd` erases it — that flag skips ignored paths but removes untracked ones. Ignoring it was the only protection it had. Commit it to protect it, and never rewrite it as part of an update |
| `scripts/allowed_models.json` + `scripts/show_models.py` | Untracked in the main repo | The `AGENTS.md` C4F model-identity policy reads the allowlist from here; untracked files can be silently lost if anyone runs `git clean` |
| Any ` M` (modified tracked) path | Tracked | User customizations of repo content; expected source of update conflicts by design |

Hard rule: NEVER run `git checkout -- .`, `git reset --hard`, or `git clean` on either repo without the user explicitly approving every erased path. Do not edit `allowed_models.json` as part of an update.

## Step 0 — Preconditions

```bash
git -C "$REPO" rev-parse --is-inside-work-tree   # must print true
git -C "$REPO" branch --show-current              # must print master for both repos
```

On Windows, run the same commands verbatim in PowerShell; they are identical.

## Step 1 — Check version (behind / ahead)

```bash
git -C "$REPO" fetch origin
git -C "$REPO" status -sb
git -C "$REPO" rev-list --left-right --count master...origin/master
git -C "$REPO" log -1 --format='%h %cs %s'
```

`rev-list --left-right --count` prints `A<TAB>B`: `A` = commits only in local `master` (ahead, user commits), `B` = commits only on `origin/master` (behind).

| Result | Meaning | Action |
|---|---|---|
| `0  0` | Up to date | Nothing to do |
| `0  B`, `B > 0` | Clean case: behind by B, no local commits | Go to Step 2 |
| `A  0`, `A > 0` | Ahead only: local work not yet pushed | Ask the user whether those commits are intentional before update |
| `A  B`, both `> 0` | Diverged: update will rebase or merge | Go to Step 3 |
| Dirty or untracked paths in `status -sb` | Local customizations present | Still supportable — go to Step 3 |

Report the origin URL, branch, behind/ahead counts, and latest HEAD hash to the user before changing anything.

## Step 2 — Update a compatible tree

If `master...origin/master` is fast-forwardable and the tree is clean (only gitignored paths differ; an uncommitted `opencode.jsonc` makes the tree dirty, so commit or stash it first):

```bash
git -C "$REPO" pull --ff-only origin master
```

`--ff-only` is mandatory on the first attempt: it refuses instead of creating surprise merge commits in a config repo.

## Step 3 — Update with local customizations

Typical cause: the user edited agent files, skills, or added untracked scripts. Classify first, then update.

1. Inventory: `git -C "$REPO" status --porcelain` — ` M`/`MM`/`?` paths are user deltas; gitignored paths are irrelevant to the update.
2. Preserve user work, exactly one of:
   - **Commit (recommended for durable customizations):** `git add <paths> && git commit -m "chore(local): preserve customization before update"` — then the update becomes a divergence handled by rebase: `git -C "$REPO" pull --rebase origin master` (never `--autostash` when untracked files such as `scripts/` must stay in place — autostash leaves untracked files alone, so this is safe, but confirm the stash contents with the user before relying on it).
   - **Stash (for disposable or uncertain edits):** `git -C "$REPO" stash push -m "pre-update <YYYY-MM-DD>" -- <tracked paths only>`; NEVER stash `--include-untracked` blindly — that would sweep `scripts/allowed_models.json` into a stash the user may never restore.
   Untracked files needed at runtime glued to absolute paths: leave them in place; only Step 4's untracked-clash case may move them.
3. Re-run `pull --ff-only` or `pull --rebase` and report: commits applied, divergence strategy used, remaining dirty paths.

## Step 4 — Handle update conflicts

Two distinct failure modes; tell them apart before touching anything.

**Untracked clash** — pull aborts with "untracked working tree files would be overwritten by merge":
```bash
mv "$REPO/path/file" "$REPO/path/file.user-$(date +%Y%m%d)"   # rename, do not delete
git -C "$REPO" pull --ff-only origin master
diff "$REPO/path/file.user-<date>" "$REPO/path/file"           # merge the user delta back, then ask the user to confirm removal of the .user copy
```

**Merge/rebase conflict** (stash pop, rebase, or downstream merge):
1. `git -C "$REPO" status` — list every `both modified` file.
2. For each file, `git diff` the region: read both sides, keep the user's intent, apply it on top of the incoming upstream version. NEVER resolve with `--ours`/`--theirs` wholesale or delete either side without explicit user confirmation per file.
3. After resolution: re-commit/stash-pop leftovers, `git rebase --continue` or `git rebase --abort` only with user knowledge, and verify no `MERGE_HEAD` / `REBASE_HEAD` state is left behind (`git -C "$REPO" status` clean of in-progress markers).

## Step 5 — Post-update validation

```bash
python3 "$REPO/skills/oc-agent-config/scripts/validate_agent.py" \
  "$REPO"/agents/great-builder/*.md "$REPO"/agents/great-builder/sub/*.md \
  "$REPO"/agents/research/*.md "$REPO"/agents/research/shared/*.md
```

- Validator must exit `0`; warnings are review items, not blockers.
- Re-check the model-identity policy after any `scripts/` or `AGENTS.md` change: `python3 ~/.config/opencode/scripts/show_models.py --check <model-id>` must return `AUTHORIZED` or `FREE` (exit 0).
- **Known README drift:** `README.md` instructs `npm install`, but `package.json` was removed (commit `27cfa22`). Only run `npm install` when `package.json` exists at the repo root; otherwise note the drift to the user instead of reinstalling dependencies.
- Final report to the user: commits pulled, conflicts (if any) and how each was resolved, remaining dirty/untracked paths, and validator result.

## Inline scripts (cross-platform wrappers)

Mode `check` = Step 1 only; mode `update` = Step 1 + Step 2, and refuses to run an update when local customizations are present (fall back to Step 3-5 manually). No wrapper script ever stashes, resets, or deletes anything.

#### Linux / macOS (bash)

```bash
#!/usr/bin/env bash
# c4f-update.sh [check|update] [repo-path]  (default repo: ~/.config/opencode)
set -euo pipefail
REPO="${2:-$HOME/.config/opencode}"
[[ -d "$REPO/.git" ]] || { echo "not a git repo: $REPO"; exit 1; }
git -C "$REPO" fetch origin
git -C "$REPO" status -sb
read -r AHEAD BEHIND <<< "$(git -C "$REPO" rev-list --left-right --count master...origin/master | tr '\t' ' ')"
echo "ahead=$AHEAD behind=$BEHIND"
[[ "$1" == "check" ]] && exit 0
DIRTY=$(git -C "$REPO" status --porcelain | grep -v -e '^$' || true)
if [[ -n "$DIRTY" ]]; then
  echo "local customizations present — manual flow (reference Steps 3-5):"; echo "$DIRTY"; exit 2
fi
git -C "$REPO" pull --ff-only origin master
```

Run: `bash c4f-update.sh update ~/.config/opencode` (or `~/.agents/skills`).

#### Windows (PowerShell)

```powershell
# c4f-update.ps1 [-Mode check|update] [-Repo path]  (default repo: $HOME\.config\opencode)
param([ValidateSet('check','update')] [string]$Mode='check', [string]$Repo="$HOME\.config\opencode")
if (-not (Test-Path "$Repo\.git")) { Write-Error "not a git repo: $Repo"; exit 1 }
git -C $Repo fetch origin
git -C $Repo status -sb
$counts = (git -C $Repo rev-list --left-right --count master...origin/master) -split "`t"
Write-Output "ahead=$($counts[0]) behind=$($counts[1])"
if ($Mode -eq 'check') { exit 0 }
$dirty = git -C $Repo status --porcelain
if ($dirty) {
  Write-Output "local customizations present — manual flow (reference Steps 3-5):"
  $dirty
  exit 2
}
git -C $Repo pull --ff-only origin master
```

Run: `powershell -ExecutionPolicy Bypass -File c4f-update.ps1 -Mode update -Repo "$HOME\.config\opencode"` (or `"$HOME\.agents\skills"`).

Both wrappers stop on the first failing git step and print the conflicting state; they never resolve or discard anything on their own.
