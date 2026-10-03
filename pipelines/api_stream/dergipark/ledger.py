#!/usr/bin/env python3
"""
DergiPark Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of harvested DergiPark articles,
journals, subject classifications, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_DERGIPARK_DB = "data/catalogs/dergipark_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class DergiParkLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for DergiPark articles.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_DERGIPARK_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_dergipark_tables()

    def _init_dergipark_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS dergipark_articles (
                    id TEXT PRIMARY KEY,
                    doi TEXT,
                    title TEXT,
                    journal TEXT,
                    publisher TEXT,
                    issn TEXT,
                    language TEXT,
                    year INTEGER,
                    authors TEXT,
                    affiliations TEXT,
                    keywords TEXT,
                    subjects TEXT,
                    fulltext_url TEXT,
                    char_count INTEGER,
                    word_count INTEGER,
                    shard_name TEXT,
                    status TEXT DEFAULT 'indexed' CHECK(status IN ('indexed', 'sharded', 'failed')),
                    created_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS dergipark_journals (
                    journal TEXT PRIMARY KEY,
                    article_count INTEGER DEFAULT 0
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS dergipark_subjects (
                    subject TEXT PRIMARY KEY,
                    article_count INTEGER DEFAULT 0
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS dergipark_partitions (
                    partition_id TEXT PRIMARY KEY,
                    from_date TEXT,
                    until_date TEXT,
                    set_spec TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
                    resumption_token TEXT,
                    raw_count INTEGER DEFAULT 0,
                    clean_count INTEGER DEFAULT 0,
                    new_count INTEGER DEFAULT 0,
                    started_at TEXT,
                    completed_at TEXT
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_doi ON dergipark_articles(doi);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_journal ON dergipark_articles(journal);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_year ON dergipark_articles(year);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_shard ON dergipark_articles(shard_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_part_status ON dergipark_partitions(status);")

            # Dynamic migration for full-text PDF status tracking
            cur.execute("PRAGMA table_info(dergipark_articles);")
            existing_cols = {col[1] for col in cur.fetchall()}
            if "pdf_status" not in existing_cols:
                cur.execute("ALTER TABLE dergipark_articles ADD COLUMN pdf_status TEXT DEFAULT 'pending';")
            if "pdf_direct_url" not in existing_cols:
                cur.execute("ALTER TABLE dergipark_articles ADD COLUMN pdf_direct_url TEXT;")
            if "page_count" not in existing_cols:
                cur.execute("ALTER TABLE dergipark_articles ADD COLUMN page_count INTEGER DEFAULT 0;")
            if "extracted_at" not in existing_cols:
                cur.execute("ALTER TABLE dergipark_articles ADD COLUMN extracted_at TEXT;")
            if "pdf_shard_name" not in existing_cols:
                cur.execute("ALTER TABLE dergipark_articles ADD COLUMN pdf_shard_name TEXT;")

            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_pdf_status ON dergipark_articles(pdf_status);")
            conn.commit()

    def index_article(self, record: Dict[str, Any], shard_name: Optional[str] = None) -> None:
        """Inserts or updates a single DergiPark article and updates counters."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        article_id = str(record["id"]).strip()
        doi = str(record.get("doi") or "").strip()
        journal_str = str(record.get("journal") or "").strip()
        keywords_str = str(record.get("keywords") or "").strip()

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO dergipark_articles (
                    id, doi, title, journal, publisher, issn, language, year,
                    authors, affiliations, keywords, subjects, fulltext_url,
                    char_count, word_count, shard_name, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?)
                ON CONFLICT(id) DO UPDATE SET
                    doi = excluded.doi,
                    title = excluded.title,
                    journal = excluded.journal,
                    publisher = excluded.publisher,
                    issn = excluded.issn,
                    language = excluded.language,
                    year = excluded.year,
                    authors = excluded.authors,
                    affiliations = excluded.affiliations,
                    keywords = excluded.keywords,
                    subjects = excluded.subjects,
                    fulltext_url = excluded.fulltext_url,
                    char_count = excluded.char_count,
                    word_count = excluded.word_count,
                    shard_name = COALESCE(excluded.shard_name, dergipark_articles.shard_name);
                """,
                (
                    article_id,
                    doi,
                    record.get("title") or "",
                    journal_str,
                    record.get("publisher") or "",
                    record.get("issn") or "",
                    record.get("language") or "tr",
                    int(record.get("year") or 0),
                    record.get("authors") or "",
                    record.get("affiliations") or "",
                    keywords_str,
                    record.get("subjects") or "",
                    record.get("fulltext_url") or "",
                    int(record.get("char_count") or 0),
                    int(record.get("word_count") or 0),
                    shard_name,
                    now,
                ),
            )

            # Update journal counter
            if journal_str:
                conn.execute(
                    """
                    INSERT INTO dergipark_journals (journal, article_count)
                    VALUES (?, 1)
                    ON CONFLICT(journal) DO UPDATE SET
                        article_count = article_count + 1;
                    """,
                    (journal_str,),
                )

            # Update keyword/subject counters
            if keywords_str:
                for kw in [k.strip() for k in keywords_str.split(",") if k.strip()]:
                    conn.execute(
                        """
                        INSERT INTO dergipark_subjects (subject, article_count)
                        VALUES (?, 1)
                        ON CONFLICT(subject) DO UPDATE SET
                            article_count = article_count + 1;
                        """,
                        (kw,),
                    )

            conn.commit()

    def get_article(self, article_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a DergiPark article by ID from the local SQLite catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM dergipark_articles WHERE id = ?;", (str(article_id).strip(),))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_article_count(self) -> int:
        """Returns total unique indexed DergiPark articles."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as count FROM dergipark_articles;")
            row = cur.fetchone()
            return row["count"] if row else 0

    def get_journal_stats(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns top journals with article counts."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT journal, article_count
                FROM dergipark_journals
                ORDER BY article_count DESC
                LIMIT ?;
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

    def has_article(self, article_id: str) -> bool:
        """Fast existence check for an article by primary key."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM dergipark_articles WHERE id = ? LIMIT 1;", (str(article_id).strip(),))
            return cur.fetchone() is not None

    def load_existing_ids(self) -> set:
        """Loads all indexed article IDs into an in-memory set for O(1) deduplication."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM dergipark_articles;")
            return {row["id"] for row in cur.fetchall()}

    def init_partition(
        self,
        partition_id: str,
        from_date: Optional[str] = None,
        until_date: Optional[str] = None,
        set_spec: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Initializes or returns an existing partition record."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO dergipark_partitions (
                    partition_id, from_date, until_date, set_spec, status
                ) VALUES (?, ?, ?, ?, 'pending')
                ON CONFLICT(partition_id) DO NOTHING;
                """,
                (partition_id, from_date, until_date, set_spec),
            )
            conn.commit()

        part = self.get_partition(partition_id)
        return part if part is not None else {}

    def start_partition(self, partition_id: str) -> None:
        """Marks a partition as running and records started_at timestamp."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_partitions
                SET status = 'running',
                    started_at = COALESCE(started_at, ?)
                WHERE partition_id = ?;
                """,
                (now, partition_id),
            )
            conn.commit()

    def update_partition_progress(
        self,
        partition_id: str,
        resumption_token: Optional[str],
        raw_count: int,
        clean_count: int,
        new_count: int,
    ) -> None:
        """Updates in-flight partition progress counters and resumptionToken checkpoint."""
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_partitions
                SET resumption_token = ?,
                    raw_count = ?,
                    clean_count = ?,
                    new_count = ?
                WHERE partition_id = ?;
                """,
                (resumption_token, raw_count, clean_count, new_count, partition_id),
            )
            conn.commit()

    def complete_partition(
        self,
        partition_id: str,
        raw_count: int,
        clean_count: int,
        new_count: int,
    ) -> None:
        """Marks a partition as completed, purges resumption token and sets completed_at."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_partitions
                SET status = 'completed',
                    resumption_token = NULL,
                    raw_count = ?,
                    clean_count = ?,
                    new_count = ?,
                    completed_at = ?
                WHERE partition_id = ?;
                """,
                (raw_count, clean_count, new_count, now, partition_id),
            )
            conn.commit()

    def fail_partition(
        self,
        partition_id: str,
        resumption_token: Optional[str] = None,
    ) -> None:
        """Marks a partition as failed while preserving resumption token for retry."""
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_partitions
                SET status = 'failed',
                    resumption_token = COALESCE(?, resumption_token)
                WHERE partition_id = ?;
                """,
                (resumption_token, partition_id),
            )
            conn.commit()

    def get_partition(self, partition_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves single partition metadata by partition_id."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM dergipark_partitions WHERE partition_id = ?;", (partition_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_partitions(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists partitions, optionally filtered by status ('pending', 'running', 'completed', 'failed')."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            if status:
                cur.execute(
                    "SELECT * FROM dergipark_partitions WHERE status = ? ORDER BY from_date ASC;",
                    (status,),
                )
            else:
                cur.execute("SELECT * FROM dergipark_partitions ORDER BY from_date ASC;")
            return [dict(r) for r in cur.fetchall()]

    def get_pending_pdf_articles(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieves articles that have a valid fulltext_url but pending PDF extraction."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, title, journal, year, language, doi, fulltext_url
                FROM dergipark_articles
                WHERE fulltext_url IS NOT NULL 
                  AND fulltext_url != ''
                  AND (pdf_status IS NULL OR pdf_status = 'pending')
                ORDER BY year DESC, id ASC
                LIMIT ?;
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

    def mark_pdf_extracted(
        self,
        article_id: str,
        pdf_url: str,
        page_count: int,
        char_count: int,
        word_count: int,
        shard_name: Optional[str] = None,
    ) -> None:
        """Marks article PDF as successfully extracted with metadata and char counts."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_articles
                SET pdf_status = 'extracted',
                    pdf_direct_url = ?,
                    page_count = ?,
                    char_count = ?,
                    word_count = ?,
                    extracted_at = ?,
                    pdf_shard_name = COALESCE(?, pdf_shard_name)
                WHERE id = ?;
                """,
                (pdf_url, page_count, char_count, word_count, now, shard_name, str(article_id).strip()),
            )
            conn.commit()

    def mark_pdf_failed(
        self,
        article_id: str,
        status: str = "failed",
        pdf_url: Optional[str] = None,
    ) -> None:
        """Marks article PDF as failed, skipped, or too large."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE dergipark_articles
                SET pdf_status = ?,
                    pdf_direct_url = COALESCE(?, pdf_direct_url),
                    extracted_at = ?
                WHERE id = ?;
                """,
                (status, pdf_url, now, str(article_id).strip()),
            )
            conn.commit()

    def get_pdf_stats(self) -> Dict[str, int]:
        """Returns distribution of PDF extraction statuses across catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT COALESCE(pdf_status, 'pending') as pdf_stat, COUNT(*) as count
                FROM dergipark_articles
                GROUP BY pdf_status;
                """
            )
            return {row["pdf_stat"]: row["count"] for row in cur.fetchall()}


    def get_next_fulltext_part_index(self, prefix: str = "dergipark_fulltext") -> int:
        """Returns next available partition index for full-text shards based on existing recorded shards."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT MAX(part_index) as max_idx FROM shards WHERE shard_name LIKE ?;",
                (f"{prefix}%",),
            )
            row = cur.fetchone()
            if row and row["max_idx"] is not None:
                return int(row["max_idx"]) + 1
            return 0



