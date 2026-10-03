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

            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_doi ON dergipark_articles(doi);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_journal ON dergipark_articles(journal);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_year ON dergipark_articles(year);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_dp_shard ON dergipark_articles(shard_name);")
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
