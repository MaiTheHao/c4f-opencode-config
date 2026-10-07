#!/usr/bin/env python3
"""Minimal stdlib-only MCP stdio adapter for repository retrieval.

The MCP layer intentionally exposes a small public surface.
The underlying retrieval_tools.py may contain additional internal helpers,
but they are not advertised to the model.

Protocol:
  JSON-RPC 2.0
  newline-delimited JSON over stdin/stdout

Resolution:
  repo_root:
    tool arg -> RETRIEVAL_REPO_ROOT -> git toplevel of CWD -> CWD

  context_root:
    environment RETRIEVAL_CONTEXT_ROOT -> /local/agents/retrival_agent

Stdout is reserved for protocol messages.
Logs go to stderr.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# retrieval_tools.py is owned by the repo-context-retrieval skill. Prefer a
# sibling copy, then fall back to the skill's scripts directory.
_HERE = Path(__file__).resolve().parent
_SCRIPT_DIRS = (
    _HERE,
    _HERE.parents[1] / "skills" / "repo-context-retrieval" / "scripts",
)
for _script_dir in _SCRIPT_DIRS:
    if (_script_dir / "retrieval_tools.py").is_file():
        sys.path.insert(0, str(_script_dir))
        break
else:
    sys.path.insert(0, str(_HERE))

import retrieval_tools as rt  # noqa: E402


SERVER_INFO = {
    "name": "retrieval",
    "version": "1.1.0",
}

# Keep the server on a protocol revision understood by current OpenCode.
LATEST_PROTOCOL = "2025-06-18"
SUPPORTED_PROTOCOLS = {
    "2024-11-05",
    "2025-03-26",
    "2025-06-18",
}


# ---------------------------------------------------------------------------
# Small JSON-schema helpers
# ---------------------------------------------------------------------------

def string_schema(description: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {"type": "string"}
    if description:
        out["description"] = description
    return out


def integer_schema(description: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {"type": "integer"}
    if description:
        out["description"] = description
    return out


def boolean_schema(description: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {"type": "boolean"}
    if description:
        out["description"] = description
    return out


def string_list_schema(description: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {
        "type": "array",
        "items": {"type": "string"},
    }
    if description:
        out["description"] = description
    return out


def object_schema(
    description: str = "",
    *,
    additional_properties: bool = True,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "type": "object",
        "additionalProperties": additional_properties,
    }
    if description:
        out["description"] = description
    return out


def tool(
    name: str,
    description: str,
    properties: dict[str, Any],
    required: list[str] | tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": list(required),
            "additionalProperties": False,
        },
        "annotations": {
            "readOnlyHint": name not in {
                "context_lookup",
                "context_upsert",
                "context_invalidate",
            },
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": False,
        },
    }


REPO_OPTIONAL = string_schema(
    "Optional repository root. Normally omit; the server resolves the current workspace."
)

PATTERNS = string_list_schema(
    "Optional glob filters, for example ['src/**/*.py']."
)


# ---------------------------------------------------------------------------
# Public MCP surface
#
# Intentionally small. Internal helpers such as context_verify,
# context_search and file_sha256 remain inside retrieval_tools.py.
# ---------------------------------------------------------------------------

TOOL_DEFS = [
    tool(
        "repo_files",
        "List repository files while respecting gitignore.",
        {
            "patterns": PATTERNS,
            "limit": integer_schema("Maximum number of files. Default 5000."),
            "include_hidden": boolean_schema("Include hidden files and directories."),
            "repo_root": REPO_OPTIONAL,
        },
    ),

    tool(
        "search_text",
        "Search repository text and return path plus 1-based line hits.",
        {
            "query": string_schema("Text or regular expression to search for."),
            "regex": boolean_schema("Interpret query as a regular expression."),
            "case_sensitive": boolean_schema("Use case-sensitive matching."),
            "patterns": PATTERNS,
            "max_results": integer_schema("Maximum number of hits. Default 100."),
            "include_hidden": boolean_schema("Include hidden files and directories."),
            "repo_root": REPO_OPTIONAL,
        },
        ["query"],
    ),

    tool(
        "read_file",
        "Read an exact inclusive line range from a repository file.",
        {
            "path": string_schema(
                "Repository-relative path, or an absolute path inside the repository."
            ),
            "start_line": integer_schema("1-based start line."),
            "end_line": integer_schema("1-based inclusive end line."),
            "max_bytes": integer_schema("Maximum UTF-8 bytes. Default 200000."),
            "repo_root": REPO_OPTIONAL,
        },
        ["path"],
    ),

    tool(
        "python_symbols",
        "List Python classes and functions with source line ranges.",
        {
            "path": string_schema("Python file path."),
            "repo_root": REPO_OPTIONAL,
        },
        ["path"],
    ),

    tool(
        "symbol_references",
        "Find case-sensitive textual references to a symbol.",
        {
            "symbol": string_schema("Symbol text to search for."),
            "patterns": PATTERNS,
            "max_results": integer_schema("Maximum number of hits. Default 100."),
            "repo_root": REPO_OPTIONAL,
        },
        ["symbol"],
    ),

    tool(
        "repo_state",
        "Return repository path, git status, HEAD commit, branch, and dirty state.",
        {
            "repo_root": REPO_OPTIONAL,
        },
    ),

    tool(
        "context_lookup",
        "Search persistent context and check freshness. Start here.",
        {
            "query": string_schema("Repository concept, symbol, flow, or component."),
            "max_results": integer_schema("Maximum number of context results. Default 10."),
            "repo_root": REPO_OPTIONAL,
        },
        ["query"],
    ),

    tool(
        "context_upsert",
        "Store one verified context record with source provenance.",
        {
            "record": object_schema(
                "Verified context record. Include id, summary, sources, and relations when known.",
                additional_properties=True,
            ),
            "key": string_schema("Identity field. Default 'id'."),
            "repo_root": REPO_OPTIONAL,
        },
        ["record"],
    ),

    tool(
        "context_invalidate",
        "Mark verified context records stale without deleting them.",
        {
            "ids": string_list_schema("Record ids to invalidate."),
            "reason": string_schema("Why the records are no longer trusted."),
        },
        ["ids"],
    ),
]

KNOWN_TOOLS = {item["name"] for item in TOOL_DEFS}


# ---------------------------------------------------------------------------
# Protocol helpers
# ---------------------------------------------------------------------------

def log(message: str) -> None:
    print(f"[retrieval-mcp] {message}", file=sys.stderr, flush=True)


def send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def send_result(request_id: Any, result: dict[str, Any]) -> None:
    send({
        "jsonrpc": "2.0",
        "id": request_id,
        "result": result,
    })


def send_error(
    request_id: Any,
    code: int,
    message: str,
    data: Any | None = None,
) -> None:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
    }
    if data is not None:
        error["data"] = data

    send({
        "jsonrpc": "2.0",
        "id": request_id,
        "error": error,
    })


def is_request(message: dict[str, Any]) -> bool:
    return "id" in message and message.get("method") is not None


# ---------------------------------------------------------------------------
# MCP request handling
# ---------------------------------------------------------------------------

def handle_initialize(
    request_id: Any,
    params: dict[str, Any],
) -> None:
    requested = params.get("protocolVersion")

    protocol = (
        requested
        if requested in SUPPORTED_PROTOCOLS
        else LATEST_PROTOCOL
    )

    send_result(
        request_id,
        {
            "protocolVersion": protocol,
            "capabilities": {
                "tools": {
                    "listChanged": False,
                },
            },
            "serverInfo": SERVER_INFO,
        },
    )


def handle_tools_call(
    request_id: Any,
    params: dict[str, Any],
) -> None:
    name = params.get("name")
    arguments = params.get("arguments") or {}

    if not isinstance(name, str):
        send_error(request_id, -32602, "tools/call requires string parameter 'name'")
        return

    if name not in KNOWN_TOOLS:
        send_error(request_id, -32602, f"Unknown tool: {name}")
        return

    if not isinstance(arguments, dict):
        send_error(
            request_id,
            -32602,
            "tools/call parameter 'arguments' must be an object",
        )
        return

    result = rt.call_tool(name, **arguments)

    failed = isinstance(result, dict) and "error" in result

    payload: dict[str, Any] = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    result,
                    ensure_ascii=False,
                ),
            }
        ],
        "isError": failed,
    }

    send_result(request_id, payload)


def handle(message: dict[str, Any]) -> None:
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize":
        handle_initialize(request_id, params)
        return

    if method == "ping":
        send_result(request_id, {})
        return

    if method == "tools/list":
        send_result(
            request_id,
            {
                "tools": TOOL_DEFS,
            },
        )
        return

    if method == "tools/call":
        handle_tools_call(request_id, params)
        return

    # Notifications such as initialized/cancelled do not receive replies.
    if not is_request(message):
        return

    send_error(
        request_id,
        -32601,
        f"Method not found: {method}",
    )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> int:
    log(f"started; cwd={Path.cwd()}")

    for raw_line in sys.stdin:
        line = raw_line.strip()

        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            send_error(None, -32700, f"Parse error: {exc}")
            continue

        messages = message if isinstance(message, list) else [message]

        if not isinstance(messages, list):
            send_error(None, -32600, "Invalid Request")
            continue

        for item in messages:
            if not isinstance(item, dict):
                send_error(None, -32600, "Invalid Request")
                continue

            try:
                handle(item)
            except Exception as exc:  # noqa: BLE001
                log(f"internal error: {exc!r}")

                if "id" in item:
                    send_error(
                        item.get("id"),
                        -32603,
                        f"Internal error: {exc}",
                    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())