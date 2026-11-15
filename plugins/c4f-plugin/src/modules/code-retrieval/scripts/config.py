import os
from pathlib import Path

# Chỉ mục luôn nằm trong thư mục local/ của PROJECT được index,
# không phụ thuộc vào thư mục làm việc hiện tại (cwd) hay vị trí plugin.
DEFAULT_DB_REL_PATH = Path("local") / "agents" / "retrieval" / "code_bm25.db"

ENV_DB_PATH = "C4F_RETRIEVAL_DB"

# Ngôn ngữ lập trình có grammar Tree-sitter bắt buộc.
CODE_EXTENSIONS: set[str] = {".java", ".ts", ".js"}

# Python dùng Tree-sitter khi có tree-sitter-python, nếu không thì fallback
# theo thụt lề (def/class).
PYTHON_EXTENSIONS: set[str] = {".py"}

# Cấu hình, tài liệu và markup: bóc tách theo cấu trúc riêng của từng định dạng
# (heading, key, rule, element...) nên không cần thêm grammar.
STRUCTURED_TEXT_EXTENSIONS: set[str] = {
    ".yml", ".yaml",
    ".md", ".markdown",
    ".json",
    ".html", ".htm",
    ".css",
    ".xml",
}

TARGET_EXTENSIONS: set[str] = (
    CODE_EXTENSIONS | PYTHON_EXTENSIONS | STRUCTURED_TEXT_EXTENSIONS
)

IGNORE_DIRS: set[str] = {
    ".git", "node_modules", "target", "build", "dist", ".next", "out",
    ".gradle", ".mvn", "__pycache__", ".idea", ".vscode", "local", "venv",
    ".venv", "coverage", ".cache",
}

CODE_STOPWORDS: set[str] = {
    "public", "private", "protected", "static", "final", "void", "class",
    "interface", "extends", "implements", "return", "new", "this", "super",
    "import", "package", "from", "export", "default", "const", "let", "var",
    "function", "async", "await", "if", "else", "for", "while", "switch",
    "case", "break", "continue", "try", "catch", "finally", "throw", "throws",
    "true", "false", "null", "undefined", "boolean", "int", "long", "double",
    "float", "string", "number", "any", "override",
    # Python keywords / literals.
    "def", "self", "cls", "none", "elif", "except", "lambda", "pass", "with",
    "as", "yield", "raise", "assert", "del", "global", "nonlocal", "in", "is",
    "not", "and", "or",
    # Nhiễu phổ biến trong HTML/XML/CSS.
    "html", "head", "href", "src", "xmlns", "doctype", "px", "rgba", "rgb",
}

TARGET_NODE_TYPES: dict[str, set[str]] = {
    ".java": {
        "class_declaration",
        "interface_declaration",
        "enum_declaration",
        "method_declaration",
        "constructor_declaration",
    },
    ".ts": {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "interface_declaration",
        "type_alias_declaration",
        "lexical_declaration",
    },
    ".js": {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "lexical_declaration",
        "variable_declaration",
    },
    ".py": {
        "function_definition",
        "class_definition",
        "decorated_definition",
    },
}


def resolve_project_root(root_dir: str | Path | None = None) -> Path:
    """Thư mục gốc của project cần index; mặc định là cwd."""
    return Path(root_dir or ".").expanduser().resolve()


def resolve_db_path(root_dir: str | Path | None = None, db_path: str | Path | None = None) -> Path:
    """
    Xác định vị trí file SQLite theo thứ tự ưu tiên:
    1. --db truyền tay
    2. biến môi trường C4F_RETRIEVAL_DB
    3. <project_root>/local/agents/retrieval/code_bm25.db
    """
    if db_path:
        return Path(db_path).expanduser().resolve()

    env_value = os.environ.get(ENV_DB_PATH)
    if env_value:
        return Path(env_value).expanduser().resolve()

    return resolve_project_root(root_dir) / DEFAULT_DB_REL_PATH
