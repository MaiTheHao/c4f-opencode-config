# Manual Update Flow

**Load this when** `status` returns `dirty`, `diverged`, `untracked-clash` or `ahead-only`, or `install` reported a repo blocked. The script stops at the fast-forward boundary on purpose: everything below trades one user decision (keep, commit, stash, rename) for git state that is hard to undo.

Substitute `$REPO` with one target path: `~/.config/opencode` or `~/.agents/skills`.

## 1. Inventory first

```bash
git -C "$REPO" status --porcelain
```

` M` / `MM` / `A` are tracked customizations (the expected source of conflicts). `??` are untracked files, relevant only when they clash with incoming paths. Ignored paths never block an update.

## 2. Preserve local work, exactly one way

**Commit — durable customizations (recommended):**

```bash
git -C "$REPO" add <paths>
git -C "$REPO" commit -m "chore(local): preserve customization before update"
git -C "$REPO" pull --rebase origin master
```

The update is now a divergence: rebase replays the local commit on top of upstream and stops on a real conflict instead of silently merging.

**Stash — disposable or uncertain edits:**

```bash
git -C "$REPO" stash push -m "pre-update $(date +%F)" -- <tracked paths>
git -C "$REPO" pull --ff-only origin master   # use --rebase when local commits also exist
git -C "$REPO" stash pop                      # resolve any overlap, then drop the stash yourself
```

Never `stash --include-untracked` blindly: it sweeps runtime files into a stash the user may never restore. Untracked files needed at runtime stay in place unless step 3 applies.

**Forbidden without explicit per-path approval:** `git reset --hard`, `git checkout -- .`, `git clean -fd`, `git stash drop`. Do not "clean up" a conflicted tree to make the pull pass.

## 3. Untracked clash

The pull aborts with *untracked working tree files would be overwritten by merge*. Rename, never delete:

```bash
mv "$REPO/path/file" "$REPO/path/file.user-$(date +%Y%m%d)"
git -C "$REPO" pull --ff-only origin master
diff "$REPO/path/file.user-<date>" "$REPO/path/file"
```

Merge the user delta back into the incoming file, then ask before removing the `.user` copy. Leave the copy in place if the user is unsure.

## 4. Merge or rebase conflict

1. `git -C "$REPO" status` — list every `both modified` file.
2. Per file: read both sides, keep the user's intent, apply it on top of the incoming upstream version. Never resolve with `--ours`/`--theirs` wholesale, never delete a side without explicit confirmation per file.
3. Continue only with the user aware:

```bash
git -C "$REPO" rebase --continue    # or: git -C "$REPO" rebase --abort
git -C "$REPO" status               # must show no MERGE_HEAD / REBASE_HEAD / cherry-pick state
```

## 5. Verify and report

```bash
python3 ~/.config/opencode/skills/c4f-update/scripts/c4f_update.py verify
```

In manual mode there is no pull range, so `verify` reports `local` vs `upstream` only — `introduced` needs the `install` path. Then report: commits pulled, how each conflict was resolved, remaining dirty/untracked paths, validator result with the bucket breakdown.

## 6. When to stop and ask

- The user has local commits that may be intentional but unpushed (`ahead-only`).
- A conflict resolution changes behavior the user did not mention.
- An untracked file is the only copy of user data.
- Validation fails on files the update did not touch: that is upstream drift. Report it; do not patch upstream during an update.
