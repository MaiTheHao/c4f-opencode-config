#!/usr/bin/env python3
"""c4f.py - C4F config guard: protect, audit, smoke, doctor.

Scope split:
  THIS SCRIPT owns repository and environment policy: file modes, allowlist
  membership, config shape, tracked state, model reachability.
  skills/oc-agent-config/scripts/validate_agent.py owns agent file shape
  (frontmatter, permissions array, body layout). The two must not duplicate
  each other's rules.

Subcommands:
  protect lock|unlock|verify   file-mode gate on the policy files
  audit                        allowlist / config / tracked-state checks
  smoke                        run each allowed model once, record the result
  doctor                       environment and dependency readiness

Exit codes: 0 ok, 1 violation, 2 usage or environment error.
Requires Python 3, stdlib only. `smoke` shells out to the `opencode` CLI.
"""

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AGENTS_DIR = os.path.join(ROOT, "agents")
CONFIG_FILE = os.path.join(ROOT, "opencode.jsonc")
ALLOWED_FILE = os.path.join(HERE, "allowed_models.json")

# Policy files: editing any of these can disable the gate. Keep the list here only.
POLICY_FILES = (
    "AGENTS.md",
    "scripts/allowed_models.json",
    "scripts/show_models.py",
    "scripts/c4f.py",
)

LOCKED_MODE = 0o444
UNLOCKED_MODE = 0o644
SMOKE_PROMPT = "Reply with exactly: OK"

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---", re.DOTALL)
MODEL_RE = re.compile(r"^model:\s*['\"]?([^'\"\n]+?)['\"]?\s*$", re.MULTILINE)

sys.path.insert(0, HERE)
try:
    import show_models as sm  # single source of truth for allowlist + free detection
except ImportError as exc:  # pragma: no cover - environment error
    sys.stderr.write("cannot import show_models.py from %s: %s\n" % (HERE, exc))
    raise SystemExit(2)


# ---------- shared helpers ----------

def _rel(path):
    return os.path.relpath(path, ROOT)


def _git(*args):
    return subprocess.run(["git", "-C", ROOT] + list(args), capture_output=True, text=True)


def _strip_jsonc(text):
    """Drop // and /* */ comments outside strings, then trailing commas."""
    out, i, n, in_str, esc = [], 0, len(text), False, False
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def _load_config():
    """Parsed opencode.jsonc, or raises ValueError."""
    with open(CONFIG_FILE, encoding="utf-8") as f:
        return json.loads(_strip_jsonc(f.read()))


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def _agent_files():
    found = []
    for base, _dirs, files in os.walk(AGENTS_DIR):
        for name in sorted(files):
            if name.endswith(".md"):
                found.append(os.path.join(base, name))
    return sorted(found)


def _frontmatter(text):
    match = FRONTMATTER_RE.match(text)
    return match.group(1) if match else ""


def _rows_out(rows, columns, as_json):
    if as_json:
        print(json.dumps([dict(zip(columns, r)) for r in rows], indent=2))
        return
    print("| " + " | ".join(columns) + " |")
    print("|" + "---|" * len(columns))
    for row in rows:
        print("| " + " | ".join(str(c) for c in row) + " |")


# ---------- protect ----------

def _chattr(path, add):
    exe = shutil.which("chattr")
    if not exe:
        return None
    flag = "+i" if add else "-i"
    return subprocess.run([exe, flag, path], capture_output=True, text=True).returncode == 0


