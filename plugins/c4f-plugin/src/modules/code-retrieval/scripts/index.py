import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

try:  # import khi dùng như package: python3 -c "from scripts.index import ..."
    from .config import IGNORE_DIRS, TARGET_EXTENSIONS, resolve_db_path, resolve_project_root
    from .models import SearchHit
    from .parser import TreeSitterCodeParser
    from .searcher import BM25Retriever
    from .storage import SQLiteBM25Store
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from config import IGNORE_DIRS, TARGET_EXTENSIONS, resolve_db_path, resolve_project_root
    from models import SearchHit
    from parser import TreeSitterCodeParser
    from searcher import BM25Retriever
    from storage import SQLiteBM25Store

__all__ = ["index_codebase", "search_code", "main", "SearchHit"]


def index_codebase(
    root_dir: str | Path = ".",
    db_path: str | Path | None = None,
) -> dict[str, object]:
    """
    Quét toàn bộ mã nguồn và tài liệu/cấu hình dưới `root_dir`
    (.java, .ts, .js, .py, .yml/.yaml, .md/.markdown, .json, .html/.htm, .css,
    .xml), bóc tách AST/chunk cấu trúc và lưu chỉ mục BM25 vào SQLite.

    `db_path` mặc định: <root_dir>/local/agents/retrieval/code_bm25.db
    """
    root = resolve_project_root(root_dir)
    db = resolve_db_path(root, db_path)

    store = SQLiteBM25Store(db)
    parser = TreeSitterCodeParser()

    stats: dict[str, object] = {"indexed": 0, "skipped": 0, "removed": 0, "db": str(db)}
    active_paths: set[str] = set()

    try:
        for current_root, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for filename in files:
                file_path = Path(current_root) / filename
                ext = file_path.suffix.lower()
                if ext not in TARGET_EXTENSIONS:
                    continue

                rel_path = str(file_path.relative_to(root))
                active_paths.add(rel_path)
                file_hash = store.compute_hash(file_path)

                if store.is_file_unchanged(rel_path, file_hash):
                    stats["skipped"] += 1
                    continue

                chunks = parser.parse_file(file_path)
                store.upsert_file_chunks(rel_path, ext.lstrip("."), file_hash, chunks)
                stats["indexed"] += 1

        stats["removed"] = store.remove_deleted_files(active_paths)
        store.rebuild_bm25_stats()
    finally:
        store.close()

    return stats


def search_code(
    query: str,
    top_k: int = 5,
    db_path: str | Path | None = None,
    root_dir: str | Path = ".",
) -> list[dict]:
    """Truy vấn mã nguồn theo xếp hạng BM25 từ SQLite."""
    retriever = BM25Retriever(resolve_db_path(root_dir, db_path))
    hits = retriever.search(query=query, top_k=top_k)
    return [asdict(hit) for hit in hits]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="index.py",
        description=(
            "Index / search mã nguồn và tài liệu (Java, TypeScript, JavaScript, Python, "
            "YAML, Markdown, JSON, HTML, CSS, XML) bằng Tree-sitter + BM25."
        ),
    )
    subparsers = parser.add_subparsers(dest="command")

    def add_common(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--root", default=".", help="Thư mục gốc của project (mặc định: cwd)")
        sub.add_argument(
            "--db",
            default=None,
            help="Đường dẫn file SQLite (mặc định: <root>/local/agents/retrieval/code_bm25.db, "
            "hoặc $C4F_RETRIEVAL_DB)",
        )
        sub.add_argument("--json", action="store_true", help="In kết quả dạng JSON (machine-readable)")

    index_parser = subparsers.add_parser("index", help="Đồng bộ chỉ mục (mặc định)")
    add_common(index_parser)

    search_parser = subparsers.add_parser("search", help="Tìm kiếm theo BM25")
    search_parser.add_argument("query", help="Từ khóa hoặc tên symbol cần tìm")
    search_parser.add_argument("--top-k", type=int, default=5, help="Số kết quả (mặc định: 5)")
    search_parser.add_argument(
        "--sync",
        action="store_true",
        help="Đồng bộ chỉ mục (incremental) trước khi tìm kiếm",
    )
    add_common(search_parser)

    return parser


def main(argv: list[str] | None = None) -> int:
    raw_args = list(sys.argv[1:] if argv is None else argv)
    # Không truyền subcommand (hoặc chỉ truyền --root/--db) -> mặc định là index.
    if not raw_args or (raw_args[0].startswith("-") and raw_args[0] not in {"-h", "--help"}):
        raw_args.insert(0, "index")

    args = _build_parser().parse_args(raw_args)
    command = args.command or "index"
    db_path = str(resolve_db_path(args.root, args.db))

    if command == "search":
        sync_stats = index_codebase(root_dir=args.root, db_path=args.db) if args.sync else None
        hits = search_code(args.query, top_k=args.top_k, db_path=args.db, root_dir=args.root)

        if args.json:
            print(
                json.dumps(
                    {
                        "query": args.query,
                        "root": str(resolve_project_root(args.root)),
                        "db": db_path,
                        "index": sync_stats,
                        "hits": hits,
                    },
                    ensure_ascii=False,
                )
            )
            return 0

        if not hits:
            print("[Search] Không có kết quả (hoặc chỉ mục chưa tồn tại).")
            return 0
        for hit in hits:
            print(
                f"[{hit['score']:.4f}] {hit['file_path']}::{hit['symbol']} "
                f"({hit['start_line']}-{hit['end_line']}, {hit['node_type']})"
            )
        return 0

    stats = index_codebase(root_dir=args.root, db_path=args.db)
    if args.json:
        print(json.dumps(stats, ensure_ascii=False))
        return 0

    print(
        f"[Index] Mới/Cập nhật: {stats['indexed']} | Không đổi: {stats['skipped']} | "
        f"Đã xóa: {stats['removed']} | DB: {stats['db']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
