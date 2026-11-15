import re
from bisect import bisect_right
from pathlib import Path

try:
    from ..models import CodeChunk
except ImportError:  # chạy trực tiếp: python3 index.py
    from models import CodeChunk

MAX_SYMBOL_LENGTH = 80


def line_starts(text: str) -> list[int]:
    """Offset bắt đầu của từng dòng (0-based)."""
    starts = [0]
    index = text.find("\n")
    while index != -1:
        starts.append(index + 1)
        index = text.find("\n", index + 1)
    return starts


def line_at(starts: list[int], offset: int) -> int:
    """Chuyển offset ký tự (0-based) thành số dòng (1-based)."""
    return bisect_right(starts, max(0, offset))


def span_for_lines(text: str, starts: list[int], first: int, last: int) -> tuple[int, int]:
    """Offset đầu/cuối của một khoảng dòng (0-based, bao gồm cả hai đầu)."""
    start = starts[first]
    end = starts[last + 1] - 1 if last + 1 < len(starts) else len(text)
    return start, max(start, end)


def trim_end(text: str, start: int, end: int) -> int:
    while end > start and text[end - 1] in " \t\r\n":
        end -= 1
    return end


def clip(value: str, limit: int = MAX_SYMBOL_LENGTH) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def make_chunk(
    text: str,
    starts: list[int],
    symbol: str,
    node_type: str,
    start: int,
    end: int,
) -> CodeChunk | None:
    end = trim_end(text, start, end)
    if end <= start:
        return None
    content = text[start:end]
    if not content.strip():
        return None
    return CodeChunk(
        symbol_name=clip(symbol) or "anonymous",
        node_type=node_type,
        start_line=line_at(starts, start),
        end_line=line_at(starts, end - 1),
        content=content,
    )


def with_file_fallback(file_path: Path, text: str, chunks: list[CodeChunk]) -> list[CodeChunk]:
    """File không bóc được khối nào vẫn được index nguyên file."""
    if chunks:
        return chunks
    content = text.strip()
    if not content:
        return []
    return [
        CodeChunk(
            symbol_name=file_path.stem,
            node_type="file_module",
            start_line=1,
            end_line=max(1, text.count("\n") + (0 if text.endswith("\n") else 1)),
            content=content,
        )
    ]
