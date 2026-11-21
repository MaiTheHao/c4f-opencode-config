import re
import sys
from pathlib import Path

try:
    from .config import CODE_STOPWORDS
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from config import CODE_STOPWORDS

TOKENIZER_VERSION = 1


def tokenize_code(text: str) -> list[str]:
    """Chuẩn hóa định danh code (camelCase, PascalCase, snake_case) thành token cho BM25."""
    raw_identifiers = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text)
    tokens: list[str] = []

    for ident in raw_identifiers:
        lower_ident = ident.lower()
        if len(lower_ident) > 1 and lower_ident not in CODE_STOPWORDS:
            tokens.append(lower_ident)

        snake_parts = [p for p in ident.split("_") if p]
        for part in snake_parts:
            camel_split = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", part)
            camel_parts = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", camel_split).split()

            if len(camel_parts) > 1 or len(snake_parts) > 1:
                for sub in camel_parts:
                    sub_lower = sub.lower()
                    if len(sub_lower) > 1 and sub_lower not in CODE_STOPWORDS:
                        tokens.append(sub_lower)

    return tokens
