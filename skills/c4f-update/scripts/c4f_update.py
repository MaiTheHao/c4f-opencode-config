#!/usr/bin/env python3
"""Version-check, fast-forward update, and post-update verification for the C4F repos.

Three commands:
    status   read-only preflight + divergence + verdict (replaces 4-6 hand-written git calls)
    install  clone what is missing, fast-forward what is behind, install deps, seed config
    verify   run the agent validator and classify failures as local / introduced / upstream

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
EXIT_DRIFT = 12  # validation failures, but every one of them is upstream content

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
MAX_FAILURES_SHOWN = 8


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


def _install_one(target: Target, deps: bool, config: bool,
                 pulled: dict[str, tuple[str, str]]) -> tuple[int, list[str]]:
    lines: list[str] = []
    code = EXIT_OK
    ready, state = _path_state(target)
    if not ready:
        return EXIT_MANUAL, [f"  blocked    {state}"]

    if state in ("missing", "empty"):
        ok, message = _clone(target)
        if not ok:
            return EXIT_MANUAL, [f"  clone      FAILED: {message}"]
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
            pulled[target.name] = (old, new)
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


def cmd_install(targets: list[Target], run_verify: bool, deps: bool, config: bool) -> int:
    pulled: dict[str, tuple[str, str]] = {}
    codes: list[int] = []
    for index, target in enumerate(targets):
        if index:
            print()
        print(f"{target.name}  {target.label}", flush=True)
        code, lines = _install_one(target, deps, config, pulled)
        codes.append(code)
        for line in lines:
            print(line)

    code = EXIT_FATAL if EXIT_FATAL in codes else (EXIT_MANUAL if EXIT_MANUAL in codes else EXIT_OK)
    if run_verify:
        print()
        verify_code, _ = _verify_all(targets, as_json=False, since=pulled)
        if verify_code == EXIT_FATAL:
            code = EXIT_FATAL
        elif verify_code == EXIT_MANUAL and code == EXIT_OK:
            code = EXIT_MANUAL

    states = ["ok" if c == EXIT_OK else ("fatal" if c == EXIT_FATAL else "action") for c in codes]
    summary = ", ".join(f"{t.name}={s}" for t, s in zip(targets, states))
    print(f"\nSUMMARY  {summary}  (exit {code})")
    return code


# --------------------------------------------------------------------------- verify


HEADING_RE = re.compile(r"'(#{2,4})\s+([^']+?)'")
FAILURE_JOIN = "; "


def _local_edit(repo: Path, rel: str) -> bool:
    if git(repo, "ls-files", "--error-unmatch", rel)[0] != 0:
        return True
    return git(repo, "diff", "--quiet", "HEAD", "--", rel)[0] != 0


def _heading_hints(failure: str, body: str) -> list[str]:
    hints = []
    for hashes, name in HEADING_RE.findall(failure):
        name = name.strip()
        match = re.search(rf"^(#{{1,6}})\s+{re.escape(name)}\s*$", body, re.MULTILINE)
        if match and len(match.group(1)) != len(hashes):
            hints.append(f"{name} is H{len(match.group(1))}, validator expects H{len(hashes)}")
    return hints


def _verify_repo(repo: Path, label: str, since: str | None, as_json: bool) -> tuple[int, dict]:
    validator = repo / "skills" / "oc-agent-config" / "scripts" / "validate_agent.py"
    agents = sorted(p for p in (repo / "agents").rglob("*.md")) if (repo / "agents").is_dir() else []
    if not validator.is_file() or not agents:
        return EXIT_OK, {"repo": label, "status": "n/a", "code": EXIT_OK,
                         "reason": "no agents/ or validator in this repo"}

    proc = subprocess.run(
        [sys.executable, str(validator), "--json", *[str(p) for p in agents]],
        capture_output=True, text=True, errors="replace",
    )
    try:
        results = json.loads(proc.stdout)
    except ValueError:
        return EXIT_MANUAL, {"repo": label, "status": "error", "code": EXIT_MANUAL,
                             "reason": (proc.stderr or proc.stdout).strip()[:300]}

    changed: set[str] = set()
    if since:
        _, paths, _ = git(repo, "diff", "--name-only", f"{since}..HEAD")
        changed = {line.strip() for line in paths.splitlines() if line.strip()}

    failures, warnings, hint_counts = [], 0, {}
    buckets = {"local": 0, "introduced": 0, "upstream": 0}
    for item in results:
        rel = Path(item["path"]).resolve().relative_to(repo.resolve()).as_posix()
        warnings += len(item.get("warnings") or [])
        if item.get("ok"):
            continue
        local = _local_edit(repo, rel)
        bucket = "local" if local else ("introduced" if rel in changed else "upstream")
        buckets[bucket] += 1
        body = (repo / rel).read_text(encoding="utf-8", errors="replace")
        hints = {
            hint
            for message in item.get("failures") or []
            for hint in _heading_hints(message, body)
        }
        for hint in hints:
            hint_counts[hint] = hint_counts.get(hint, 0) + 1
        failures.append({
            "file": rel,
            "bucket": bucket,
            "messages": item.get("failures") or [],
            "hints": sorted(hints),
        })

    passed = len(results) - len(failures)
    if not failures:
        code = EXIT_OK
    elif buckets["local"] or buckets["introduced"]:
        code = EXIT_MANUAL
    else:
        code = EXIT_DRIFT
    payload = {
        "repo": label,
        "status": "checked",
        "code": code,
        "passed": passed,
        "total": len(results),
        "warnings": warnings,
        "buckets": buckets,
        "hints": hint_counts,
        "failures": failures,
    }
    if as_json:
        return code, payload

    print(f"verify {label}  ({repo})")
    print(f"  validator  {passed}/{len(results)} pass · {len(failures)} fail "
          f"({buckets['local']} local, {buckets['introduced']} introduced, {buckets['upstream']} upstream) "
          f"· {warnings} warning(s)")
    for hint, count in sorted(hint_counts.items(), key=lambda kv: -kv[1])[:2]:
        print(f"  hint       {count} file(s): {hint}")
    for failure in failures[:MAX_FAILURES_SHOWN]:
        first = FAILURE_JOIN.join(failure["messages"][:2])
        print(f"    {failure['file']:<38} {failure['bucket']:<10} {first[:110]}")
    if len(failures) > MAX_FAILURES_SHOWN:
        print(f"    (+{len(failures) - MAX_FAILURES_SHOWN} more failing files)")
    if not failures:
        print("  result     conformant")
    elif buckets["upstream"] == len(failures):
        print("  result     upstream drift only — not caused by this update; report it, do not edit upstream files")
    elif buckets["local"]:
        print("  result     local edits fail validation — fix or revert them, then re-run verify")
    elif all(f["hints"] for f in failures):
        print("  result     layout drift — the changed files use a different heading level than the validator; "
              "treat it as validator/spec lag, confirm the intended standard before editing")
    else:
        print("  result     review needed — the pull changed these files and they fail validation; "
              "separate layout drift from structural failures and let the user decide the upstream fix")
    return code, payload


def _verify_all(targets: list[Target], as_json: bool,
                since: dict[str, tuple[str, str]] | None = None) -> tuple[int, list[dict]]:
    codes, payloads = [], []
    for target in targets:
        start = (since or {}).get(target.name, (None, None))[0]
        code, payload = _verify_repo(target.path, target.name, start, as_json)
        codes.append(code)
        payloads.append(payload)
        if not as_json and payload.get("status") == "n/a":
            print(f"verify {target.name}  ({target.path})\n  skipped    {payload['reason']}")
        if not as_json and payload.get("status") == "error":
            print(f"verify {target.name}  ({target.path})\n  error      {payload['reason']}")
    if as_json:
        print(json.dumps({"repos": payloads}, indent=2, default=str))
    if EXIT_MANUAL in codes:
        return EXIT_MANUAL, payloads
    if EXIT_DRIFT in codes:
        return EXIT_DRIFT, payloads
    return max(codes, default=EXIT_OK), payloads


def cmd_verify(targets: list[Target], as_json: bool) -> int:
    code, _ = _verify_all(targets, as_json)
    # Standalone verify surfaces drift as a decision point; install treats it as a successful provision.
    return EXIT_MANUAL if code == EXIT_DRIFT else code


# --------------------------------------------------------------------------- cli


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="c4f_update.py",
        description="Bootstrap, update, and verify the C4F config repositories.",
    )
    parser.add_argument("--repo", action="append", metavar="PATH",
                        help="target repo (repeatable); default: both known C4F repos")
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status", help="read-only preflight + verdict")
    status.add_argument("--json", action="store_true")
    status.add_argument("--no-fetch", action="store_true", help="skip git fetch (offline)")

    install = sub.add_parser("install", help="clone what is missing, fast-forward what is behind, "
                                              "install deps, seed config, then verify")
    install.add_argument("--only", choices=["both", "main", "skills"], default="both",
                         help="limit to one of the two known repos (default: both)")
    install.add_argument("--no-deps", action="store_true", help="skip npm install")
    install.add_argument("--no-config", action="store_true", help="do not seed opencode.jsonc")
    install.add_argument("--no-verify", action="store_true", help="skip post-update validation")

    verify = sub.add_parser("verify", help="validate agents and classify failures")
    verify.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    if args.repo and getattr(args, "only", "both") != "both":
        parser.error("--only applies to the two known repos; do not combine it with --repo")

    targets = targets_from_args(args.repo)
    if args.command == "install" and not args.repo:
        targets = [t for t in targets if args.only == "both" or t.role == args.only]

    if args.command == "status":
        return cmd_status(targets, args.json, not args.no_fetch)
    if args.command == "install":
        return cmd_install(targets, not args.no_verify, not args.no_deps, not args.no_config)
    return cmd_verify(targets, args.json)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
