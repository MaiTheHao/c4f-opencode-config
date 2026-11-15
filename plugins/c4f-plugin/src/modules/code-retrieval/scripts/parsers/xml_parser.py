import re

from .common import CodeChunk, line_starts, make_chunk
from .markup import attr_value, iter_tags

NAME_RE = re.compile(r"\bname\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'>]+))", re.IGNORECASE)


def symbol_for(tag: str, attrs: str) -> str:
    name = attr_value(NAME_RE, attrs)
    return f"{tag} {name}" if name else tag


def chunk(text: str) -> list[CodeChunk]:
    """Mỗi phần tử con trực tiếp của root là một chunk (bean, item, dependency...)."""
    starts = line_starts(text)
    stack: list[tuple[str, int, bool, str]] = []
    chunks: list[CodeChunk] = []

    def emit(tag: str, attrs: str, start: int, end: int) -> None:
        result = make_chunk(text, starts, symbol_for(tag, attrs), "xml_element", start, end)
        if result:
            chunks.append(result)

    for closing, tag, attrs, self_closing, start, end in iter_tags(text):
        if closing:
            for position in range(len(stack) - 1, -1, -1):
                if stack[position][0] != tag:
                    continue
                _, open_start, is_chunk, open_attrs = stack[position]
                del stack[position:]
                if is_chunk:
                    emit(tag, open_attrs, open_start, end)
                break
            continue

        is_chunk = len(stack) == 1
        if self_closing:
            if is_chunk:
                emit(tag, attrs, start, end)
            continue

        stack.append((tag, start, is_chunk, attrs))

    for tag, open_start, is_chunk, open_attrs in stack:
        if is_chunk:
            emit(tag, open_attrs, open_start, len(text))
    return chunks
