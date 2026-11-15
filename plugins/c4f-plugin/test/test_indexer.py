import sys
import tempfile
import unittest
from pathlib import Path
import sqlite3
import contextlib
import io

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "src" / "modules" / "code-retrieval" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from index import index_codebase, main, search_code
from models import CodeChunk
from storage import SQLiteBM25Store


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

    def test_noop_resync_skips_everything(self):
        index_codebase(self.root)
        stats = index_codebase(self.root)

        self.assertEqual(stats["indexed"], 0)
        self.assertEqual(stats["skipped"], len(self.files))
        self.assertEqual(stats["removed"], 0)

    def test_changed_file_is_reindexed(self):
        index_codebase(self.root)
        self.files[0].write_text("# Changed document\n\nUpdated content.\n", encoding="utf-8")

        stats = index_codebase(self.root)

        self.assertEqual(stats["indexed"], 1)

    def test_deleted_file_is_removed(self):
        index_codebase(self.root)
        self.files[0].unlink()

        stats = index_codebase(self.root)

        self.assertEqual(stats["removed"], 1)

    def test_new_term_becomes_searchable(self):
        index_codebase(self.root)
        self.files[1].write_text(
            "export function freshlySearchableSymbol() { return 'distinctiveNewTerm'; }\n",
            encoding="utf-8",
        )
        index_codebase(self.root)

        hits = search_code("distinctiveNewTerm", root_dir=self.root)

        self.assertTrue(any(hit["symbol"] == "freshlySearchableSymbol" for hit in hits))

    def test_stored_paths_stay_relative(self):
        index_codebase(self.root)

        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            paths = [row[0] for row in connection.execute("SELECT file_path FROM files")]

        self.assertTrue(paths)
        for path in paths:
            self.assertFalse(Path(path).is_absolute())
            self.assertNotIn("\\", path)
            self.assertFalse(path.startswith(("./", "../")))

    def test_ignore_dirs_are_skipped(self):
        for directory in ("node_modules", "local"):
            ignored = self.root / directory / "ignored.ts"
            ignored.parent.mkdir(parents=True, exist_ok=True)
            ignored.write_text("export function ignoredSymbol() {}\n", encoding="utf-8")

        index_codebase(self.root)

        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            paths = [row[0] for row in connection.execute("SELECT file_path FROM files")]
        self.assertFalse(any(path.startswith("node_modules/") or path.startswith("local/") for path in paths))

    def test_noop_resync_skips_rebuild(self):
        index_codebase(self.root)
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            vocab_before = connection.execute("SELECT COUNT(*) FROM bm25_vocab").fetchone()[0]
            meta_before = connection.execute("SELECT COUNT(*) FROM bm25_meta").fetchone()[0]

        stats = index_codebase(self.root)

        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM bm25_vocab").fetchone()[0], vocab_before)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM bm25_meta").fetchone()[0], meta_before)
        self.assertFalse(stats["rebuilt"])

    def test_vocab_matches_postings_after_change(self):
        index_codebase(self.root)
        self.files[1].write_text(
            "export function changedVocabularySymbol() { return 'changedVocabularyTerm'; }\n",
            encoding="utf-8",
        )

        stats = index_codebase(self.root)

        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            vocab_count = connection.execute("SELECT COUNT(*) FROM bm25_vocab").fetchone()[0]
            posting_terms = connection.execute("SELECT COUNT(DISTINCT term) FROM bm25_postings").fetchone()[0]
            total_docs = int(connection.execute("SELECT value FROM bm25_meta WHERE key='total_docs'").fetchone()[0])
            chunk_count = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        self.assertTrue(stats["rebuilt"])
        self.assertEqual(vocab_count, posting_terms)
        self.assertEqual(total_docs, chunk_count)

    def test_missing_state_row_forces_one_rebuild(self):
        index_codebase(self.root)
        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute("DELETE FROM sync_meta WHERE key='vocab_state'")
            connection.commit()

        first = index_codebase(self.root)
        store = SQLiteBM25Store(self.db_path)
        try:
            state = store.vocab_state()
        finally:
            store.close()
        second = index_codebase(self.root)

        self.assertTrue(first["rebuilt"])
        self.assertEqual(state, "valid")
        self.assertFalse(second["rebuilt"])

    def test_rebuild_flag_forces_rebuild(self):
        index_codebase(self.root)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            exit_code = main(["index", "--root", str(self.root), "--json", "--rebuild"])

        self.assertEqual(exit_code, 0)
        self.assertTrue(__import__("json").loads(stdout.getvalue())["rebuilt"])

    def test_rollback_keeps_vocab_consistent(self):
        index_codebase(self.root)
        store = SQLiteBM25Store(self.db_path)
        try:
            store.upsert_file_chunks(
                "aborted.ts",
                "ts",
                "temporary-hash",
                [CodeChunk("abortedSymbol", "function_declaration", 1, 1, "aborted content")],
            )
        finally:
            store.close()

        with contextlib.closing(sqlite3.connect(self.db_path)) as connection:
            state = connection.execute("SELECT value FROM sync_meta WHERE key='vocab_state'").fetchone()[0]
            aborted_file = connection.execute(
                "SELECT COUNT(*) FROM files WHERE file_path='aborted.ts'"
            ).fetchone()[0]
            vocab_count = connection.execute("SELECT COUNT(*) FROM bm25_vocab").fetchone()[0]
            posting_terms = connection.execute("SELECT COUNT(DISTINCT term) FROM bm25_postings").fetchone()[0]
        self.assertEqual(state, "valid")
        self.assertEqual(aborted_file, 0)
        self.assertEqual(vocab_count, posting_terms)

    def test_writer_sets_busy_timeout(self):
        store = SQLiteBM25Store(self.db_path)
        try:
            timeout = store.conn.execute("PRAGMA busy_timeout").fetchone()[0]
        finally:
            store.close()

        self.assertEqual(timeout, 5000)


if __name__ == "__main__":
    unittest.main()
