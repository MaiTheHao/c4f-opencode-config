import sqlite3
import sys
from pathlib import Path

try:
    from .models import SearchHit
    from .tokenizer import tokenize_code
except ImportError:  # chạy trực tiếp: python3 index.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from models import SearchHit
    from tokenizer import tokenize_code


class BM25Retriever:
    """Truy vấn và tính điểm xếp hạng Okapi BM25 từ SQLite."""

    def __init__(self, db_path: Path, k1: float = 1.5, b: float = 0.75) -> None:
        self.db_path = db_path
        self.k1 = k1
        self.b = b

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        if not self.db_path.exists():
            return []

        query_terms = list(set(tokenize_code(query)))
        if not query_terms:
            return []

        conn = sqlite3.connect(str(self.db_path))
        try:
            meta = dict(conn.execute("SELECT key, value FROM bm25_meta").fetchall())
            avgdl = float(meta.get("avgdl", 1.0)) or 1.0

            placeholders = ",".join("?" for _ in query_terms)
            sql = f"""
                SELECT
                    p.chunk_id,
                    f.file_path,
                    c.symbol_name,
                    c.node_type,
                    c.start_line,
                    c.end_line,
                    c.doc_length,
                    p.tf,
                    v.idf,
                    c.content
                FROM bm25_postings p
                JOIN bm25_vocab v ON p.term = v.term
                JOIN chunks c ON p.chunk_id = c.chunk_id
                JOIN files f ON c.file_id = f.file_id
                WHERE p.term IN ({placeholders})
            """
            rows = conn.execute(sql, query_terms).fetchall()
        finally:
            conn.close()

        scores: dict[int, float] = {}
        metadata: dict[int, tuple] = {}

        for chunk_id, file_path, symbol, node_type, s_line, e_line, doc_len, tf, idf, content in rows:
            num = tf * (self.k1 + 1.0)
            den = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / avgdl))
            scores[chunk_id] = scores.get(chunk_id, 0.0) + idf * (num / den)

            if chunk_id not in metadata:
                metadata[chunk_id] = (file_path, symbol, node_type, s_line, e_line, content)

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        return [
            SearchHit(
                score=round(score, 4),
                file_path=metadata[cid][0],
                symbol=metadata[cid][1],
                node_type=metadata[cid][2],
                start_line=metadata[cid][3],
                end_line=metadata[cid][4],
                content=metadata[cid][5],
            )
            for cid, score in ranked
        ]