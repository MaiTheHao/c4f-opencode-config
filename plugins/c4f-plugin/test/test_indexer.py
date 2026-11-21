import contextlib
import io
import json
import os
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import closing, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "src" / "modules" / "code-retrieval" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from index import index_codebase, main  # noqa: E402
import index as index_module  # noqa: E402
from storage import SCHEMA_VERSION, SQLiteFTSStore  # noqa: E402
from tokenizer import TOKENIZER_VERSION, tokenize_code  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class IndexerHarness(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.files = []
        for index in range(3):
            markdown = self.root / f"doc_{index}.md"
            markdown.write_text(f"# Document {index}\n\nShared topic {index}.\n", encoding="utf-8")
            typescript = self.root / f"module_{index}.ts"
            typescript.write_text(
                f"export function stableSymbol{index}() {{ return 'initialValue{index}'; }}\n",
                encoding="utf-8",
            )
            self.files.extend((markdown, typescript))
        self.db_path = self.root / "local" / "agents" / "retrieval" / "code_bm25.db"

    def tearDown(self):
        self.temp_dir.cleanup()

    def _tables(self):
        with closing(sqlite3.connect(self.db_path)) as connection:
            return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    def test_fts_schema_and_meta(self):
        index_codebase(self.root)

        tables = self._tables()
        self.assertIn("fts_chunks", tables)
        self.assertIn("meta", tables)
        self.assertIn("files", tables)
        for legacy in ("chunks", "bm25_vocab", "bm25_postings", "bm25_meta"):
            self.assertNotIn(legacy, tables)

        with closing(sqlite3.connect(self.db_path)) as connection:
            meta = dict(connection.execute("SELECT key, value FROM meta").fetchall())
            count = connection.execute("SELECT COUNT(*) FROM fts_chunks").fetchone()[0]
        self.assertEqual(meta.get("schema_version"), str(SCHEMA_VERSION))
        self.assertEqual(meta.get("tokenizer_version"), str(TOKENIZER_VERSION))
        self.assertIn("indexer_version", meta)
        self.assertGreater(count, 0)

    def test_incremental_and_delete(self):
        index_codebase(self.root)
        with closing(sqlite3.connect(self.db_path)) as connection:
            before = connection.execute("SELECT COUNT(*) FROM fts_chunks").fetchone()[0]

        self.files[1].write_text(
            "export function freshlySearchableSymbol() { return 'distinctiveNewTerm'; }\n",
            encoding="utf-8",
        )
        self.files[0].unlink()
        stats = index_codebase(self.root)

        self.assertEqual(stats["indexed"], 1)
        self.assertEqual(stats["removed"], 1)
        with closing(sqlite3.connect(self.db_path)) as connection:
            paths = [row[0] for row in connection.execute("SELECT DISTINCT file_path FROM fts_chunks")]
            symbols = [row[0] for row in connection.execute("SELECT symbol FROM fts_chunks")]
        self.assertNotIn("doc_0.md", paths)
        self.assertTrue(any("freshlysearchablesymbol" in symbol for symbol in symbols))
        with closing(sqlite3.connect(self.db_path)) as connection:
            after = connection.execute("SELECT COUNT(*) FROM fts_chunks").fetchone()[0]
        self.assertNotEqual(before, after)

    def test_legacy_db_rebuild(self):
        # Seed một DB format cũ (bảng bm25_*) rồi index -> drop legacy và rebuild sạch.
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.executescript("""
                CREATE TABLE files (file_id INTEGER PRIMARY KEY, file_path TEXT UNIQUE, language TEXT, file_hash TEXT);
                INSERT INTO files (file_path, language, file_hash) VALUES ('old.ts', 'ts', 'deadbeef');
                CREATE TABLE bm25_vocab (term TEXT PRIMARY KEY, df INTEGER NOT NULL, idf REAL NOT NULL);
                INSERT INTO bm25_vocab (term, df, idf) VALUES ('stale', 1, 1.0);
                CREATE TABLE bm25_postings (term TEXT, chunk_id INTEGER);
                CREATE TABLE bm25_meta (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE chunks (chunk_id INTEGER PRIMARY KEY, file_id INTEGER, symbol_name TEXT);
            """)
            connection.commit()

        stats = index_codebase(self.root)

        tables = self._tables()
        for legacy in ("chunks", "bm25_vocab", "bm25_postings", "bm25_meta"):
            self.assertNotIn(legacy, tables)
        self.assertIn("fts_chunks", tables)
        with closing(sqlite3.connect(self.db_path)) as connection:
            paths = [row[0] for row in connection.execute("SELECT DISTINCT file_path FROM fts_chunks")]
            meta = dict(connection.execute("SELECT key, value FROM meta").fetchall())
        self.assertNotIn("old.ts", paths)
        self.assertEqual(meta.get("schema_version"), str(SCHEMA_VERSION))
        self.assertGreater(stats["indexed"], 0)

    def test_watch_reindexes_change(self):
        index_codebase(self.root)
        proc = subprocess.Popen(
            [sys.executable, str(SCRIPTS_DIR / "index.py"), "--watch", "--interval", "1",
             "--root", str(self.root), "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        try:
            # Đợi pass đầu tiên.
            first_line = proc.stdout.readline()
            self.assertTrue(first_line.strip(), "watch không in stats pass đầu")
            first = json.loads(first_line)
            self.assertIn("indexed", first)

            # Sửa 1 file, chờ pass sau re-index.
            self.files[1].write_text(
                "export function watchUpdatedSymbol() { return 'watchMarkerTerm'; }\n",
                encoding="utf-8",
            )
            deadline = time.time() + 15
            saw_indexed = False
            while time.time() < deadline:
                line = proc.stdout.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                stats = json.loads(line)
                if stats.get("indexed", 0) >= 1:
                    saw_indexed = True
                    break
            self.assertTrue(saw_indexed, "pass sau của --watch không re-index file đã sửa")

            with closing(sqlite3.connect(self.db_path)) as connection:
                symbols = [row[0] for row in connection.execute("SELECT symbol FROM fts_chunks")]
            self.assertTrue(any("watchupdatedsymbol" in symbol for symbol in symbols))
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)
            finally:
                if proc.stdout:
                    proc.stdout.close()
        self.assertEqual(proc.returncode, 0, "watch thoát không sạch sau SIGTERM")

    def test_golden_tokenizer(self):
        with open(FIXTURES_DIR / "tokenizer_cases.json", encoding="utf-8") as handle:
            cases = json.load(handle)
        self.assertGreater(len(cases), 0)
        for case in cases:
            with self.subTest(input=case["input"]):
                self.assertEqual(tokenize_code(case["input"]), case["tokens"])

    def test_cli_bare_invocation_defaults_to_index(self):
        stats_before_tables = self._tables() if self.db_path.exists() else set()
        self.assertNotIn("fts_chunks", stats_before_tables)
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            exit_code = main(["--root", str(self.root), "--json"])
        self.assertEqual(exit_code, 0)
        self.assertIn("indexed", json.loads(stdout.getvalue()))
        self.assertIn("fts_chunks", self._tables())

    def test_writer_sets_busy_timeout(self):
        store = SQLiteFTSStore(self.db_path)
        try:
            timeout = store.conn.execute("PRAGMA busy_timeout").fetchone()[0]
        finally:
            store.close()
        self.assertEqual(timeout, 5000)

    def test_stored_paths_stay_relative(self):
        index_codebase(self.root)
        with closing(sqlite3.connect(self.db_path)) as connection:
            paths = [row[0] for row in connection.execute("SELECT file_path FROM files")]
        self.assertTrue(paths)
        for path in paths:
            self.assertFalse(Path(path).is_absolute())
            self.assertNotIn("\\", path)
            self.assertFalse(path.startswith(("./", "../")))

    def test_interrupted_upsert_rolls_back_without_losing_chunks(self):
        index_codebase(self.root)
        with closing(sqlite3.connect(self.db_path)) as connection:
            old_hash = connection.execute(
                "SELECT file_hash FROM files WHERE file_path = 'module_0.ts'"
            ).fetchone()[0]
            before = connection.execute(
                "SELECT COUNT(*) FROM fts_chunks WHERE file_path = 'module_0.ts'"
            ).fetchone()[0]
        self.assertGreater(before, 0)

        import storage as storage_module

        real_tokenize = storage_module.tokenize_code
        calls = []

        def flaky(text):
            calls.append(text)
            if len(calls) >= 3:
                raise RuntimeError("simulated crash mid-pass")
            return real_tokenize(text)

        store = SQLiteFTSStore(self.db_path)
        chunk = SimpleNamespace(
            symbol_name="stableSymbol0",
            node_type="function_declaration",
            start_line=1,
            end_line=2,
            content="return 'initialValue0';",
        )
        with mock.patch.object(storage_module, "tokenize_code", side_effect=flaky):
            with self.assertRaises(RuntimeError):
                store.upsert_file_chunks("module_0.ts", "ts", "newhash", [chunk])
        store.abort()
        with closing(sqlite3.connect(self.db_path)) as connection:
            kept_hash = connection.execute(
                "SELECT file_hash FROM files WHERE file_path = 'module_0.ts'"
            ).fetchone()[0]
            kept_chunks = connection.execute(
                "SELECT COUNT(*) FROM fts_chunks WHERE file_path = 'module_0.ts'"
            ).fetchone()[0]
        self.assertEqual(kept_hash, old_hash)
        self.assertEqual(kept_chunks, before)

    def test_legacy_with_stale_fts_rows_rebuilds_clean(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.executescript("""
                CREATE TABLE files (file_id INTEGER PRIMARY KEY, file_path TEXT UNIQUE, language TEXT, file_hash TEXT);
                INSERT INTO files (file_path, language, file_hash) VALUES ('old.ts', 'ts', 'deadbeef');
                CREATE TABLE bm25_vocab (term TEXT PRIMARY KEY, df INTEGER NOT NULL, idf REAL NOT NULL);
                INSERT INTO bm25_vocab (term, df, idf) VALUES ('stale', 1, 1.0);
                CREATE VIRTUAL TABLE fts_chunks USING fts5(
                    symbol, path, content,
                    file_path UNINDEXED, node_type UNINDEXED,
                    start_line UNINDEXED, end_line UNINDEXED);
                INSERT INTO fts_chunks (symbol, path, content, file_path, node_type, start_line, end_line)
                    VALUES ('ghost', 'ghost', 'ghost', 'ghost.ts', 'function_declaration', 1, 2);
                CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO meta (key, value) VALUES ('schema_version', '1');
            """)
            connection.commit()

        stats = index_codebase(self.root)

        with closing(sqlite3.connect(self.db_path)) as connection:
            fts_paths = [row[0] for row in connection.execute("SELECT DISTINCT file_path FROM fts_chunks")]
            file_paths = [row[0] for row in connection.execute("SELECT file_path FROM files")]
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn("ghost.ts", fts_paths)
        self.assertNotIn("old.ts", file_paths)
        for legacy in ("bm25_vocab",):
            self.assertNotIn(legacy, tables)
        for path in fts_paths:
            self.assertIn(path, file_paths, "no orphan fts_chunks rows")
        self.assertGreater(stats["indexed"], 0)

    def test_constructor_failure_leaves_no_partial_state(self):
        with mock.patch.object(
            index_module, "SQLiteFTSStore", side_effect=RuntimeError("connect boom")
        ):
            with self.assertRaises(RuntimeError):
                index_codebase(self.root)
        self.assertFalse(self.db_path.exists())

    def test_force_rebuild_failure_rolls_back(self):
        index_codebase(self.root)
        with closing(sqlite3.connect(self.db_path)) as connection:
            before_files = dict(connection.execute("SELECT file_path, file_hash FROM files").fetchall())
            before_count = connection.execute("SELECT COUNT(*) FROM fts_chunks").fetchone()[0]
        self.assertTrue(before_files)

        class FlakyConn:
            """Proxy that fails the force_rebuild files wipe mid-pass."""

            def __init__(self, real):
                self._real = real

            def __getattr__(self, name):
                return getattr(self._real, name)

            def execute(self, sql, *args, **kwargs):
                if isinstance(sql, str) and sql.startswith("DELETE FROM files"):
                    raise RuntimeError("rebuild wipe boom")
                return self._real.execute(sql, *args, **kwargs)

        class FlakyStore(SQLiteFTSStore):
            def __init__(self, db_path):
                super().__init__(db_path)
                self.conn = FlakyConn(self.conn)

        with mock.patch.object(index_module, "SQLiteFTSStore", FlakyStore):
            with self.assertRaises(RuntimeError):
                index_codebase(self.root, force_rebuild=True)

        with closing(sqlite3.connect(self.db_path)) as connection:
            after_files = dict(connection.execute("SELECT file_path, file_hash FROM files").fetchall())
            after_count = connection.execute("SELECT COUNT(*) FROM fts_chunks").fetchone()[0]
            fts_paths = {row[0] for row in connection.execute("SELECT DISTINCT file_path FROM fts_chunks")}
        self.assertEqual(after_files, before_files)
        self.assertEqual(after_count, before_count)
        for path in fts_paths:
            self.assertIn(path, after_files, "no orphan fts_chunks rows")

        # No leaked handle: a retry works on the same database.
        stats = index_codebase(self.root)
        self.assertGreaterEqual(stats["indexed"], 0)


if __name__ == "__main__":
    unittest.main()
