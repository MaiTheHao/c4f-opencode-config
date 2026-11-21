import sqlite3
import sys
from pathlib import Path

try:
    from .models import CodeChunk
    from .tokenizer import TOKENIZER_VERSION, tokenize_code
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from models import CodeChunk
    from tokenizer import TOKENIZER_VERSION, tokenize_code

SCHEMA_VERSION = 2
INDEXER_VERSION = 1

_LEGACY_TABLES = ("chunks", "bm25_vocab", "bm25_postings", "bm25_meta", "sync_meta")


class SQLiteFTSStore:
    """Ghi chunk + chỉ mục FTS5 vào SQLite. Không chứa logic search (TS đọc trực tiếp)."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.execute("PRAGMA busy_timeout = 5000;")
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA synchronous = NORMAL;")
        self._init_schema()

    def _tables(self) -> set[str]:
        return {row[0] for row in self.conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    def _init_schema(self) -> None:
        tables = self._tables()
        legacy = [name for name in _LEGACY_TABLES if name in tables]
        # Tạo schema mới trước để files/fts_chunks luôn tồn tại cho bước wipe;
        # DB chỉ có bảng legacy mà thiếu files không còn lỗi DELETE.
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS files (
                file_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                language TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
                symbol, path, content,
                file_path UNINDEXED, node_type UNINDEXED,
                start_line UNINDEXED, end_line UNINDEXED
            );

            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        self.conn.commit()

        tables = self._tables()
        if "fts_chunks" not in tables:
            raise RuntimeError("fts_chunks table could not be created (FTS5 unavailable?)")

        for name in legacy:
            self.conn.execute(f"DROP TABLE IF EXISTS {name}")
        meta = dict(self.conn.execute("SELECT key, value FROM meta").fetchall())
        version_ok = (
            meta.get("schema_version") == str(SCHEMA_VERSION)
            and meta.get("tokenizer_version") == str(TOKENIZER_VERSION)
        )
        if legacy or not version_ok:
            # DB lạ/phiên bản khác -> xóa sạch, index lại từ đầu (không gate COUNT).
            self.conn.execute("DELETE FROM fts_chunks")
            self.conn.execute("DELETE FROM files")
            self.conn.commit()

    @staticmethod
    def compute_hash(file_path: str | Path) -> str:
        import hashlib

        with open(file_path, "rb") as handle:
            return hashlib.sha256(handle.read()).hexdigest()

    def file_hashes(self) -> dict[str, str]:
        """Ảnh chụp {file_path: file_hash} để so sánh hàng loạt khi quét."""
        return dict(self.conn.execute("SELECT file_path, file_hash FROM files").fetchall())

    def is_file_unchanged(self, rel_path: str, file_hash: str) -> bool:
        row = self.conn.execute(
            "SELECT file_hash FROM files WHERE file_path = ?",
            (rel_path,),
        ).fetchone()
        return bool(row and row[0] == file_hash)

    def upsert_file_chunks(
        self, rel_path: str, language: str, file_hash: str, chunks: list[CodeChunk]
    ) -> None:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM fts_chunks WHERE file_path = ?", (rel_path,))
        cur.execute("DELETE FROM files WHERE file_path = ?", (rel_path,))
        cur.execute(
            "INSERT INTO files (file_path, language, file_hash) VALUES (?, ?, ?)",
            (rel_path, language, file_hash),
        )
        path_tokens = " ".join(tokenize_code(rel_path))
        for chunk in chunks:
            symbol_tokens = " ".join(tokenize_code(chunk.symbol_name))
            content_tokens = " ".join(
                tokenize_code(f"{chunk.symbol_name} {rel_path}\n{chunk.content}")
            )
            cur.execute(
                """
                INSERT INTO fts_chunks
                    (symbol, path, content, file_path, node_type, start_line, end_line)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    symbol_tokens,
                    path_tokens,
                    content_tokens,
                    rel_path,
                    chunk.node_type,
                    chunk.start_line,
                    chunk.end_line,
                ),
            )
        self.conn.commit()

    def remove_deleted_files(self, active_rel_paths: set[str]) -> int:
        existing_rows = self.conn.execute("SELECT file_path FROM files").fetchall()
        stale_paths = [r[0] for r in existing_rows if r[0] not in active_rel_paths]
        if stale_paths:
            self.conn.executemany("DELETE FROM fts_chunks WHERE file_path = ?", [(p,) for p in stale_paths])
            self.conn.executemany("DELETE FROM files WHERE file_path = ?", [(p,) for p in stale_paths])
            self.conn.commit()
        return len(stale_paths)

    def write_meta(self) -> None:
        self.conn.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [
                ("schema_version", str(SCHEMA_VERSION)),
                ("tokenizer_version", str(TOKENIZER_VERSION)),
                ("indexer_version", str(INDEXER_VERSION)),
            ],
        )
        self.conn.commit()

    def checkpoint(self) -> None:
        self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")

    def abort(self) -> None:
        """Hủy transaction dở dang rồi đóng kết nối (đường lỗi của index pass)."""
        try:
            self.conn.rollback()
        finally:
            self.conn.close()

    def close(self) -> None:
        try:
            self.conn.commit()
        finally:
            self.conn.close()
