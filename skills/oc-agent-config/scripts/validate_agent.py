#!/usr/bin/env python3
"""Static validator for OpenCode V2 agent Markdown files.

Implements the machine-checkable subset of the acceptance procedure in
`references/acceptance.md` (parse, frontmatter contract, line budget, body
layout, permission invariants). It does NOT replace runtime validation:
Catch-all defaults, merged configuration, catalog reachability, and behavior
still require the installed OpenCode build.

Usage:
    python3 validate_agent.py <agent.md> [more.md ...] [--json]

Exit code is non-zero if any HARD check fails. Warnings do not fail the run.

Requires Python 3 and PyYAML.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.stderr.write("PyYAML is required: pip install pyyaml\n")
    raise SystemExit(2)

REQUIRED_KEYS = {"description", "mode", "permissions"}
ALLOWED_MODES = {"primary", "subagent", "all"}
REJECTED_KEYS = {"permission", "tools", "prompt", "disable", "maxSteps"}
FORBIDDEN_RECURSIVE = {"temperature", "top_p"}
REJECTED_ACTIONS = {"bash", "task"}
POLICY_PATHS = ("AGENTS.md", "scripts/*")
BASELINE_NAME = "accepted_exceptions.json"
VALID_EFFECTS = {"allow", "ask", "deny"}
BODY_SECTIONS = ["## Context", "## Workflow", "## Rules"]
LINE_BUDGET = {  # mode -> (target, hard ceiling)
    "primary": (150, 160),
    "all": (150, 160),
    "subagent": (90, 120),
}

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)


class _DuplicateKeyError(yaml.YAMLError):
    pass


class _UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate mapping keys instead of silently keeping the last."""


