import re

from .common import CodeChunk, line_starts, make_chunk, span_for_lines

BLOCK_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?:async[ \t]+)?(?P<kind>def|class)[ \t]+(?P<name>[A-Za-z_]\w*)"
)
DECORATOR_RE = re.compile(r"^[ \t]*@")


def indent_width(line: str) -> int:
    expanded = line.expandtabs(4)
    return len(expanded) - len(expanded.lstrip())


def chunk(text: str) -> list[CodeChunk]:
    """
    Fallback khi thiếu tree-sitter-python: bóc `class`/`def` theo thụt lề.

    Class được quét tiếp bên trong để lấy method; thân function được bỏ qua để
    tránh index trùng nội dung.
    """
    lines = text.splitlines()
    starts = line_starts(text)
    chunks: list[CodeChunk] = []
    total = len(lines)
    index = 0

    while index < total:
        match = BLOCK_RE.match(lines[index])
        if not match:
            index += 1
            continue

        indent = len(match.group("indent").expandtabs(4))
        kind = match.group("kind")
        name = match.group("name")

        # Gộp các dòng decorator ngay trên khai báo vào cùng chunk.
        first_line = index
        cursor = index - 1
        while cursor >= 0:
            if indent_width(lines[cursor]) != indent or not DECORATOR_RE.match(lines[cursor]):
                break
            first_line = cursor
            cursor -= 1

        last_line = index
        cursor = index + 1
        while cursor < total:
            if not lines[cursor].strip():
                cursor += 1
                continue
            if indent_width(lines[cursor]) > indent:
                last_line = cursor
                cursor += 1
                continue
            break

        start, end = span_for_lines(text, starts, first_line, last_line)
        result = make_chunk(
            text,
            starts,
            name,
            "class_definition" if kind == "class" else "function_definition",
            start,
            end,
        )
        if result:
            chunks.append(result)

        # Class: tiếp tục quét bên trong để lấy method. Function: bỏ qua thân.
        index = index + 1 if kind == "class" else cursor

    return chunks
