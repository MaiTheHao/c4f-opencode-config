import argparse
import json
import os
import signal
import sys
import time
from importlib import import_module
from pathlib import Path

try:  # import khi dùng như package: python3 -c "from scripts.index import ..."
    from .config import IGNORE_DIRS, TARGET_EXTENSIONS, resolve_db_path, resolve_project_root
    from .storage import INDEXER_VERSION, SCHEMA_VERSION, SQLiteFTSStore
    from .tokenizer import TOKENIZER_VERSION
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from config import IGNORE_DIRS, TARGET_EXTENSIONS, resolve_db_path, resolve_project_root
    from storage import INDEXER_VERSION, SCHEMA_VERSION, SQLiteFTSStore
    from tokenizer import TOKENIZER_VERSION

__all__ = ["index_codebase", "main"]


def _load_parser():
    """Nạp parser Tree-sitter theo nhu cầu: một lượt sync không đổi file thì không cần grammar."""
    module = f"{__package__}.parser" if __package__ else "parser"
    return import_module(module).TreeSitterCodeParser


def index_codebase(
    root_dir: str | Path = ".",
    db_path: str | Path | None = None,
    force_rebuild: bool = False,
) -> dict[str, object]:
    """
    Quét toàn bộ mã nguồn và tài liệu/cấu hình dưới `root_dir`, bóc tách
    AST/chunk cấu trúc và lưu chỉ mục FTS5 vào SQLite.

    `db_path` mặc định: <root_dir>/local/agents/retrieval/code_bm25.db
    """
    root = resolve_project_root(root_dir)
    db = resolve_db_path(root, db_path)
    root_prefix = str(root) + os.sep

    stats: dict[str, object] = {"indexed": 0, "skipped": 0, "removed": 0, "db": str(db), "rebuilt": False}
    active_paths: set[str] = set()
    store = None
    parser = None

    def scan(current_root: str) -> None:
        nonlocal parser
        with os.scandir(current_root) as entries:
            for entry in entries:
                if entry.is_dir(follow_symlinks=False):
                    if entry.name not in IGNORE_DIRS:
                        scan(entry.path)
                    continue
                if not entry.is_file():
                    continue

                file_path = entry.path
                ext = os.path.splitext(entry.name)[1].lower()
                if ext not in TARGET_EXTENSIONS:
                    continue

                # entry.path luôn nằm dưới root_prefix, nên cắt tiền tố rẻ hơn os.path.relpath.
                rel_path = (
                    file_path[len(root_prefix):]
                    if file_path.startswith(root_prefix)
                    else os.path.relpath(file_path, root)
                ).replace(os.sep, "/")
                active_paths.add(rel_path)
                file_hash = store.compute_hash(file_path)

                if known_hashes.get(rel_path) == file_hash:
                    stats["skipped"] += 1
                    continue

                if parser is None:
                    parser = _load_parser()()
                chunks = parser.parse_file(Path(file_path))
                store.upsert_file_chunks(rel_path, ext.lstrip("."), file_hash, chunks)
                stats["indexed"] += 1

    try:
        store = SQLiteFTSStore(db)
        known_hashes = store.file_hashes()
        if force_rebuild:
            for rel_path in list(known_hashes):
                store.conn.execute("DELETE FROM fts_chunks WHERE file_path = ?", (rel_path,))
            store.conn.execute("DELETE FROM files")
            store.conn.commit()
            known_hashes = {}

        scan(str(root))
        stats["removed"] = store.remove_deleted_files(active_paths)
        if stats["indexed"] or stats["removed"] or force_rebuild:
            stats["rebuilt"] = True
        store.write_meta()
        store.checkpoint()
    except BaseException:
        if store is not None:
            store.abort()
        raise
    else:
        store.close()

    return stats


def _watch(root: str, db: str | None, interval: float, as_json: bool) -> int:
    stop = False

    def _handle(_signum, _frame):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)

    while not stop:
        stats = index_codebase(root_dir=root, db_path=db)
        if as_json:
            print(json.dumps(stats, ensure_ascii=False), flush=True)
        else:
            print(
                f"[Index] Mới/Cập nhật: {stats['indexed']} | Không đổi: {stats['skipped']} | "
                f"Đã xóa: {stats['removed']} | DB: {stats['db']}",
                flush=True,
            )
        deadline = time.monotonic() + interval
        while not stop and time.monotonic() < deadline:
            time.sleep(min(0.2, max(0.05, deadline - time.monotonic())))
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="index.py",
        description=(
            "Index mã nguồn và tài liệu (Java, TypeScript, JavaScript, Python, "
            "YAML, Markdown, JSON, HTML, CSS, XML) bằng Tree-sitter + FTS5."
        ),
    )
    parser.add_argument("--root", default=".", help="Thư mục gốc của project (mặc định: cwd)")
    parser.add_argument(
        "--db",
        default=None,
        help="Đường dẫn file SQLite (mặc định: <root>/local/agents/retrieval/code_bm25.db, "
        "hoặc $C4F_RETRIEVAL_DB)",
    )
    parser.add_argument("--json", action="store_true", help="In kết quả dạng JSON (machine-readable)")
    parser.add_argument("--rebuild", action="store_true", help="Buộc index lại toàn bộ từ đầu")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Chạy liên tục: quét lại mỗi --interval giây cho tới khi nhận SIGINT/SIGTERM",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Chu kỳ quét khi --watch (giây, tối thiểu 1, mặc định: 2)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(list(sys.argv[1:] if argv is None else argv))
    interval = max(1.0, args.interval)

    if args.watch:
        return _watch(args.root, args.db, interval, args.json)

    stats = index_codebase(root_dir=args.root, db_path=args.db, force_rebuild=args.rebuild)
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