def _immutable(path):
    exe = shutil.which("lsattr")
    if not exe:
        return None
    result = subprocess.run([exe, "-d", path], capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return "i" in result.stdout.split()[0]


def cmd_protect(args):
    rows, failed = [], False
    for rel in POLICY_FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            rows.append((rel, "MISSING", "-", "FAIL", "file not found"))
            failed = True
            continue

        if args.action == "lock":
            os.chmod(path, LOCKED_MODE)
            if args.immutable:
                applied = _chattr(path, True)
                if applied is False:
                    rows.append((rel, "0444", "no", "WARN", "chattr +i unavailable or refused"))
                    continue
            rows.append((rel, "0444", "yes" if args.immutable else "-", "OK", "locked"))
            continue

        if args.action == "unlock":
            if _immutable(path):
                _chattr(path, False)
            os.chmod(path, UNLOCKED_MODE)
            rows.append((rel, "0644", "no", "OK", "unlocked"))
            continue

        mode = stat.S_IMODE(os.stat(path).st_mode)
        expected = LOCKED_MODE if args.expect == "locked" else UNLOCKED_MODE
        immer = _immutable(path)
        state = "WARN" if mode != expected else "OK"
        if mode != expected:
            failed = True
        elif args.expect == "locked" and args.immutable and immer is not True:
            state = "FAIL"
            failed = True
        rows.append((rel, "%04o" % mode, "?" if immer is None else ("yes" if immer else "no"),
                     state, "expected %04o" % expected))

    _rows_out(rows, ("path", "mode", "immutable", "status", "note"), args.json)
    return 1 if failed else 0


# ---------- audit ----------

def _check_allowlist(find):
    try:
        allowed = sm._load_allowed()
        find("PASS", "allowlist", "%d authorized, %d banned" % (len(allowed[0]), len(allowed[1])))
        return allowed
    except SystemExit as exc:
        find("FAIL", "allowlist", str(exc))
        return None


def _check_agents(find, allowed):
    pricing = sm._load_pricing()
    unpinned = []
    total = 0
    for path in _agent_files():
        rel = _rel(path)
        total += 1
        front = _frontmatter(_read(path))
        if not front:
            find("WARN", "agent-model", "%s: no frontmatter" % rel)
            continue
        match = MODEL_RE.search(front)
        if not match:
            unpinned.append(rel)
            continue
        model = match.group(1).strip()
        status = sm.classify(model, allowed, pricing)
        find("PASS" if status in sm.ALLOWED_STATUSES else "FAIL",
             "agent-model", "%s: %s -> %s" % (rel, model, status))
    if unpinned:
        preview = ", ".join(unpinned[:3]) + (" ..." if len(unpinned) > 3 else "")
        find("WARN", "agent-model",
             "%d/%d agent(s) pin no model (%s); a subagent inherits the parent session model" % (
                 len(unpinned), total, preview))


def _check_config(find, allowed):
    try:
        config = _load_config()
        find("PASS", "config", "%s parses" % _rel(CONFIG_FILE))
    except (OSError, ValueError) as exc:
        find("FAIL", "config", "%s: %s" % (_rel(CONFIG_FILE), exc))
        return

    mcp = config.get("mcp")
    if isinstance(mcp, dict) and "servers" in mcp:
        find("FAIL", "mcp", "mcp.servers wrapper present; entries are keyed by server name directly")
    elif isinstance(mcp, dict):
        find("PASS", "mcp", "%d server(s), no servers wrapper" % len(mcp))
        for name, entry in mcp.items():
            command = entry.get("command") if isinstance(entry, dict) else None
            joined = " ".join(command) if isinstance(command, list) else str(command or "")
            if "$HOME" in joined:
                find("WARN", "mcp", "%s: $HOME in command is not shell-expanded; use {env:HOME}" % name)

    if "permission" in config:
        has_v2 = any("permissions:" in _frontmatter(_read(p)) for p in _agent_files())
        find("WARN" if has_v2 else "PASS", "generation",
             "config uses v1 `permission`" + ("; agents use v2 `permissions` (mixed)" if has_v2 else ""))

    model = config.get("model")
    if isinstance(model, str) and allowed:
        status = sm.classify(model, allowed, sm._load_pricing())
        find("PASS" if status in sm.ALLOWED_STATUSES else "FAIL",
             "default-model", "%s -> %s" % (model, status))


def _check_tracked(find):
    tracked = set(_git("ls-files").stdout.splitlines())
    for rel in POLICY_FILES:
        if rel in tracked:
            find("PASS", "tracked", rel)
            continue
        ignored = shutil.which("git") and _git("check-ignore", "-q", rel).returncode == 0
        if ignored:
            find("FAIL", "tracked", "%s is gitignored; it cannot be restored after deletion" % rel)
        else:
            find("FAIL", "tracked", "%s is untracked; `git clean -fd` erases it" % rel)


def cmd_audit(args):
    findings = []

    def find(level, check, message):
        findings.append((level, check, message))

    allowed = _check_allowlist(find)
    if allowed:
        _check_agents(find, allowed)
    _check_config(find, allowed)
    _check_tracked(find)

    _rows_out(findings, ("level", "check", "detail"), args.json)
    failed = sum(1 for f in findings if f[0] == "FAIL")
    if not args.json:
        print("\n%d check(s), %d failure(s)." % (len(findings), failed))
    return 1 if failed else 0


# ---------- smoke ----------

def cmd_smoke(args):
    try:
        allowed, _banned = sm._load_allowed()
    except SystemExit as exc:
        sys.stderr.write("%s\n" % exc)
        return 2

    models = args.model or [meta["id"] for meta in allowed.values()]
    catalog = sm._run_opencode_models()  # allowlist stores base ids; the CLI needs provider/model
    rows, failed = [], False
    for model in models:
        candidates = [m for m in catalog if sm._base(m) == sm._base(model)]
        resolved = next((m for m in candidates if m.startswith("opencode-go/")), None) \
            or (candidates[0] if candidates else None)
        if not resolved:
            rows.append((model, "UNAVAILABLE", "not in `opencode models` output"))
            failed = True
            continue
        command = ["opencode", "run", "--model", resolved, "--format", "json", "--auto", SMOKE_PROMPT]
        if args.dry_run:
            rows.append((resolved, "DRY", " ".join(command)))
            continue
        # Throwaway workdir: --auto must never reach the real workspace.
        workdir = tempfile.mkdtemp(prefix="c4f-smoke-")
        try:
            result = subprocess.run(command, capture_output=True, text=True,
                                    timeout=args.timeout, cwd=workdir)
        except FileNotFoundError:
            sys.stderr.write("opencode not found in PATH\n")
            return 2
        except subprocess.TimeoutExpired:
            rows.append((resolved, "TIMEOUT", "no answer in %ss" % args.timeout))
            failed = True
            continue
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
        blob = (result.stdout or "") + (result.stderr or "")
        if "unpaid" in blob.lower():
            status, note = "UNPAID", "provider rejected the request as unpaid"
        elif result.returncode == 0 and "OK" in (result.stdout or ""):
            status, note = "OK", ""
        elif result.returncode != 0:
            status, note = "ERROR", (result.stderr or "").strip().splitlines()[-1][:120] if result.stderr else ""
        else:
            status, note = "NO-ACK", "answered but did not acknowledge"
        if status != "OK":
            failed = True
        rows.append((resolved, status, note))

    _rows_out(rows, ("model", "result", "note"), args.json)
    return 1 if failed else 0


# ---------- doctor ----------

def cmd_doctor(args):
    checks = []

    def check(name, ok, detail, level=None):
        checks.append((level or ("PASS" if ok else "FAIL"), name, detail))

    check("python", sys.version_info >= (3, 9), sys.version.split()[0])
    check("opencode", shutil.which("opencode") is not None,
          shutil.which("opencode") or "not in PATH")

    try:
        allowed = sm._load_allowed()
        check("allowlist", True, "%d authorized, %d banned" % (len(allowed[0]), len(allowed[1])))
    except SystemExit as exc:
        allowed = None
        check("allowlist", False, str(exc))

    try:
        config = _load_config()
        check("config", True, "%s parses" % _rel(CONFIG_FILE))
    except (OSError, ValueError) as exc:
        config = None
        check("config", False, str(exc))

    for rel in POLICY_FILES:
        path = os.path.join(ROOT, rel)
        check("policy-file", os.path.isfile(path), rel if os.path.isfile(path) else "%s missing" % rel)

    if config and allowed:
        model = config.get("model")
        status = sm.classify(str(model), allowed, sm._load_pricing()) if model else "MISSING"
        check("default-model", status in sm.ALLOWED_STATUSES, "%s -> %s" % (model, status))

    if config:
        mcp = config.get("mcp")
        for name, entry in (mcp or {}).items():
            if not isinstance(entry, dict) or not isinstance(entry.get("command"), list):
                continue
            target = entry["command"][-1] if entry.get("type") == "local" else None
            if isinstance(target, str):
                resolved = target.replace("{env:HOME}", os.path.expanduser("~"))
                check("mcp-%s" % name, os.path.isfile(resolved),
                      resolved if os.path.isfile(resolved) else "%s missing" % resolved)

    modes = []
    for rel in POLICY_FILES:
        path = os.path.join(ROOT, rel)
        if os.path.isfile(path):
            modes.append(stat.S_IMODE(os.stat(path).st_mode))
    locked = bool(modes) and all(m == LOCKED_MODE for m in modes)
    check("policy-mode", True, "locked" if locked else "unlocked (run `c4f.py protect lock`)",
          level="PASS" if locked else "WARN")

    _rows_out(checks, ("level", "check", "detail"), args.json)
    failed = sum(1 for c in checks if c[0] == "FAIL")
    if not args.json:
        print("\n%d check(s), %d failure(s)." % (len(checks), failed))
    return 1 if failed else 0


# ---------- CLI ----------

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="C4F config guard: policy-file modes, allowlist audit, model smoke test, env doctor.",
        epilog="Examples:\n"
               "  c4f.py protect verify\n"
               "  c4f.py protect lock --immutable\n"
               "  c4f.py audit --json\n"
               "  c4f.py smoke --dry-run\n"
               "  c4f.py doctor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subs = parser.add_subparsers(dest="command", required=True)

    protect = subs.add_parser("protect", help="file-mode gate on the policy files")
    protect.add_argument("action", choices=["lock", "unlock", "verify"])
    protect.add_argument("--expect", choices=["locked", "unlocked"], default="locked",
                         help="expected state for `verify` (default locked)")
    protect.add_argument("--immutable", action="store_true",
                         help="also set chattr +i on lock (Linux only; refuses silently elsewhere)")
    protect.add_argument("--json", action="store_true")
    protect.set_defaults(func=cmd_protect)

    audit = subs.add_parser("audit", help="allowlist / config / tracked-state checks")
    audit.add_argument("--json", action="store_true")
    audit.set_defaults(func=cmd_audit)

    smoke = subs.add_parser("smoke", help="run each allowed model once and record the result")
    smoke.add_argument("--model", action="append", metavar="ID", help="model to test; repeatable")
    smoke.add_argument("--timeout", type=int, default=120, help="seconds per model (default 120)")
    smoke.add_argument("--dry-run", action="store_true", help="print commands without executing")
    smoke.add_argument("--json", action="store_true")
    smoke.set_defaults(func=cmd_smoke)

    doctor = subs.add_parser("doctor", help="environment and dependency readiness")
    doctor.add_argument("--json", action="store_true")
    doctor.set_defaults(func=cmd_doctor)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
