#!/usr/bin/env python3
"""
bioRxiv & medRxiv Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of harvested preprint articles,
categories, subject areas, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_BIORXIV_DB = "data/catalogs/biorxiv_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class BiorxivLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for bioRxiv & medRxiv preprints.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_BIORXIV_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_biorxiv_tables()

    def _init_biorxiv_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS biorxiv_articles (
                    doi TEXT PRIMARY KEY,
                    title TEXT,
                    server TEXT,
                    category TEXT,
                    pub_date TEXT,
                    pub_year INTEGER,
                    version INTEGER,
                    authors TEXT,
                    corresponding_author TEXT,
                    institution TEXT,
                    license TEXT,
                    published_doi TEXT,
                    abstract_len INTEGER,
                    text_len INTEGER,
                    shard_name TEXT,
                    status TEXT DEFAULT 'indexed' CHECK(status IN ('indexed', 'sharded', 'failed')),
                    created_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS biorxiv_categories (
                    category TEXT,
                    server TEXT,
                    article_count INTEGER DEFAULT 0,
                    PRIMARY KEY (category, server)
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_bx_cat ON biorxiv_articles(category);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_bx_server ON biorxiv_articles(server);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_bx_year ON biorxiv_articles(pub_year);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_bx_shard ON biorxiv_articles(shard_name);")
            conn.commit()

    def index_article(self, record: Dict[str, Any], shard_name: Optional[str] = None) -> None:
        """Inserts or updates a single preprint article record and updates category counts."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        doi = str(record["doi"]).strip()
        server = str(record.get("server") or "biorxiv").lower()
        category = str(record.get("category") or "general").lower()

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO biorxiv_articles (
                    doi, title, server, category, pub_date, pub_year, version,
                    authors, corresponding_author, institution, license, published_doi,
                    abstract_len, text_len, shard_name, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?)
                ON CONFLICT(doi) DO UPDATE SET
                    title = excluded.title,
                    server = excluded.server,
                    category = excluded.category,
                    pub_date = excluded.pub_date,
                    pub_year = excluded.pub_year,
                    version = excluded.version,
                    authors = excluded.authors,
                    corresponding_author = excluded.corresponding_author,
                    institution = excluded.institution,
                    license = excluded.license,
                    published_doi = excluded.published_doi,
                    abstract_len = excluded.abstract_len,
                    text_len = excluded.text_len,
                    shard_name = COALESCE(excluded.shard_name, biorxiv_articles.shard_name);
                """,
                (
                    doi,
                    record.get("title") or "",
                    server,
                    category,
                    record.get("pub_date") or "",
                    int(record.get("pub_year") or 0),
                    int(record.get("version") or 1),
                    record.get("authors") or "",
                    record.get("corresponding_author") or "",
                    record.get("institution") or "",
                    record.get("license") or "",
                    record.get("published_doi") or "",
                    len(record.get("abstract") or ""),
                    len(record.get("text") or ""),
                    shard_name,
                    now,
                ),
            )

            # Update category counter
            conn.execute(
                """
                INSERT INTO biorxiv_categories (category, server, article_count)
                VALUES (?, ?, 1)
                ON CONFLICT(category, server) DO UPDATE SET
                    article_count = (
                        SELECT COUNT(*) FROM biorxiv_articles
                        WHERE category = excluded.category AND server = excluded.server
                    );
                """,
                (category, server),
            )
            conn.commit()

    def index_articles_batch(
        self, records: List[Dict[str, Any]], shard_name: Optional[str] = None
    ) -> int:
        """Batch indexes multiple article records in a single transaction."""
        for rec in records:
            self.index_article(rec, shard_name=shard_name)
        return len(records)

    def get_article(self, doi: str) -> Optional[Dict[str, Any]]:
        """Retrieves a preprint article by DOI from the local SQLite catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM biorxiv_articles WHERE doi = ?;", (str(doi).strip(),))
            row = cur.fetchone()
            if not row:
                return None
            return dict(row)

    def get_article_count(self, server: Optional[str] = None) -> int:
        """Returns total unique indexed preprint articles, optionally filtered by server."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            if server:
                cur.execute(
                    "SELECT COUNT(*) as count FROM biorxiv_articles WHERE server = ?;",
                    (server.lower(),),
                )
            else:
                cur.execute("SELECT COUNT(*) as count FROM biorxiv_articles;")
            row = cur.fetchone()
            return row["count"] if row else 0

    def get_category_stats(self, server: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns article counts grouped by category and server."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            if server:
                cur.execute(
                    """
                    SELECT category, server, article_count
                    FROM biorxiv_categories
                    WHERE server = ?
                    ORDER BY article_count DESC;
                    """,
                    (server.lower(),),
                )
            else:
                cur.execute(
                    """
                    SELECT category, server, article_count
                    FROM biorxiv_categories
                    ORDER BY article_count DESC;
                    """
                )
            return [dict(r) for r in cur.fetchall()]
