from .common import CodeChunk, clip, line_starts, make_chunk


def chunk(text: str) -> list[CodeChunk]:
    chunks: list[CodeChunk] = []
    scan(text, 0, len(text), line_starts(text), chunks)
    return chunks


def scan(
    text: str,
    start: int,
    end: int,
    starts: list[int],
    chunks: list[CodeChunk],
) -> None:
    """Quét rule cấp hiện tại; at-rule được đệ quy để index cả rule lồng bên trong."""
    index = start
    prelude_start = start

    while index < end:
        char = text[index]
        if char == "/" and text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            index = end if close == -1 else close + 2
            continue
        if char in "\"'":
            index = skip_quoted(text, index, end)
            continue
        if char == ";":
            prelude_start = index + 1
            index += 1
            continue
        if char != "{":
            if char == "}":
                prelude_start = index + 1
            index += 1
            continue

        close = find_matching_brace(text, index, end)
        prelude = text[prelude_start:index].strip()
        is_at_rule = prelude.startswith("@")
        chunk_start = prelude_start
        while chunk_start < index and text[chunk_start].isspace():
            chunk_start += 1

        result = make_chunk(
            text,
            starts,
            clip(prelude) or "anonymous",
            "css_at_rule" if is_at_rule else "css_rule",
            chunk_start,
            close + 1 if close != -1 else end,
        )
        if result:
            chunks.append(result)

        # @media/@supports/@keyframes: index cả các rule lồng bên trong.
        if is_at_rule and close != -1:
            scan(text, index + 1, close, starts, chunks)

        index = end if close == -1 else close + 1
        prelude_start = index


def skip_quoted(text: str, index: int, end: int) -> int:
    quote = text[index]
    index += 1
    while index < end:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return index + 1
        index += 1
    return end


def find_matching_brace(text: str, open_index: int, end: int) -> int:
    depth = 0
    index = open_index
    while index < end:
        char = text[index]
        if char == "/" and text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            index = end if close == -1 else close + 2
            continue
        if char in "\"'":
            index = skip_quoted(text, index, end)
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1
