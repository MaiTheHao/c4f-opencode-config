import tree_sitter_java as ts_java
import tree_sitter_javascript as ts_js
import tree_sitter_typescript as ts_ts
from tree_sitter import Language, Node, Parser

try:
    from ..config import TARGET_NODE_TYPES
except ImportError:  # chạy trực tiếp: python3 index.py
    from config import TARGET_NODE_TYPES

from . import python_parser
from .common import CodeChunk

IDENTIFIER_TYPES = {
    "identifier", "type_identifier", "property_identifier", "field_identifier",
}

# Các khối được đệ quy để bóc tách method/function con bên trong.
NESTED_BLOCK_TYPES = {"class_declaration", "interface_declaration", "class_definition"}


class CodeAstParser:
    """Bóc tách Java/TypeScript/JavaScript/Python bằng Tree-sitter."""

    def __init__(self) -> None:
        self._parsers: dict[str, Parser] = {
            ".java": Parser(Language(ts_java.language())),
            ".ts": Parser(Language(ts_ts.language_typescript())),
            ".js": Parser(Language(ts_js.language())),
        }
        self._python_parser = load_python_parser()

    def parse(self, ext: str, raw_bytes: bytes) -> list[CodeChunk]:
        parser = self._parsers.get(ext)

        if ext == ".py":
            if self._python_parser is None:
                return python_parser.chunk(raw_bytes.decode("utf-8", errors="ignore"))
            parser = self._python_parser

        if parser is None:
            return []
        return parse_tree(raw_bytes, parser, TARGET_NODE_TYPES.get(ext, set()))


def load_python_parser() -> Parser | None:
    try:
        import tree_sitter_python as ts_python  # noqa: PLC0415 - optional dependency

        return Parser(Language(ts_python.language()))
    except (ImportError, AttributeError, TypeError, ValueError):
        # Không có grammar hoặc grammar lệch ABI: dùng fallback theo thụt lề.
        return None


def parse_tree(raw_bytes: bytes, parser: Parser, target_types: set[str]) -> list[CodeChunk]:
    tree = parser.parse(raw_bytes)
    chunks: list[CodeChunk] = []

    def walk(node: Node) -> None:
        if node.type in target_types:
            if node.type in {"lexical_declaration", "variable_declaration"} and not has_function(node):
                return

            snippet = raw_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="ignore").strip()
            if snippet:
                chunks.append(
                    CodeChunk(
                        symbol_name=extract_symbol_name(node, raw_bytes),
                        node_type=node.type,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        content=snippet,
                    )
                )

            if node.type in NESTED_BLOCK_TYPES:
                for child in node.children:
                    walk(child)
            return

        for child in node.children:
            walk(child)

    walk(tree.root_node)
    return chunks


def has_function(node: Node) -> bool:
    return any(
        c.type in {"arrow_function", "function_expression"}
        for decl in node.children
        for c in decl.children
    )


def extract_symbol_name(node: Node, source_bytes: bytes, depth: int = 0) -> str:
    name = node.child_by_field_name("name")
    if name is not None:
        return node_text(name, source_bytes)

    for child in node.children:
        if child.type in IDENTIFIER_TYPES:
            return node_text(child, source_bytes)

    if depth < 2:
        for child in node.children:
            if child.type in {
                "variable_declarator", "decorated_definition",
                "function_definition", "class_definition",
            }:
                nested = extract_symbol_name(child, source_bytes, depth + 1)
                if not nested.startswith("anonymous_"):
                    return nested

    return f"anonymous_{node.type}"


def node_text(node: Node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="ignore")
