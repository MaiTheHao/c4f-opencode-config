"""Facade mỏng để `index.py` và các script khác import parser ổn định.

Toàn bộ định nghĩa parser nằm trong package `parsers/` (mỗi định dạng một file).
"""

import sys
from pathlib import Path

if __package__ in (None, ""):  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from parsers import TreeSitterCodeParser
else:
    from .parsers import TreeSitterCodeParser

__all__ = ["TreeSitterCodeParser"]
