#!/usr/bin/env python3
"""
DOAJ Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of harvested open access articles,
journals, subject classifications, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_DOAJ_DB = "data/catalogs/doaj_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class DoajLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for DOAJ open access articles.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_DOAJ_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_doaj_tables()

    def _init_doaj_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS doaj_articles (
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
                CREATE TABLE IF NOT EXISTS doaj_subjects (
                    subject TEXT PRIMARY KEY,
                    article_count INTEGER DEFAULT 0
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_doaj_doi ON doaj_articles(doi);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_doaj_journal ON doaj_articles(journal);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_doaj_year ON doaj_articles(year);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_doaj_shard ON doaj_articles(shard_name);")
            conn.commit()

    def index_article(self, record: Dict[str, Any], shard_name: Optional[str] = None) -> None:
        """Inserts or updates a single DOAJ article record and updates subject counts."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        article_id = str(record["id"]).strip()
        doi = str(record.get("doi") or "").strip()
        subjects_str = str(record.get("subjects") or "").strip()

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO doaj_articles (
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
                    shard_name = COALESCE(excluded.shard_name, doaj_articles.shard_name);
                """,
                (
                    article_id,
                    doi,
                    record.get("title") or "",
                    record.get("journal") or "",
                    record.get("publisher") or "",
                    record.get("issn") or "",
                    record.get("language") or "EN",
                    int(record.get("year") or 0),
                    record.get("authors") or "",
                    record.get("affiliations") or "",
                    record.get("keywords") or "",
                    subjects_str,
                    record.get("fulltext_url") or "",
                    int(record.get("char_count") or 0),
                    int(record.get("word_count") or 0),
                    shard_name,
                    now,
                ),
            )

            # Update subject counters
            if subjects_str:
                for subj in [s.strip() for s in subjects_str.split(",") if s.strip()]:
                    conn.execute(
                        """
                        INSERT INTO doaj_subjects (subject, article_count)
                        VALUES (?, 1)
                        ON CONFLICT(subject) DO UPDATE SET
                            article_count = article_count + 1;
                        """,
                        (subj,),
                    )
            conn.commit()

    def index_articles_batch(
        self, records: List[Dict[str, Any]], shard_name: Optional[str] = None
    ) -> int:
        """Batch indexes multiple article records in a single transaction."""
        for rec in records:
            self.index_article(rec, shard_name=shard_name)
        return len(records)

    def get_article(self, article_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a DOAJ article by ID from the local SQLite catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM doaj_articles WHERE id = ?;", (str(article_id).strip(),))
            row = cur.fetchone()
            if not row:
                return None
            return dict(row)

    def get_article_by_doi(self, doi: str) -> Optional[Dict[str, Any]]:
        """Retrieves a DOAJ article by DOI from the local SQLite catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM doaj_articles WHERE doi = ?;", (str(doi).strip(),))
            row = cur.fetchone()
            if not row:
                return None
            return dict(row)

    def get_article_count(self) -> int:
        """Returns total unique indexed DOAJ articles."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as count FROM doaj_articles;")
            row = cur.fetchone()
            return row["count"] if row else 0

    def get_subject_stats(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns subject terms with article counts."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT subject, article_count
                FROM doaj_subjects
                ORDER BY article_count DESC
                LIMIT ?;
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
