#!/usr/bin/env python3
"""
PubMed Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of harvested PubMed articles,
MeSH ontology descriptors, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_PUBMED_DB = "data/catalogs/pubmed_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class PubmedLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for PubMed biomedical corpus.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_PUBMED_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_pubmed_tables()

    def _init_pubmed_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pubmed_articles (
                    pmid TEXT PRIMARY KEY,
                    pmcid TEXT,
                    doi TEXT,
                    title TEXT,
                    journal TEXT,
                    pub_year INTEGER,
                    authors TEXT,
                    abstract_len INTEGER,
                    text_len INTEGER,
                    is_pmc_oa INTEGER DEFAULT 0,
                    shard_name TEXT,
                    status TEXT DEFAULT 'indexed' CHECK(status IN ('indexed', 'sharded', 'failed')),
                    created_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS pubmed_mesh_headings (
                    pmid TEXT,
                    descriptor_name TEXT,
                    is_major INTEGER DEFAULT 0,
                    PRIMARY KEY (pmid, descriptor_name)
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_pm_year ON pubmed_articles(pub_year);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_pm_shard ON pubmed_articles(shard_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_pm_pmcid ON pubmed_articles(pmcid);")
            conn.commit()

    def index_article(self, record: Dict[str, Any], shard_name: Optional[str] = None) -> None:
        """Inserts or updates a single article record and its MeSH headings."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        pmid = str(record["pmid"])
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO pubmed_articles (
                    pmid, pmcid, doi, title, journal, pub_year, authors,
                    abstract_len, text_len, is_pmc_oa, shard_name, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?)
                ON CONFLICT(pmid) DO UPDATE SET
                    pmcid = excluded.pmcid,
                    doi = excluded.doi,
                    title = excluded.title,
                    journal = excluded.journal,
                    pub_year = excluded.pub_year,
                    authors = excluded.authors,
                    abstract_len = excluded.abstract_len,
                    text_len = excluded.text_len,
                    is_pmc_oa = excluded.is_pmc_oa,
                    shard_name = COALESCE(excluded.shard_name, pubmed_articles.shard_name);
                """,
                (
                    pmid,
                    record.get("pmcid") or "",
                    record.get("doi") or "",
                    record.get("title") or "",
                    record.get("journal") or "",
                    int(record.get("pub_year") or 0),
                    record.get("authors") or "",
                    len(record.get("abstract") or ""),
                    len(record.get("text") or ""),
                    1 if record.get("is_pmc_oa") else 0,
                    shard_name,
                    now,
                ),
            )

            # Insert MeSH headings
            mesh_list = record.get("raw_mesh_list") or []
            for item in mesh_list:
                if isinstance(item, dict):
                    desc = item.get("name")
                    is_major = 1 if item.get("is_major") else 0
                else:
                    desc = str(item)
                    is_major = 0
                if desc:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO pubmed_mesh_headings (pmid, descriptor_name, is_major)
                        VALUES (?, ?, ?);
                        """,
                        (pmid, desc, is_major),
                    )
            conn.commit()

    def index_articles_batch(
        self, records: List[Dict[str, Any]], shard_name: Optional[str] = None
    ) -> int:
        """Batch indexes multiple article records in a single transaction."""
        for rec in records:
            self.index_article(rec, shard_name=shard_name)
        return len(records)

    def get_article(self, pmid: str) -> Optional[Dict[str, Any]]:
        """Retrieves an article by PMID from the local SQLite catalog."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM pubmed_articles WHERE pmid = ?;", (str(pmid),))
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)

            cur.execute("SELECT descriptor_name, is_major FROM pubmed_mesh_headings WHERE pmid = ?;", (str(pmid),))
            res["mesh_headings"] = [dict(m) for m in cur.fetchall()]
            return res

    def get_article_count(self) -> int:
        """Returns total unique indexed PubMed articles."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as count FROM pubmed_articles;")
            row = cur.fetchone()
            return row["count"] if row else 0
