#!/usr/bin/env python3
"""Version-check and fast-forward update for the C4F repos.

Two commands:
    status   read-only preflight + divergence + verdict (replaces 4-6 hand-written git calls)
    install  clone what is missing, fast-forward what is behind, install deps, seed config

The script never stashes, resets, cleans, checks out, or resolves conflicts. Anything
beyond a clean fast-forward is manual on purpose; see references/manual-update.md.

Exit codes: 0 ok, 10 update available, 11 manual action required, 20 fatal.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

EXIT_OK, EXIT_ACTION, EXIT_MANUAL, EXIT_FATAL = 0, 10, 11, 20

VERDICT_EXIT = {
    "up-to-date": EXIT_OK,
    "local-changes": EXIT_OK,
    "ready": EXIT_ACTION,
    "ahead-only": EXIT_MANUAL,
    "diverged": EXIT_MANUAL,
    "dirty": EXIT_MANUAL,
    "untracked-clash": EXIT_MANUAL,
    "detached-head": EXIT_FATAL,
    "wrong-origin": EXIT_FATAL,
    "wrong-branch": EXIT_FATAL,
    "no-origin": EXIT_FATAL,
    "in-progress": EXIT_FATAL,
    "not-a-repo": EXIT_FATAL,
}

FATAL_VERDICTS = {v for v, code in VERDICT_EXIT.items() if code == EXIT_FATAL}
MAX_INCOMING = 8


# --------------------------------------------------------------------------- targets


@dataclass(frozen=True)
class Target:
    name: str
    path: Path
    origin: str | None
    branch: str = ""
    role: str = "custom"

    @property
    def label(self) -> str:
        home = Path.home()
        try:
            rel = self.path.relative_to(home)
            return f"~/{rel}"
        except ValueError:
            return str(self.path)


def default_targets() -> list[Target]:
    home = Path.home()
    main = home / ".config" / "opencode"
    if os.name == "nt" and not (main / ".git").exists():
        appdata = os.environ.get("APPDATA")
        if appdata and (Path(appdata) / "opencode" / ".git").exists():
            main = Path(appdata) / "opencode"
    return [
        Target(
            "c4f-opencode-config",
            main,
            "https://github.com/MaiTheHao/c4f-opencode-config.git",
            "master",
            "main",
        ),
        Target(
            "c4f-agent-skills",
            home / ".agents" / "skills",
            "https://github.com/MaiTheHao/c4f-agent-skills.git",
            "master",
            "skills",
        ),
    ]


def targets_from_args(repos: list[str] | None) -> list[Target]:
    if not repos:
        return default_targets()
    known = {t.path.resolve(): t for t in default_targets()}
    out = []
    for raw in repos:
        path = Path(raw).expanduser().resolve()
        out.append(known.get(path, Target(path.name or str(path), path, None)))
    return out


# --------------------------------------------------------------------------- git


def git(repo: Path, *args: str, timeout: int = 60, strip: bool = True) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            errors="replace",
        )
    except FileNotFoundError:
        sys.stderr.write("fatal: git is not on PATH\n")
        raise SystemExit(EXIT_FATAL)
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s: git {' '.join(args)}"
    out = proc.stdout.strip() if strip else proc.stdout
    return proc.returncode, out, proc.stderr.strip()


def normalize_origin(url: str) -> str:
    url = url.strip().rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    url = re.sub(r"^[a-z+]+://", "", url, flags=re.I)
    url = re.sub(r"^[^@/]+@", "", url)
    url = url.replace(":", "/", 1) if re.match(r"^[^/]+:", url) else url
    return url.lower()


def _parse_porcelain(raw: str) -> tuple[list[str], list[str]]:
    """Split `status --porcelain -z` into (tracked changes, untracked paths)."""
    tracked: list[str] = []
    untracked: list[str] = []
    entries = raw.split("\0")
    index = 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if not entry:
            continue
        code, path = entry[:2], entry[3:]
        if "R" in code or "C" in code:
            index += 1  # the rename/copy source follows as its own record
        if code == "??":
            untracked.append(path)
        elif code != "!!":
            tracked.append(f"{code} {path}")
    return tracked, untracked


@dataclass
class Snapshot:
    target: Target
    is_repo: bool = False
    branch: str = ""
    origin: str = ""
    origin_ok: bool | None = None
    head: str = ""
    head_line: str = ""
    in_progress: list[str] = field(default_factory=list)
    ahead: int = 0
    behind: int = 0
    tracked: list[str] = field(default_factory=list)
    untracked: list[str] = field(default_factory=list)
    clash: list[str] = field(default_factory=list)
    incoming: list[str] = field(default_factory=list)
    fetch_error: str = ""
    verdict: str = ""


def collect(target: Target, do_fetch: bool = True) -> Snapshot:
    snap = Snapshot(target=target)
    repo = target.path
    if not repo.is_dir():
        snap.verdict = "not-a-repo"
        return snap
    if git(repo, "rev-parse", "--is-inside-work-tree")[1] != "true":
        snap.verdict = "not-a-repo"
        return snap
    snap.is_repo = True

    snap.branch = target.branch or git(repo, "rev-parse", "--abbrev-ref", "HEAD")[1]
    code, out, _ = git(repo, "remote", "get-url", "origin")
    snap.origin = out if code == 0 else ""
    if target.origin is None:
        snap.origin_ok = None
    elif not snap.origin:
        snap.origin_ok = False
    else:
        snap.origin_ok = normalize_origin(snap.origin) == normalize_origin(target.origin)

    code, out, _ = git(repo, "log", "-1", "--format=%h|%cs|%s")
    if code == 0 and out:
        short, date, subject = (out.split("|", 2) + ["", ""])[:3]
        snap.head, snap.head_line = short, f"{short}  {date}  {subject}"
    else:
        snap.head = git(repo, "rev-parse", "--short", "HEAD")[1]

    for marker in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"):
        _, path, _ = git(repo, "rev-parse", "--git-path", marker)
        if path and Path(repo, path).exists():
            snap.in_progress.append(marker)

    if do_fetch and snap.origin:
        code, _, err = git(repo, "fetch", "origin", timeout=120)
        if code != 0:
            snap.fetch_error = err.splitlines()[0] if err else f"git fetch exited {code}"

    remote_ref = f"origin/{snap.branch}"
    if git(repo, "rev-parse", "--verify", "--quiet", remote_ref)[0] == 0:
        _, counts, _ = git(repo, "rev-list", "--left-right", "--count", f"{snap.branch}...{remote_ref}")
        parts = counts.replace("\t", " ").split()
        if len(parts) == 2 and all(p.isdigit() for p in parts):
            snap.ahead, snap.behind = int(parts[0]), int(parts[1])
        if snap.behind:
            _, log, _ = git(repo, "log", "--oneline", "--no-decorate", f"{snap.branch}..{remote_ref}")
            snap.incoming = [line[:100] for line in log.splitlines() if line.strip()]

    _, porcelain, _ = git(repo, "status", "--porcelain", "-z", strip=False)
    snap.tracked, snap.untracked = _parse_porcelain(porcelain)

    if snap.behind and snap.untracked:
        _, tree, _ = git(repo, "ls-tree", "-r", "--name-only", remote_ref)
        upstream_paths = set(tree.splitlines())
        for path in snap.untracked:
            if path.endswith("/"):
                if any(p.startswith(path) for p in upstream_paths):
                    snap.clash.append(path)
            elif path in upstream_paths:
                snap.clash.append(path)

    snap.verdict = _verdict(snap)
    return snap


def _verdict(snap: Snapshot) -> str:
    if not snap.is_repo:
        return "not-a-repo"
    if snap.branch == "HEAD":
        return "detached-head"
    if snap.in_progress:
        return "in-progress"
    if not snap.origin:
        return "no-origin"
    if snap.origin_ok is False:
        return "wrong-origin"
    if snap.target.branch and snap.branch != snap.target.branch:
        return "wrong-branch"
    if snap.ahead and snap.behind:
        return "diverged"
    if snap.ahead:
        return "ahead-only"
    if not snap.behind:
        # Nothing to pull, so local work cannot be harmed by an update.
        return "local-changes" if (snap.tracked or snap.untracked) else "up-to-date"
    if snap.tracked:
        return "dirty"
    if snap.clash:
        return "untracked-clash"
    return "ready"


# --------------------------------------------------------------------------- rendering


def _print_snapshot(snap: Snapshot, verbose: bool) -> None:
    header = f"{snap.target.name}  {snap.target.label}"
    if snap.verdict == "not-a-repo":
        print(f"{header}\n  verdict   not-a-repo — {ADVICE['not-a-repo']}")
        return
    if not verbose:
        bits = [snap.branch or "?", snap.head or "-", f"{snap.ahead}/{snap.behind}", _tree_word(snap), snap.verdict]
        print(f"{header}\n  {' · '.join(bits)}")
        return
    print(header)
    origin = snap.origin or "(none)"
    ok = "" if snap.origin_ok is None else ("  ok" if snap.origin_ok else "  EXPECTED " + (snap.target.origin or ""))
    print(f"  origin    {origin}{ok}")
    print(f"  branch    {snap.branch}   head  {snap.head_line}")
    print(f"  delta     {snap.ahead} ahead / {snap.behind} behind   tree {_tree_word(snap)}")
    if snap.in_progress:
        print(f"  state     in progress: {', '.join(snap.in_progress)}")
    if snap.fetch_error:
        print(f"  fetch     failed: {snap.fetch_error}")
    if snap.verdict != "up-to-date" and snap.tracked:
        for line in snap.tracked[:6]:
            print(f"  dirty     {line}")
        if len(snap.tracked) > 6:
            print(f"  dirty     (+{len(snap.tracked) - 6} more)")
    if snap.clash:
        for path in snap.clash[:6]:
            print(f"  clash     untracked path is also upstream: {path}")
    if snap.incoming:
        print(f"  incoming  {len(snap.incoming)} commit(s):")
        for line in snap.incoming[:MAX_INCOMING]:
            print(f"    {line}")
        if len(snap.incoming) > MAX_INCOMING:
            print(f"    (+{len(snap.incoming) - MAX_INCOMING} more)")
    print(f"  verdict   {snap.verdict} — {ADVICE.get(snap.verdict, '')}")


def _tree_word(snap: Snapshot) -> str:
    parts = []
    if snap.tracked:
        parts.append(f"{len(snap.tracked)} modified")
    if snap.untracked:
        parts.append(f"{len(snap.untracked)} untracked")
    return ", ".join(parts) if parts else "clean"


ADVICE = {
    "up-to-date": "nothing to do",
    "local-changes": "nothing to pull; local changes only",
    "ready": "clean fast-forward possible -> run install",
    "ahead-only": "local commits not pushed; ask whether they are intentional",
    "diverged": "manual: preserve local work, then rebase (references/manual-update.md)",
    "dirty": "manual: commit or stash tracked edits first (references/manual-update.md)",
    "untracked-clash": "manual: rename clashing untracked file(s) before pulling",
    "wrong-origin": "point the clone at the expected origin before anything else",
    "wrong-branch": "checkout the expected branch",
    "no-origin": "no origin remote configured",
    "in-progress": "finish or abort the pending merge/rebase/cherry-pick first",
    "detached-head": "checkout the branch before updating",
    "not-a-repo": "path missing or not a git work tree",
}


def _summary(snaps: list[Snapshot]) -> int:
    counts: dict[str, int] = {}
    for snap in snaps:
        counts[snap.verdict] = counts.get(snap.verdict, 0) + 1
    parts = [f"{n} {verdict}" for verdict, n in counts.items()]
    code = max((VERDICT_EXIT.get(s.verdict, EXIT_MANUAL) for s in snaps), default=EXIT_FATAL)
    next_step = {
        EXIT_OK: "nothing to do",
        EXIT_ACTION: "next: c4f_update.py install",
        EXIT_MANUAL: "next: manual flow (references/manual-update.md)",
        EXIT_FATAL: "next: fix the precondition first",
    }[code]
    print(f"\nSUMMARY  {len(snaps)} repo(s): {', '.join(parts)} -> {next_step}  (exit {code})")
    return code


# --------------------------------------------------------------------------- commands


def cmd_status(targets: list[Target], as_json: bool, do_fetch: bool) -> int:
    snaps = [collect(t, do_fetch) for t in targets]
    if as_json:
        print(json.dumps({"targets": [snap.__dict__ | {"target": snap.target.name, "path": str(snap.target.path),
                                                        "label": snap.target.label} for snap in snaps]}, indent=2,
                         default=str))
        return max((VERDICT_EXIT.get(s.verdict, EXIT_MANUAL) for s in snaps), default=EXIT_FATAL)
    for index, snap in enumerate(snaps):
        if index:
            print()
        _print_snapshot(snap, verbose=snap.verdict not in ("up-to-date", "local-changes"))
    return _summary(snaps)


CONFIG_TEMPLATE = """{
  "$schema": "https://opencode.ai/config.json",
  // Nested dispatch: a primary may dispatch a subagent that dispatches again.
  "experimental": { "subagent_depth": 2 }
}
"""


def _path_state(target: Target) -> tuple[bool, str]:
    """(can_proceed, state). Never moves, renames or deletes anything."""
    path = target.path
    if path.exists() and not path.is_dir():
        return False, "path exists and is not a directory"
    if not path.exists():
        return True, "missing"
    if not any(path.iterdir()):
        return True, "empty"
    if git(path, "rev-parse", "--is-inside-work-tree")[1] == "true":
        return True, "repo"
    return False, ("directory is not a git repo and is not empty — move it aside yourself, "
                   "then re-run install")


def _clone(target: Target) -> tuple[bool, str]:
    if target.origin is None:
        return False, "no origin configured for this target"
    target.path.parent.mkdir(parents=True, exist_ok=True)
    command = ["git", "clone", "--quiet"]
    if target.branch:
        command += ["--branch", target.branch]
    command += [target.origin, str(target.path)]
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=300, errors="replace")
    except subprocess.TimeoutExpired:
        return False, "git clone timed out"
    if proc.returncode != 0:
        lines = (proc.stderr or proc.stdout).strip().splitlines()
        return False, lines[0] if lines else f"git clone exited {proc.returncode}"
    return True, "cloned"


def _ensure_deps(repo: Path, enabled: bool) -> tuple[str, int]:
    if not (repo / "package.json").is_file():
        return "n/a", EXIT_OK
    if (repo / "node_modules").is_dir():
        return "present (node_modules)", EXIT_OK
    if not enabled:
        return "skipped (--no-deps; run npm install when plugins are needed)", EXIT_OK
    npm = shutil.which("npm")
    if not npm:
        return "missing npm — install Node.js, then: npm --prefix " + str(repo) + " install", EXIT_MANUAL
    print("  deps       npm install (first run can take minutes)", flush=True)
    try:
        proc = subprocess.run(
            [npm, "install", "--no-audit", "--no-fund"],
            cwd=repo, capture_output=True, text=True, timeout=600, errors="replace",
        )
    except subprocess.TimeoutExpired:
        return "npm install timed out — re-run install to resume", EXIT_MANUAL
    if proc.returncode != 0:
        lines = (proc.stderr or proc.stdout).strip().splitlines()
        return "npm install failed: " + (lines[-1][:120] if lines else f"exit {proc.returncode}"), EXIT_MANUAL
    return "installed (npm install)", EXIT_OK


def _ensure_config(repo: Path, enabled: bool) -> tuple[str, int]:
    path = repo / "opencode.jsonc"
    if path.exists():
        return "kept opencode.jsonc (exists)", EXIT_OK
    if not enabled:
        return "skipped (--no-config)", EXIT_OK
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(CONFIG_TEMPLATE)
    except FileExistsError:
        return "kept opencode.jsonc (exists)", EXIT_OK
    except OSError as exc:
        return f"could not write opencode.jsonc: {exc}", EXIT_MANUAL
    return "created opencode.jsonc (subagent_depth 2)", EXIT_OK


STATE_VERSION = 1


def update_state_file() -> Path:
    """Advisory cache the c4f-plugin update check reads. Mirrors its default location."""
    base = os.environ.get("XDG_CACHE_HOME")
    if not base and os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
    root = Path(base).expanduser() if base else Path.home() / ".cache"
    return root / "opencode" / "c4f-update-state.json"


def forget_update_cache(targets: list[Target]) -> str | None:
    """Drop the advisory entries of the repos this run changed.

    The plugin caches ahead/behind counts for 30 minutes, so without this a repo
    that was just updated is still announced as behind on the next start. Repos
    this run did not touch keep their entries. Best-effort: an unreadable or
    foreign cache file is already ignored by the plugin, so it is left alone and
    never fails an install. Returns a line to print only when the file changed
    (or could not be rewritten).
    """
    file = update_state_file()
    try:
        data = json.loads(file.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("version") != STATE_VERSION or not isinstance(data.get("repos"), list):
        return None

    names = {target.name for target in targets}
    dropped: set[str] = set()
    kept = []
    for repo in data["repos"]:
        name = repo.get("name") if isinstance(repo, dict) else None
        if isinstance(name, str) and name in names:
            dropped.add(name)
            continue
        kept.append(repo)
    if not dropped:
        return None

    data["repos"] = kept
    temp = file.with_name(f"{file.name}.{os.getpid()}.tmp")
    try:
        file.parent.mkdir(parents=True, exist_ok=True)
        temp.write_text(json.dumps(data, indent=2), "utf-8")
        os.replace(temp, file)
    except OSError:
        temp.unlink(missing_ok=True)
        return "skipped — state file not writable, the cached counts are stale"
    return f"dropped {', '.join(sorted(dropped))} — next OpenCode start re-probes"


def _install_one(target: Target, deps: bool, config: bool,
                 changed_repos: set[str]) -> tuple[int, list[str]]:
    lines: list[str] = []
    code = EXIT_OK
    ready, state = _path_state(target)
    if not ready:
        return EXIT_MANUAL, [f"  blocked    {state}"]

    if state in ("missing", "empty"):
        ok, message = _clone(target)
        if not ok:
            return EXIT_MANUAL, [f"  clone      FAILED: {message}"]
        changed_repos.add(target.name)
        lines.append(f"  clone      ok -> {git(target.path, 'rev-parse', '--short', 'HEAD')[1]}")

    snap = collect(target, do_fetch=True)
    branch = target.branch or snap.branch
    if snap.verdict in FATAL_VERDICTS:
        code = EXIT_FATAL
        lines.append(f"  state      {snap.verdict} — {ADVICE.get(snap.verdict, '')}")
    elif snap.verdict == "ready":
        old = snap.head
        rc, out, err = git(target.path, "pull", "--ff-only", "origin", branch, timeout=180)
        if rc != 0:
            code = EXIT_MANUAL
            lines.append(f"  update     FAILED: {err or out}")
        else:
            new = git(target.path, "rev-parse", "--short", "HEAD")[1]
            _, commits, _ = git(target.path, "rev-list", "--count", f"{old}..{new}")
            _, files, _ = git(target.path, "diff", "--name-only", f"{old}..{new}")
            changed = [line for line in files.splitlines() if line.strip()]
            changed_repos.add(target.name)
            lines.append(f"  update     {old} -> {new}  ({commits or '0'} commit(s), {len(changed)} file(s))")
            lines.extend(f"    {path}" for path in changed[:8])
            if len(changed) > 8:
                lines.append(f"    (+{len(changed) - 8} more)")
    elif snap.verdict in ("up-to-date", "local-changes"):
        lines.append(f"  state      {snap.verdict} at {snap.head}")
    else:
        code = EXIT_MANUAL
        lines.append(f"  state      {snap.verdict} — {ADVICE.get(snap.verdict, '')}")

    if not snap.is_repo or code == EXIT_FATAL:
        return code, lines

    dep_state, dep_code = _ensure_deps(target.path, deps)
    lines.append(f"  deps       {dep_state}")
    code = max(code, dep_code)
    if target.role == "main":
        cfg_state, cfg_code = _ensure_config(target.path, config)
        lines.append(f"  config     {cfg_state}")
        code = max(code, cfg_code)
        missing = [n for n in ("cli.json", "service.json") if not (target.path / n).exists()]
        if missing:
            lines.append(f"  local      {', '.join(missing)} absent — credentials, created by the OpenCode CLI, never from git")
    return code, lines


def cmd_install(targets: list[Target], deps: bool, config: bool) -> int:
    changed_repos: set[str] = set()
    codes: list[int] = []
    for index, target in enumerate(targets):
        if index:
            print()
        print(f"{target.name}  {target.label}", flush=True)
        code, lines = _install_one(target, deps, config, changed_repos)
        codes.append(code)
        for line in lines:
            print(line)

    cache_line = forget_update_cache([t for t in targets if t.name in changed_repos]) if changed_repos else None
    if cache_line:
        print()
        print(f"cache      {cache_line}")

    code = EXIT_FATAL if EXIT_FATAL in codes else (EXIT_MANUAL if EXIT_MANUAL in codes else EXIT_OK)

    states = ["ok" if c == EXIT_OK else ("fatal" if c == EXIT_FATAL else "action") for c in codes]
    summary = ", ".join(f"{t.name}={s}" for t, s in zip(targets, states))
    print(f"\nSUMMARY  {summary}  (exit {code})")
    return code


# --------------------------------------------------------------------------- cli


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="c4f_update.py",
        description="Bootstrap and update the C4F config repositories.",
    )
    parser.add_argument("--repo", action="append", metavar="PATH",
                        help="target repo (repeatable); default: both known C4F repos")
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status", help="read-only preflight + verdict")
    status.add_argument("--json", action="store_true")
    status.add_argument("--no-fetch", action="store_true", help="skip git fetch (offline)")

    install = sub.add_parser("install", help="clone what is missing, fast-forward what is behind, "
                                              "install deps, seed config")
    install.add_argument("--only", choices=["both", "main", "skills"], default="both",
                         help="limit to one of the two known repos (default: both)")
    install.add_argument("--no-deps", action="store_true", help="skip npm install")
    install.add_argument("--no-config", action="store_true", help="do not seed opencode.jsonc")

    args = parser.parse_args(argv)
    if args.repo and getattr(args, "only", "both") != "both":
        parser.error("--only applies to the two known repos; do not combine it with --repo")

    targets = targets_from_args(args.repo)
    if args.command == "install" and not args.repo:
        targets = [t for t in targets if args.only == "both" or t.role == args.only]

    if args.command == "status":
        return cmd_status(targets, args.json, not args.no_fetch)
    return cmd_install(targets, not args.no_deps, not args.no_config)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