def _construct_mapping(loader: yaml.SafeLoader, node: yaml.Node, deep: bool = False) -> dict:
    mapping: dict = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise _DuplicateKeyError(f"duplicate key: {key!r}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


@dataclass
class Result:
    path: Path
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checks: int = 0

    def fail(self, message: str) -> None:
        self.failures.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    @property
    def ok(self) -> bool:
        return not self.failures


def _iter_keys(node: object):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _iter_keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_keys(item)


def _find_body_heading_order(body: str) -> list[str]:
    positions = []
    for section in BODY_SECTIONS:
        match = re.search(rf"^{re.escape(section)}\s*$", body, re.MULTILINE)
        positions.append((section, match.start() if match else -1))
    return positions


def _policy_denies(permissions: list, start: int) -> set[str]:
    """Policy paths denied by a rule at or after `start`."""
    covered: set[str] = set()
    for rule in permissions[start:]:
        if not isinstance(rule, dict):
            continue
        if rule.get("effect") != "deny":
            continue
        if rule.get("action") not in ("edit", "*"):
            continue
        resource = rule.get("resource")
        if not isinstance(resource, str):
            continue
        normalized = resource.replace("~/.config/opencode/", "")
        if normalized in ("*", "**", "**/*"):
            return set(POLICY_PATHS)
        for path in POLICY_PATHS:
            if normalized == path or normalized.endswith("/" + path):
                covered.add(path)
    return covered


def _check_policy_reopen(result: Result, permissions: list) -> None:
    """A broad edit allow must be followed by a deny of every policy path."""
    for index, rule in enumerate(permissions):
        if not isinstance(rule, dict):
            continue
        if rule.get("action") != "edit" or rule.get("effect") != "allow":
            continue
        if rule.get("resource") not in ("*", "**", "**/*"):
            continue
        missing = [p for p in POLICY_PATHS if p not in _policy_denies(permissions, index + 1)]
        if missing:
            result.fail(
                f"permissions[{index}] grants a broad edit allow; a later rule must deny "
                f"policy path(s): {', '.join(missing)}"
            )


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_baseline(explicit: Path | None) -> list[dict]:
    """Read declared exceptions. A missing or unreadable baseline declares none."""
    path = explicit or (Path(__file__).resolve().parent / BASELINE_NAME)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    entries = data.get("exceptions") if isinstance(data, dict) else None
    return [e for e in entries if isinstance(e, dict)] if isinstance(entries, list) else []


def _entry_matches(path: Path, entry_path: str) -> bool:
    target = (_repo_root() / entry_path).resolve()
    if path.resolve() == target:
        return True
    return str(path.resolve()).endswith("/" + entry_path)


def _apply_baseline(results: list[Result], entries: list[dict]) -> tuple[int, list[str]]:
    """Downgrade exactly the declared failures to warnings. Narrow by path and prefix."""
    accepted = 0
    used: set[int] = set()
    for result in results:
        for index, entry in enumerate(entries):
            prefix = entry.get("failure_prefix")
            entry_path = entry.get("path")
            if not isinstance(prefix, str) or not prefix.strip() or not isinstance(entry_path, str):
                continue
            if not _entry_matches(result.path, entry_path):
                continue
            remaining = []
            for failure in result.failures:
                if failure.startswith(prefix):
                    reason = entry.get("reason", "declared exception")
                    result.warn(f"[accepted] {failure} — {reason}")
                    used.add(index)
                    accepted += 1
                else:
                    remaining.append(failure)
            result.failures = remaining
    unused = [
        f"{entry.get('path')}: {entry.get('failure_prefix')}"
        for index, entry in enumerate(entries)
        if index not in used
    ]
    return accepted, unused


def validate_file(path: Path) -> Result:
    result = Result(path=path)
    text = path.read_text(encoding="utf-8")
    result.checks += 1

    match = FRONTMATTER_RE.match(text)
    if not match:
        result.fail("missing a single opening/closing '---' frontmatter pair at file start")
        return result

    raw_frontmatter = match.group(1)
    body = text[match.end():]

    try:
        frontmatter = yaml.load(raw_frontmatter, Loader=_UniqueKeyLoader)
    except _DuplicateKeyError as exc:
        result.fail(f"frontmatter duplicate YAML key: {exc}")
        return result
    except yaml.YAMLError as exc:
        result.fail(f"frontmatter is not valid YAML: {exc}")
        return result

    if not isinstance(frontmatter, dict):
        result.fail("frontmatter is not a YAML mapping")
        return result

    if not body.strip():
        result.fail("body is empty")

    # Required / rejected / mode
    missing = sorted(REQUIRED_KEYS - frontmatter.keys())
    if missing:
        result.fail(f"missing required frontmatter field(s): {', '.join(missing)}")

    mode = frontmatter.get("mode")
    if mode is not None and mode not in ALLOWED_MODES:
        result.fail(f"mode {mode!r} not in {sorted(ALLOWED_MODES)}")

    rejected = sorted(REJECTED_KEYS & frontmatter.keys())
    if rejected:
        result.fail(f"rejected legacy key(s) present: {', '.join(rejected)}")

    if "$schema" in frontmatter:
        result.fail("'$schema' must not appear in agent frontmatter")
    for banned in ("skills", "MaxConcurrentSubagents"):
        if banned in frontmatter:
            result.fail(f"'{banned}' is not a native agent field; move it to its proper layer")

    # Forbidden sampling keys, anywhere
    for key in _iter_keys(frontmatter):
        if key in FORBIDDEN_RECURSIVE:
            result.fail(f"forbidden sampling key {key!r} configured in agent definition")
            break

    # Permissions
    permissions = frontmatter.get("permissions")
    if not isinstance(permissions, list) or not permissions:
        result.fail("'permissions' must be a non-empty ordered rule array")
    else:
        for index, rule in enumerate(permissions):
            if not isinstance(rule, dict):
                result.fail(f"permissions[{index}] is not a mapping")
                continue
            for key in ("action", "resource", "effect"):
                if key not in rule:
                    result.fail(f"permissions[{index}] missing '{key}'")
            effect = rule.get("effect")
            if effect is not None and effect not in VALID_EFFECTS:
                result.fail(f"permissions[{index}].effect {effect!r} not in {sorted(VALID_EFFECTS)}")
            if rule.get("action") in REJECTED_ACTIONS:
                result.fail(
                    f"permissions[{index}] uses rejected action {rule['action']!r}; "
                    "author 'shell'/'subagent' instead"
                )

        first = permissions[0] if isinstance(permissions[0], dict) else {}
        if not (
            first.get("action") == "*"
            and first.get("resource") == "*"
            and first.get("effect") == "deny"
        ):
            result.fail("first permission MUST be { action: '*', resource: '*', effect: deny }")

        if mode == "subagent":
            denies_delegation = any(
                isinstance(rule, dict)
                and rule.get("action") == "subagent"
                and rule.get("resource") == "*"
                and rule.get("effect") == "deny"
                for rule in permissions
            )
            if not denies_delegation:
                result.fail(
                    "subagent MUST contain { action: subagent, resource: '*', effect: deny }"
                )

        _check_policy_reopen(result, permissions)

    # Body layout
    headings = _find_body_heading_order(body)
    missing_sections = [name for name, pos in headings if pos < 0]
    if missing_sections:
        result.fail(f"missing body section(s): {', '.join(missing_sections)}")
    else:
        ordered = [pos for _, pos in headings]
        if ordered != sorted(ordered):
            result.fail("body sections out of order; expected Context, Workflow, Rules")
        last_heading = max(
            (m.start(), m.group(0))
            for m in re.finditer(r"^##\s+.*$", body, re.MULTILINE)
        ) if re.search(r"^##\s+.*$", body, re.MULTILINE) else None
        if last_heading and not last_heading[1].strip().endswith("Rules"):
            result.fail(f"final body section must be '## Rules', found {last_heading[1].strip()!r}")

    if not any(
        token in body
        for token in ("Required skill", "required skill", "Required reference", "required reference")
    ):
        result.warn("no 'Required skill' or 'Required reference' bullet found in body Rules")

    # Line budget
    line_count = len(text.splitlines())
    result.checks += 1
    if mode in LINE_BUDGET:
        target, ceiling = LINE_BUDGET[mode]
        if line_count > ceiling:
            result.fail(f"{line_count} lines exceeds the {mode} hard ceiling of {ceiling}")
        elif line_count > target:
            result.warn(f"{line_count} lines exceeds the {mode} target of {target} (ceiling {ceiling})")

    return result


def render(results: list[Result], as_json: bool, accepted: int = 0, unused: list[str] | None = None) -> int:
    if as_json:
        payload = [
            {
                "path": str(r.path),
                "ok": r.ok,
                "failures": r.failures,
                "warnings": r.warnings,
            }
            for r in results
        ]
        print(json.dumps(payload, indent=2))
    else:
        for r in results:
            status = "PASS" if r.ok else "FAIL"
            print(f"[{status}] {r.path}")
            for failure in r.failures:
                print(f"  x {failure}")
            for warning in r.warnings:
                print(f"  ! {warning}")
        failed = sum(1 for r in results if not r.ok)
        print(f"\n{len(results) - failed}/{len(results)} file(s) passed static checks.")
        if accepted:
            print(f"{accepted} declared exception(s) applied.")
        for entry in unused or []:
            print(f"! unused baseline exception: {entry}")
    return 1 if any(not r.ok for r in results) else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Static validator for OpenCode V2 agent files.")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help=f"declared exceptions file (default: {BASELINE_NAME} beside this script)",
    )
    args = parser.parse_args(argv)

    missing = [p for p in args.files if not p.is_file()]
    if missing:
        for p in missing:
            sys.stderr.write(f"not a file: {p}\n")
        return 2

    results = [validate_file(p) for p in args.files]
    accepted, unused = _apply_baseline(results, _load_baseline(args.baseline))
    return render(results, args.json, accepted, unused)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
