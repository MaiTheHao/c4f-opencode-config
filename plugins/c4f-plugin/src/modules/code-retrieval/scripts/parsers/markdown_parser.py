import re

from .common import CodeChunk, line_starts, make_chunk, span_for_lines

HEADING_RE = re.compile(r"^(?P<hashes>#{1,6})[ \t]+(?P<title>.+?)[ \t]*#*[ \t]*$")
FENCE_RE = re.compile(r"^[ \t]*(```|~~~)")


def chunk(text: str) -> list[CodeChunk]:
    lines = text.splitlines()
    starts = line_starts(text)
    headings: list[tuple[int, str]] = []
    in_fence = False
    fence_marker = ""

    for index, line in enumerate(lines):
        fence = FENCE_RE.match(line)
        if fence:
            marker = fence.group(1)
            if not in_fence:
                in_fence, fence_marker = True, marker
            elif marker == fence_marker:
                in_fence = False
            continue
        if in_fence:
            continue
        heading = HEADING_RE.match(line)
        if heading:
            headings.append((index, heading.group("title")))

    chunks: list[CodeChunk] = []

    # Nội dung trước heading đầu tiên (front matter, mở bài) vẫn được index.
    if headings and headings[0][0] > 0:
        start, end = span_for_lines(text, starts, 0, headings[0][0] - 1)
        preamble = make_chunk(text, starts, "preamble", "markdown_preamble", start, end)
        if preamble:
            chunks.append(preamble)

    for position, (line_index, title) in enumerate(headings):
        last_line = headings[position + 1][0] - 1 if position + 1 < len(headings) else len(lines) - 1
        start, end = span_for_lines(text, starts, line_index, last_line)
        result = make_chunk(text, starts, title, "markdown_section", start, end)
        if result:
            chunks.append(result)
    return chunks
