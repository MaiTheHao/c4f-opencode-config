#!/usr/bin/env python3
"""Repository retrieval + persistent context tools (portable, stdlib only).

Works on ANY repository/workspace. Nothing is tied to this script's location.

Resolution rules
  repo_root     : explicit arg > env RETRIEVAL_REPO_ROOT > git toplevel of CWD > CWD
  context_root  : explicit arg > env RETRIEVAL_CONTEXT_ROOT > /local/agents/retrival_agent

Use as a library (inside a `py` tool):
    import runpy
    T = runpy.run_path("<SKILL_DIR>/scripts/retrieval_tools.py")
    print(T["call_tool"]("search_text", query="handleWebhook"))

Use as a CLI:
    python3 retrieval_tools.py list
    python3 retrieval_tools.py search_text '{"query": "handleWebhook"}'
    echo '{"record": {...}}' | python3 retrieval_tools.py context_upsert -

Every call returns a JSON-serializable dict. Failures return {"error": "..."}.
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

DEFAULT_CONTEXT_ROOT = "/local/agents/retrival_agent"
CONTEXT_FILE = "context.jsonl"
TTL_SECONDS = 24 * 3600  # freshness window for NON-git repos

DEFAULT_EXCLUDES = {
    ".git", ".hg", ".svn", "node_modules", "dist", "build", ".next",
    ".venv", "venv", "__pycache__", ".pytest_cache", "coverage",
    "target", ".idea", ".gradle",
}


# --------------------------------------------------------------------------
# Resolution helpers
# --------------------------------------------------------------------------

def resolve_repo_root(repo_root: str | Path | None = None) -> Path:
    """Explicit arg > env > git toplevel of CWD > CWD."""
    raw = repo_root or os.environ.get("RETRIEVAL_REPO_ROOT")
    if raw:
        root = Path(raw).expanduser().resolve()
        if not root.is_dir():
            raise ValueError(f"repo_root is not a directory: {raw}")
        return root
    cwd = Path.cwd().resolve()
    try:
        out = subprocess.run(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        if out:
            return Path(out).resolve()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return cwd


def resolve_context_root(context_root: str | Path | None = None) -> Path:
    """Explicit arg > env > default. Independent of script location."""
    raw = context_root or os.environ.get("RETRIEVAL_CONTEXT_ROOT") or DEFAULT_CONTEXT_ROOT
    return Path(raw).expanduser().resolve()


def _safe_repo_path(root: Path, relpath: str | Path) -> Path:
    """Accept relative or absolute paths; must stay inside root."""
    p = Path(relpath).expanduser()
    candidate = (p if p.is_absolute() else root / p).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Path escapes repository root {root}: {relpath}") from exc
    return candidate


def _rel(root: Path, p: Path) -> str:
    return p.relative_to(root).as_posix()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _jsonable(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return value


# --------------------------------------------------------------------------
# File enumeration + glob matching
# --------------------------------------------------------------------------

def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Glob with ** support. `src/**/*.py` matches `src/a.py` and `src/x/y.py`."""
    i, out = 0, ""
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif c == "*":
            out += "[^/]*"
            i += 1
        elif c == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(c)
            i += 1
    return re.compile(out + r"\Z")


def _matches_glob(rel: str, patterns: list[str] | None) -> bool:
    if not patterns:
        return True
    name = rel.rsplit("/", 1)[-1]
    for pat in patterns:
        rx = _glob_to_regex(pat)
        if rx.match(rel) or ("/" not in pat and rx.match(name)):
            return True
    return False


