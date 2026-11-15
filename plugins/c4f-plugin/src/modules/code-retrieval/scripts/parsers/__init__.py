from pathlib import Path

try:
    from ..config import CODE_EXTENSIONS, PYTHON_EXTENSIONS
except ImportError:  # chạy trực tiếp: python3 index.py
    from config import CODE_EXTENSIONS, PYTHON_EXTENSIONS

from . import (
    css_parser,
    html_parser,
    json_parser,
    markdown_parser,
    xml_parser,
    yaml_parser,
)
from .code_parser import CodeAstParser
from .common import CodeChunk, with_file_fallback

# Định dạng không cần grammar: mỗi module tự bóc theo cấu trúc riêng.
TEXT_CHUNKERS = {
    ".yml": yaml_parser.chunk,
    ".yaml": yaml_parser.chunk,
    ".md": markdown_parser.chunk,
    ".markdown": markdown_parser.chunk,
    ".json": json_parser.chunk,
    ".html": html_parser.chunk,
    ".htm": html_parser.chunk,
    ".css": css_parser.chunk,
    ".xml": xml_parser.chunk,
}

CODE_AST_EXTENSIONS = CODE_EXTENSIONS | PYTHON_EXTENSIONS


class TreeSitterCodeParser:
    """Entry point: chọn parser theo phần mở rộng và chuẩn hóa fallback."""

    def __init__(self) -> None:
        self._ast = CodeAstParser()

    def parse_file(self, file_path: Path) -> list[CodeChunk]:
        ext = file_path.suffix.lower()
        if ext not in TEXT_CHUNKERS and ext not in CODE_AST_EXTENSIONS:
            return []

        raw_bytes = file_path.read_bytes()
        text = raw_bytes.decode("utf-8", errors="ignore")

        chunker = TEXT_CHUNKERS.get(ext)
        if chunker is not None:
            return with_file_fallback(file_path, text, chunker(text))

        return with_file_fallback(file_path, text, self._ast.parse(ext, raw_bytes))


__all__ = ["TreeSitterCodeParser", "TEXT_CHUNKERS", "CODE_AST_EXTENSIONS"]
