import hashlib
import math
import sqlite3
import sys
from collections import Counter
from pathlib import Path

try:
    from .models import CodeChunk
    from .tokenizer import tokenize_code
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from models import CodeChunk
    from tokenizer import tokenize_code


class SQLiteBM25Store:
    """Lưu trữ dữ liệu chunk và chỉ mục nghịch đảo BM25 vào SQLite."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA synchronous = NORMAL;")
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS files (
                file_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                language TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                symbol_name TEXT NOT NULL,
                node_type TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                doc_length INTEGER NOT NULL,
                content TEXT NOT NULL,
                FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bm25_vocab (
                term TEXT PRIMARY KEY,
                df INTEGER NOT NULL,
                idf REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bm25_postings (
                term TEXT NOT NULL,
                chunk_id INTEGER NOT NULL,
                tf INTEGER NOT NULL,
                PRIMARY KEY (term, chunk_id),
                FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bm25_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_postings_term ON bm25_postings(term);
            CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
        """)
        self.conn.commit()

    @staticmethod
    def compute_hash(file_path: Path) -> str:
        return hashlib.sha256(file_path.read_bytes()).hexdigest()

    def is_file_unchanged(self, rel_path: str, file_hash: str) -> bool:
        row = self.conn.execute(
            "SELECT file_hash FROM files WHERE file_path = ?",
            (rel_path,),
        ).fetchone()
        return bool(row and row[0] == file_hash)

    def upsert_file_chunks(self, rel_path: str, language: str, file_hash: str, chunks: list[CodeChunk]) -> None:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM files WHERE file_path = ?", (rel_path,))
        cur.execute(
            "INSERT INTO files (file_path, language, file_hash) VALUES (?, ?, ?)",
            (rel_path, language, file_hash),
        )
        file_id = cur.lastrowid

        for chunk in chunks:
            enriched_text = f"{chunk.symbol_name} {rel_path}\n{chunk.content}"
            tokens = tokenize_code(enriched_text)
            if not tokens:
                continue

            tf_counts = Counter(tokens)
            cur.execute(
                """
                INSERT INTO chunks (file_id, symbol_name, node_type, start_line, end_line, doc_length, content)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (file_id, chunk.symbol_name, chunk.node_type, chunk.start_line, chunk.end_line, len(tokens), chunk.content),
            )
            chunk_id = cur.lastrowid

            cur.executemany(
                "INSERT INTO bm25_postings (term, chunk_id, tf) VALUES (?, ?, ?)",
                [(term, chunk_id, tf) for term, tf in tf_counts.items()],
            )

    def remove_deleted_files(self, active_rel_paths: set[str]) -> int:
        existing_rows = self.conn.execute("SELECT file_path FROM files").fetchall()
        stale_paths = [r[0] for r in existing_rows if r[0] not in active_rel_paths]
        if stale_paths:
            self.conn.executemany("DELETE FROM files WHERE file_path = ?", [(p,) for p in stale_paths])
        return len(stale_paths)

    def rebuild_bm25_stats(self) -> None:
        cur = self.conn.cursor()
        total_docs, avgdl = cur.execute("SELECT COUNT(*), COALESCE(AVG(doc_length), 0) FROM chunks").fetchone()
        total_docs = int(total_docs)
        avgdl = float(avgdl)

        cur.execute("DELETE FROM bm25_vocab")
        cur.execute("DELETE FROM bm25_meta")
        cur.executemany(
            "INSERT INTO bm25_meta (key, value) VALUES (?, ?)",
            [("total_docs", str(total_docs)), ("avgdl", str(avgdl))],
        )

        if total_docs > 0:
            df_rows = cur.execute(
                "SELECT term, COUNT(DISTINCT chunk_id) FROM bm25_postings GROUP BY term"
            ).fetchall()
            vocab_data = [
                (term, df, math.log(1.0 + (total_docs - df + 0.5) / (df + 0.5)))
                for term, df in df_rows
            ]
            cur.executemany("INSERT INTO bm25_vocab (term, df, idf) VALUES (?, ?, ?)", vocab_data)

        self.conn.commit()

    def close(self) -> None:
        self.conn.close()