def _iter_repo_files(root: Path, include_hidden: bool = False) -> Iterator[Path]:
    """Git-aware enumeration (respects .gitignore); falls back to os.walk."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-co", "--exclude-standard"],
            capture_output=True, text=True, check=True,
        )
        for raw in proc.stdout.splitlines():
            p = root / raw
            if not p.is_file():
                continue
            parts = Path(raw).parts
            if not include_hidden and any(x.startswith(".") for x in parts):
                continue
            yield p
        return
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    for cur, dirs, files in os.walk(root):
        dirs[:] = sorted(
            d for d in dirs
            if d not in DEFAULT_EXCLUDES and (include_hidden or not d.startswith("."))
        )
        for name in sorted(files):
            if not include_hidden and name.startswith("."):
                continue
            yield Path(cur) / name


def _is_binary(p: Path) -> bool:
    try:
        with p.open("rb") as fh:
            return b"\0" in fh.read(4096)
    except OSError:
        return True


# --------------------------------------------------------------------------
# Repository tools
# --------------------------------------------------------------------------

def repo_files(
    repo_root: str | None = None,
    patterns: list[str] | None = None,
    limit: int = 5000,
    include_hidden: bool = False,
) -> dict[str, Any]:
    """List repository files (git-aware). `patterns` are globs, `**` supported."""
    root = resolve_repo_root(repo_root)
    results: list[str] = []
    truncated = False
    for p in _iter_repo_files(root, include_hidden):
        rel = _rel(root, p)
        if not _matches_glob(rel, patterns):
            continue
        if len(results) >= limit:
            truncated = True
            break
        results.append(rel)
    return {"repo": str(root), "files": results, "truncated": truncated}


def read_file(
    path: str,
    repo_root: str | None = None,
    start_line: int | None = None,
    end_line: int | None = None,
    max_bytes: int = 200_000,
) -> dict[str, Any]:
    """Read an exact 1-based inclusive line range. Returns raw content (no line-number prefixes).

    Without a range, output is capped at `max_bytes` (truncated=True if cut).
    """
    root = resolve_repo_root(repo_root)
    p = _safe_repo_path(root, path)
    if not p.is_file():
        raise FileNotFoundError(path)

    start = 1 if start_line is None else max(1, start_line)
    end = end_line
    selected: list[str] = []
    size = 0
    truncated = False
    last = start - 1
    with p.open("r", encoding="utf-8", errors="replace") as fh:
        for n, line in enumerate(fh, start=1):
            if n < start:
                continue
            if end is not None and n > end:
                break
            line = line.rstrip("\r\n")
            size += len(line.encode("utf-8")) + 1
            if size > max_bytes:
                truncated = True
                break
            selected.append(line)
            last = n
    return {
        "path": _rel(root, p),
        "start_line": start,
        "end_line": last,
        "content": "\n".join(selected),
        "truncated": truncated,
    }


def search_text(
    query: str,
    repo_root: str | None = None,
    regex: bool = False,
    case_sensitive: bool = False,
    patterns: list[str] | None = None,
    max_results: int = 100,
    include_hidden: bool = False,
) -> dict[str, Any]:
    """Line-level text/regex search. Every hit has path + 1-based line number."""
    if not query:
        raise ValueError("query must not be empty")
    root = resolve_repo_root(repo_root)
    flags = 0 if case_sensitive else re.IGNORECASE
    compiled = re.compile(query, flags) if regex else None
    needle = query if case_sensitive else query.lower()

    results: list[dict[str, Any]] = []
    scanned = 0
    for p in _iter_repo_files(root, include_hidden):
        rel = _rel(root, p)
        if patterns and not _matches_glob(rel, patterns):
            continue
        try:
            if p.stat().st_size > 2_000_000 or _is_binary(p):
                continue
            text = p.read_text("utf-8", errors="replace")
        except OSError:
            continue
        scanned += 1
        for idx, line in enumerate(text.splitlines(), start=1):
            if compiled:
                hit = bool(compiled.search(line))
            else:
                hit = needle in (line if case_sensitive else line.lower())
            if not hit:
                continue
            results.append({"path": rel, "line": idx, "text": line[:1000]})
            if len(results) >= max_results:
                return {"query": query, "results": results,
                        "scanned_files": scanned, "truncated": True}
    return {"query": query, "results": results,
            "scanned_files": scanned, "truncated": False}


def python_symbols(path: str, repo_root: str | None = None) -> dict[str, Any]:
    """Classes/functions of a Python file via stdlib AST (with line ranges)."""
    root = resolve_repo_root(repo_root)
    p = _safe_repo_path(root, path)
    source = p.read_text("utf-8", errors="replace")
    try:
        tree = ast.parse(source, filename=str(p))
    except SyntaxError as exc:
        return {"path": _rel(root, p), "symbols": [],
                "error": f"SyntaxError line {exc.lineno}: {exc.msg}"}

    symbols: list[dict[str, Any]] = []

    def visit(node: ast.AST, qual: str = "") -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            name = node.name if not qual else f"{qual}.{node.name}"
            symbols.append({
                "name": node.name,
                "qualified_name": name,
                "kind": type(node).__name__,
                "line": getattr(node, "lineno", None),
                "end_line": getattr(node, "end_lineno", None),
            })
            for child in node.body:
                visit(child, name)
            return
        for child in ast.iter_child_nodes(node):
            visit(child, qual)

    visit(tree)
    return {"path": _rel(root, p), "symbols": symbols}


def symbol_references(
    symbol: str,
    repo_root: str | None = None,
    patterns: list[str] | None = None,
    max_results: int = 100,
) -> dict[str, Any]:
    """Case-sensitive textual references. NOT semantic; prefer LSP when available."""
    return search_text(query=symbol, repo_root=repo_root, regex=False,
                       case_sensitive=True, patterns=patterns,
                       max_results=max_results)


def file_sha256(path: str, repo_root: str | None = None) -> dict[str, Any]:
    """SHA-256 of a repo file, for provenance / drift detection."""
    root = resolve_repo_root(repo_root)
    p = _safe_repo_path(root, path)
    digest = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"path": _rel(root, p), "sha256": digest.hexdigest(), "size": p.stat().st_size}


# --------------------------------------------------------------------------
# Persistent context tools
# --------------------------------------------------------------------------

def repo_state(repo_root: str | None = None) -> dict[str, Any]:
    """Current repo state. Git repo: {is_git, commit, branch, dirty}. Else is_git=False."""
    root = resolve_repo_root(repo_root)

    def git(*a: str) -> str:
        return subprocess.run(["git", "-C", str(root), *a], capture_output=True,
                              text=True, check=True).stdout.strip()
    try:
        return {"repo": str(root), "is_git": True, "commit": git("rev-parse", "HEAD"),
                "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
                "dirty": bool(git("status", "--porcelain"))}
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {"repo": str(root), "is_git": False, "commit": None, "branch": None, "dirty": None}


def _freshness(state: dict[str, Any]) -> dict[str, Any]:
    """Stamp stored on every record: git -> commit hash; non-git -> 24h TTL."""
    f: dict[str, Any] = {"verified_at": _now()}
    if state["is_git"]:
        f.update(mode="git", commit=state["commit"], dirty=state["dirty"])
    else:
        f.update(mode="ttl", ttl_seconds=TTL_SECONDS)
    return f


def _age_seconds(ts: str | None) -> float:
    try:
        t = datetime.strptime(ts or "", "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - t).total_seconds()
    except ValueError:
        return float("inf")


def _context_file(context_root: str | None) -> tuple[Path, Path]:
    root = resolve_context_root(context_root)
    target = (root / CONTEXT_FILE).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:  # defensive; CONTEXT_FILE is constant
        raise ValueError(f"Context path escapes {root}") from exc
    return root, target


def _read_records(target: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not target.exists():
        return rows
    for line in target.read_text("utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return rows


def _write_records(target: Path, rows: list[dict[str, Any]]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".jsonl.tmp")
    tmp.write_text(
        "".join(json.dumps(x, ensure_ascii=False, sort_keys=True) + "\n" for x in rows),
        encoding="utf-8",
    )
    tmp.replace(target)


def context_search(
    query: str,
    max_results: int = 20,
    context_root: str | None = None,
    include_stale: bool = True,
) -> dict[str, Any]:
    """Lexical token-overlap search over *.jsonl / *.json under context_root.

    Stale records are flagged via record["status"] == "stale"; treat as hints only.
    """
    root = resolve_context_root(context_root)
    if not root.exists():
        return {"query": query, "results": [], "missing": True, "context_root": str(root)}

    tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9_.$:-]+", query) if len(t) >= 2]
    results: list[dict[str, Any]] = []

    def stale(obj: Any) -> bool:
        return isinstance(obj, dict) and obj.get("status") == "stale"

    for p in list(root.rglob("*.jsonl")) + list(root.rglob("*.json")):
        try:
            if not p.is_file() or p.stat().st_size > 10_000_000:
                continue
            text = p.read_text("utf-8", errors="replace")
        except OSError:
            continue

        if p.suffix == ".jsonl":
            for line_no, line in enumerate(text.splitlines(), start=1):
                if not line.strip():
                    continue
                low = line.lower()
                score = sum(1 for t in tokens if t in low)
                if score <= 0:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    obj = {"raw": line}
                if not include_stale and stale(obj):
                    continue
                results.append({"score": score, "file": str(p), "line": line_no, "record": obj})
        else:
            low = text.lower()
            score = sum(1 for t in tokens if t in low)
            if score <= 0:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError:
                obj = {"raw": text[:5000]}
            if not include_stale and stale(obj):
                continue
            results.append({"score": score, "file": str(p), "record": obj})

    results.sort(key=lambda x: (-x["score"], x["file"], x.get("line", 0)))
    return {
        "query": query,
        "context_root": str(root),
        "results": results[:max_results],
        "truncated": len(results) > max_results,
    }


def context_upsert(
    record: dict[str, Any],
    key: str = "id",
    context_root: str | None = None,
    repo_root: str | None = None,
) -> dict[str, Any]:
    """Insert/replace a record (identity = record[key]) in <context_root>/context.jsonl.

    - Stamps `repo` and `freshness` (git: HEAD commit hash; non-git: verified_at + 24h TTL).
    - If `repo_root` is given (or resolvable) and a source is a dict with `file` but
      no `sha256`, the hash is filled in automatically.
    """
    if not isinstance(record, dict) or not record.get(key):
        raise ValueError(f"record must be an object with non-empty {key!r}")

    record = dict(record)
    state = repo_state(repo_root)
    record["repo"] = state["repo"]
    record["freshness"] = _freshness(state)  # always system-stamped
    record["updated_at"] = _now()
    record["status"] = record.get("status") or "verified"

    sources = record.get("sources")
    if isinstance(sources, list):
        root = Path(state["repo"])
        filled = []
        for s in sources:
            if isinstance(s, dict) and s.get("file") and not s.get("sha256") and root:
                try:
                    s = {**s, "sha256": file_sha256(s["file"], str(root))["sha256"]}
                except (OSError, ValueError):
                    pass
            filled.append(s)
        record["sources"] = filled

    _, target = _context_file(context_root)
    rows = _read_records(target)
    replaced = False
    for i, obj in enumerate(rows):
        if obj.get(key) == record[key]:
            rows[i] = record
            replaced = True
            break
    if not replaced:
        rows.append(record)
    _write_records(target, rows)
    return {"ok": True, "path": str(target), "id": record[key],
            "action": "updated" if replaced else "inserted"}


def context_invalidate(
    ids: list[str],
    reason: str = "stale",
    context_root: str | None = None,
) -> dict[str, Any]:
    """Mark records stale (status="stale", stale_reason=reason). Does not delete."""
    _, target = _context_file(context_root)
    if not target.exists():
        return {"updated": 0, "path": str(target)}
    wanted = set(ids)
    rows = _read_records(target)
    updated = 0
    for obj in rows:
        if obj.get("id") in wanted:
            obj["status"] = "stale"
            obj["stale_reason"] = reason
            updated += 1
    _write_records(target, rows)
    return {"updated": updated, "path": str(target)}


def _check_record(obj: dict[str, Any], root: Path, state: dict[str, Any]) -> tuple[str, list]:
    """Return (state, details). States:
    fresh | refreshed (moved commit/TTL, sources unchanged) | drifted | missing_source
    | needs_review (cannot prove unchanged) | stale (already marked)
    """
    if obj.get("status") == "stale":
        return "stale", []
    src, details = "unhashed", []
    for s in obj.get("sources") or []:
        if not (isinstance(s, dict) and s.get("file") and s.get("sha256")):
            continue
        try:
            cur = file_sha256(s["file"], str(root))["sha256"]
        except (OSError, ValueError):
            src = "missing_source"
            details.append({"file": s["file"], "problem": "missing"})
            continue
        if cur != s["sha256"]:
            if src != "missing_source":
                src = "drifted"
            details.append({"file": s["file"], "problem": "hash_changed"})
        elif src == "unhashed":
            src = "intact"
    if src in ("drifted", "missing_source"):
        return src, details

    f = obj.get("freshness") or {}
    if state["is_git"]:
        moved = f.get("mode") != "git" or f.get("commit") != state["commit"]
        details.append({"stored_commit": f.get("commit"), "head": state["commit"]})
    else:
        ttl = f.get("ttl_seconds", TTL_SECONDS)
        moved = f.get("mode") != "ttl" or _age_seconds(f.get("verified_at")) > ttl
    if not moved:
        return "fresh", details
    # commit/TTL moved: only safe to keep if hashed sources prove nothing changed
    return ("refreshed" if src == "intact" else "needs_review"), details


def context_verify(
    ids: list[str] | None = None,
    repo_root: str | None = None,
    context_root: str | None = None,
    touch: bool = True,
    invalidate: bool = False,
) -> dict[str, Any]:
    """Freshness check ("git is the cache watcher"; non-git repos use a 24h TTL).

    Per record, `action` is "use" or "review":
      fresh         use    commit == HEAD (or TTL valid) and source hashes match
      refreshed     use    HEAD/TTL moved but all hashed sources unchanged;
                           with touch=True the stored commit/verified_at is bumped to now
      needs_review  review HEAD/TTL moved and no hashed sources to prove it unchanged
      drifted       review a source file hash changed
      missing_source review a source file is gone
      stale         review already marked stale
    invalidate=True also marks drifted/missing_source records stale.
    Records belonging to a different repo are skipped.
    """
    state = repo_state(repo_root)
    root = Path(state["repo"])
    _, target = _context_file(context_root)
    rows = _read_records(target)
    wanted = set(ids) if ids else None
    report: list[dict[str, Any]] = []
    to_stale: list[str] = []
    changed = False

    for obj in rows:
        rid = obj.get("id")
        if wanted is not None and rid not in wanted:
            continue
        if obj.get("repo") and obj["repo"] != state["repo"]:
            continue
        st, details = _check_record(obj, root, state)
        if st == "refreshed" and touch:
            obj["freshness"] = _freshness(state)
            changed = True
        report.append({"id": rid, "state": st,
                       "action": "use" if st in ("fresh", "refreshed") else "review",
                       "details": details})
        if st in ("drifted", "missing_source"):
            to_stale.append(rid)

    if changed:
        _write_records(target, rows)
    if invalidate and to_stale:
        context_invalidate(to_stale, "source drift detected by context_verify", context_root)
    return {"repo": state["repo"], "is_git": state["is_git"], "head": state["commit"],
            "dirty": state["dirty"], "checked": len(report), "records": report,
            "invalidated": to_stale if invalidate else []}


def context_lookup(
    query: str,
    max_results: int = 10,
    repo_root: str | None = None,
    context_root: str | None = None,
) -> dict[str, Any]:
    """ONE-CALL entry point: search + freshness check, scoped to the current repo.

    Each result carries `state` and `action` ("use" | "review"); fresh and refreshed
    records are re-stamped to the current HEAD / time as a side effect.
    """
    state = repo_state(repo_root)
    found = context_search(query, max_results=500, context_root=context_root)
    hits = [h for h in found.get("results", [])
            if isinstance(h.get("record"), dict)
            and h["record"].get("id")
            and (not h["record"].get("repo") or h["record"]["repo"] == state["repo"])]
    hits = hits[:max_results]
    ver = context_verify(ids=[h["record"]["id"] for h in hits] or ["\0none"],
                         repo_root=state["repo"], context_root=context_root)
    by_id = {r["id"]: r for r in ver["records"]}
    out = []
    for h in hits:
        r = by_id.get(h["record"]["id"], {"state": "unknown", "action": "review"})
        out.append({"score": h["score"], "state": r["state"], "action": r["action"],
                    "details": r.get("details", []), "record": h["record"]})
    return {"query": query, "repo": state["repo"], "is_git": state["is_git"],
            "head": state["commit"], "dirty": state["dirty"], "results": out}


# --------------------------------------------------------------------------
# Dispatcher + CLI
# --------------------------------------------------------------------------

TOOLS = {
    "repo_files": repo_files,
    "read_file": read_file,
    "search_text": search_text,
    "python_symbols": python_symbols,
    "symbol_references": symbol_references,
    "file_sha256": file_sha256,
    "context_search": context_search,
    "context_upsert": context_upsert,
    "context_invalidate": context_invalidate,
    "context_verify": context_verify,
    "context_lookup": context_lookup,
    "repo_state": repo_state,
}


def call_tool(name: str, **kwargs: Any) -> dict[str, Any]:
    """Dispatch by name. Never raises: errors come back as {"error": ...}."""
    fn = TOOLS.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}", "available": sorted(TOOLS)}
    try:
        return _jsonable(fn(**kwargs))
    except TypeError as exc:
        return {"error": f"Bad arguments for {name}: {exc}"}
    except Exception as exc:  # noqa: BLE001 - surface to the agent as data
        return {"error": f"{type(exc).__name__}: {exc}"}


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[1] == "list":
        print(json.dumps({"tools": sorted(TOOLS)}, indent=2))
        return 0
    name = argv[1]
    raw = argv[2] if len(argv) > 2 else "{}"
    if raw == "-":
        raw = sys.stdin.read() or "{}"
    try:
        kwargs = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON args: {exc}"}))
        return 2
    result = call_tool(name, **kwargs)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if "error" in result else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
