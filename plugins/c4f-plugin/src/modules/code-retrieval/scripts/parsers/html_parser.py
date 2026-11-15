import re

from .common import CodeChunk, clip, line_starts, make_chunk
from .markup import TAG_RE, VOID_TAGS, attr_value, iter_tags

CONTAINER_TAGS = {
    "section", "article", "main", "header", "footer", "nav", "aside", "form",
    "table", "dialog", "template", "script", "style",
}
ID_RE = re.compile(r"\bid\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'>]+))", re.IGNORECASE)
CLASS_RE = re.compile(r"\bclass\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'>]+))", re.IGNORECASE)


def symbol_for(tag: str, attrs: str) -> str:
    element_id = attr_value(ID_RE, attrs)
    if element_id:
        return f"#{element_id}"
    classes = attr_value(CLASS_RE, attrs).split()
    if classes:
        return f".{classes[0]}"
    return tag


def is_container(tag: str, attrs: str) -> bool:
    if tag in CONTAINER_TAGS:
        return True
    # div chỉ được coi là khối khi có id/class để tránh băm vụn layout.
    return tag == "div" and bool(attr_value(ID_RE, attrs) or attr_value(CLASS_RE, attrs))


def chunk(text: str) -> list[CodeChunk]:
    starts = line_starts(text)
    stack: list[tuple[str, int, bool, str]] = []
    depth = 0
    chunks: list[CodeChunk] = []
    covered: list[tuple[int, int]] = []

    def emit(tag: str, attrs: str, start: int, end: int) -> None:
        result = make_chunk(text, starts, symbol_for(tag, attrs), f"html_{tag}", start, end)
        if result:
            chunks.append(result)
            covered.append((start, end))

    for closing, tag, attrs, self_closing, start, end in iter_tags(text):
        if closing:
            for position in range(len(stack) - 1, -1, -1):
                if stack[position][0] != tag:
                    continue
                _, open_start, is_root, open_attrs = stack[position]
                del stack[position:]
                if is_root:
                    depth -= 1
                    emit(tag, open_attrs, open_start, end)
                break
            continue

        if tag in VOID_TAGS:
            if depth == 0 and is_container(tag, attrs):
                emit(tag, attrs, start, end)
            continue

        is_root = depth == 0 and is_container(tag, attrs)
        if self_closing:
            if is_root:
                emit(tag, attrs, start, end)
            continue

        if is_root:
            depth += 1
        stack.append((tag, start, is_root, attrs))

    # Tag chưa đóng ở cuối file: vẫn index phần còn lại.
    for tag, open_start, is_root, open_attrs in stack:
        if is_root:
            emit(tag, open_attrs, open_start, len(text))

    # Phần nằm ngoài các container (text rời, layout...) vẫn phải tìm được.
    cursor = 0
    for span_start, span_end in sorted(covered):
        if span_start > cursor:
            append_gap(text, starts, cursor, span_start, chunks)
        cursor = max(cursor, span_end)
    if cursor < len(text):
        append_gap(text, starts, cursor, len(text), chunks)
    return chunks


def append_gap(text: str, starts: list[int], start: int, end: int, chunks: list[CodeChunk]) -> None:
    visible = re.sub(r"\s+", " ", TAG_RE.sub(" ", text[start:end])).strip()
    if not visible:
        return
    result = make_chunk(text, starts, clip(visible, 48), "html_fragment", start, end)
    if result:
        chunks.append(result)
