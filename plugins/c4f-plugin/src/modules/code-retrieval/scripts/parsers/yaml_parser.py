import re

from .common import CodeChunk, line_starts, make_chunk, span_for_lines

KEY_RE = re.compile(r"^(?P<key>(?:\"[^\"]+\"|'[^']+'|[^\s#][^:]*?)):(?:\s|$)")


def chunk(text: str) -> list[CodeChunk]:
    """Mỗi key cấp 1 (cột 0) là một chunk; value lồng nhau nằm trong key cha."""
    lines = text.splitlines()
    starts = line_starts(text)
    key_lines: list[tuple[int, str]] = []

    for index, line in enumerate(lines):
        if not line or line[0].isspace() or line.lstrip().startswith("#"):
            continue
        match = KEY_RE.match(line)
        if match:
            key_lines.append((index, match.group("key").strip("\"'")))

    chunks: list[CodeChunk] = []
    for position, (line_index, key) in enumerate(key_lines):
        last_line = key_lines[position + 1][0] - 1 if position + 1 < len(key_lines) else len(lines) - 1
        start, end = span_for_lines(text, starts, line_index, last_line)
        result = make_chunk(text, starts, key, "yaml_key", start, end)
        if result:
            chunks.append(result)
    return chunks
