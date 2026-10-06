#!/usr/bin/env python3
"""
Aperta Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of harvested Aperta open science records,
datasets, files manifest, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import json
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_APERTA_DB = "data/catalogs/aperta_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class ApertaLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for TUBITAK ULAKBIM Aperta.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_APERTA_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_aperta_tables()

    def _init_aperta_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS aperta_records (
                    id TEXT PRIMARY KEY,
                    doi TEXT,
                    title TEXT,
                    creators TEXT,
                    description TEXT,
                    publisher TEXT,
                    publication_date TEXT,
                    resource_type TEXT,
                    language TEXT,
                    keywords TEXT,
                    subjects TEXT,
                    rights TEXT,
                    file_count INTEGER DEFAULT 0,
                    total_file_size INTEGER DEFAULT 0,
                    files_json TEXT,
                    char_count INTEGER,
                    word_count INTEGER,
                    shard_name TEXT,
                    status TEXT DEFAULT 'indexed' CHECK(status IN ('indexed', 'sharded', 'failed')),
                    created_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS aperta_files (
                    file_id TEXT PRIMARY KEY,
                    record_id TEXT,
                    key TEXT,
                    size INTEGER,
                    checksum TEXT,
                    download_url TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloaded', 'archived', 'failed', 'skipped')),
                    created_at TEXT,
                    FOREIGN KEY (record_id) REFERENCES aperta_records(id) ON DELETE CASCADE
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS aperta_resumption (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    token TEXT,
                    cursor INTEGER DEFAULT 0,
                    total INTEGER DEFAULT 0,
                    updated_at TEXT
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_aperta_doi ON aperta_records(doi);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_aperta_type ON aperta_records(resource_type);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_aperta_date ON aperta_records(publication_date);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_aperta_status ON aperta_records(status);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_aperta_files_record ON aperta_files(record_id);")
            columns = {row[1] for row in cur.execute('PRAGMA table_info(aperta_files)')}
            if 'archive_shard_name' not in columns:
                cur.execute('ALTER TABLE aperta_files ADD COLUMN archive_shard_name TEXT')
            conn.commit()

    def recover_unsealed_assets(self) -> int:
        """Recover mapped writes; unmapped legacy archived rows require an audit."""
        with self._get_conn() as conn:
            with conn:
                conn.execute("""UPDATE aperta_files SET status='archived'
                    WHERE status='downloaded' AND archive_shard_name IS NOT NULL
                    AND EXISTS (SELECT 1 FROM shards WHERE shard_name=archive_shard_name)""")
                return conn.execute("""UPDATE aperta_files SET status='pending',archive_shard_name=NULL
                    WHERE status IN ('downloaded','archived') AND archive_shard_name IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM shards WHERE shard_name=archive_shard_name)""").rowcount

    def mark_archive_sealed(self, shard_name: str):
        with self._get_conn() as conn:
            with conn:
                conn.execute("""UPDATE aperta_files SET status='archived'
                    WHERE archive_shard_name=? AND status='downloaded'
                    AND EXISTS (SELECT 1 FROM shards WHERE shard_name=?)""", (shard_name, shard_name))

    def upsert_record(self, record: Dict[str, Any]) -> bool:
        """Inserts or replaces an Aperta record transactionally."""
        return self.upsert_records([record]) == 1

    def upsert_records(self, records: List[Dict[str, Any]]) -> int:
        """Batch inserts or updates Aperta records and extracts files into aperta_files."""
        if not records:
            return 0

        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        inserted = 0

        with self._get_conn() as conn:
            cur = conn.cursor()
            for r in records:
                rec_id = str(r["id"])
                cur.execute(
                    """
                    INSERT INTO aperta_records (
                        id, doi, title, creators, description, publisher,
                        publication_date, resource_type, language, keywords,
                        subjects, rights, file_count, total_file_size, files_json,
                        char_count, word_count, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?)
                    ON CONFLICT(id) DO UPDATE SET
                        doi=excluded.doi,
                        title=excluded.title,
                        creators=excluded.creators,
                        description=excluded.description,
                        publisher=excluded.publisher,
                        publication_date=excluded.publication_date,
                        resource_type=excluded.resource_type,
                        language=excluded.language,
                        keywords=excluded.keywords,
                        subjects=excluded.subjects,
                        rights=excluded.rights,
                        file_count=excluded.file_count,
                        total_file_size=excluded.total_file_size,
                        files_json=excluded.files_json,
                        char_count=excluded.char_count,
                        word_count=excluded.word_count,
                        status='indexed',
                        shard_name=NULL
                    """,
                    (
                        rec_id,
                        r.get("doi", ""),
                        r.get("title", ""),
                        r.get("creators", ""),
                        r.get("description", ""),
                        r.get("publisher", "TUBITAK ULAKBIM"),
                        r.get("publication_date", ""),
                        r.get("resource_type", ""),
                        r.get("language", "unknown"),
                        r.get("keywords", "[]"),
                        r.get("subjects", "[]"),
                        r.get("rights", ""),
                        int(r.get("file_count") or 0),
                        int(r.get("total_file_size") or 0),
                        r.get("files_json", "[]"),
                        int(r.get("char_count") or 0),
                        int(r.get("word_count") or 0),
                        now_str,
                    ),
                )
                inserted += 1

                # If files are present in files_json, index them into aperta_files
                files_raw = r.get("files_json")
                if files_raw and files_raw != "[]":
                    try:
                        parsed_files = json.loads(files_raw)
                        for f in parsed_files:
                            f_id = f.get("id") or f"{rec_id}_{f.get('key')}"
                            cur.execute(
                                """
                                INSERT OR IGNORE INTO aperta_files (
                                    file_id, record_id, key, size, checksum,
                                    download_url, status, created_at
                                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
                                """,
                                (
                                    f_id,
                                    rec_id,
                                    f.get("key", ""),
                                    int(f.get("size") or 0),
                                    f.get("checksum", ""),
                                    f.get("download_url", ""),
                                    now_str,
                                ),
                            )
                    except Exception:
                        pass

            conn.commit()

        # Update central catalog count if available
        try:
            self._sync_central_catalog()
        except Exception:
            pass

        return inserted

    def mark_sharded(self, record_ids: List[str], shard_name: str) -> None:
        """Marks a batch of records as packed into a specific Parquet shard."""
        if not record_ids:
            return

        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.executemany(
                "UPDATE aperta_records SET status = 'sharded', shard_name = ? WHERE id = ?",
                [(shard_name, str(rid)) for rid in record_ids],
            )
            conn.commit()

    def save_resumption_token(self, token: Optional[str], cursor: int = 0, total: int = 0) -> None:
        """Stores checkpoint resumptionToken in SQLite."""
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO aperta_resumption (id, token, cursor, total, updated_at)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    token=excluded.token,
                    cursor=excluded.cursor,
                    total=excluded.total,
                    updated_at=excluded.updated_at
                """,
                (token or "", cursor, total, now_str),
            )
            conn.commit()

    def get_resumption_token(self) -> Optional[Dict[str, Any]]:
        """Retrieves last stored checkpoint resumptionToken."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT token, cursor, total, updated_at FROM aperta_resumption WHERE id = 1")
            row = cur.fetchone()
            if row and row["token"]:
                return {
                    "token": row["token"],
                    "cursor": row["cursor"],
                    "total": row["total"],
                    "updated_at": row["updated_at"],
                }
        return None

    def get_unsharded_records(self, limit: int = 50000) -> List[Dict[str, Any]]:
        """Fetches records that have been indexed but not yet packaged into Parquet."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, doi, title, creators, description, publisher,
                       publication_date, resource_type, language, keywords,
                       subjects, rights, file_count, total_file_size, files_json,
                       char_count, word_count
                FROM aperta_records
                WHERE status = 'indexed'
                LIMIT ?
                """,
                (limit,),
            )
            rows = cur.fetchall()
            return [dict(r) for r in rows]

    def get_stats(self) -> Dict[str, Any]:
        """Provides comprehensive repository statistics from the ledger."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) AS total FROM aperta_records")
            total_records = cur.fetchone()["total"]

            cur.execute("SELECT COUNT(*) AS sharded FROM aperta_records WHERE status = 'sharded'")
            sharded_records = cur.fetchone()["sharded"]

            cur.execute("SELECT COUNT(*) AS indexed FROM aperta_records WHERE status = 'indexed'")
            indexed_records = cur.fetchone()["indexed"]

            cur.execute("SELECT COUNT(*) AS total_files, COALESCE(SUM(size), 0) AS total_bytes FROM aperta_files")
            file_stats = cur.fetchone()
            total_files = file_stats["total_files"]
            total_bytes = file_stats["total_bytes"]

            cur.execute("SELECT COUNT(*) AS total_shards, COALESCE(SUM(byte_size), 0) AS shard_bytes FROM shards")
            shard_stats = cur.fetchone()

            token_info = self.get_resumption_token()

            return {
                "total_records": total_records,
                "sharded_records": sharded_records,
                "indexed_records": indexed_records,
                "total_files": total_files,
                "total_bytes": total_bytes,
                "total_shards": shard_stats["total_shards"],
                "shard_bytes": shard_stats["shard_bytes"],
                "resumption_token": token_info.get("token") if token_info else None,
                "harvest_cursor": token_info.get("cursor") if token_info else 0,
                "harvest_total": token_info.get("total") if token_info else 0,
            }

    def _sync_central_catalog(self) -> None:
        """Syncs dataset summary row into data/catalog.sqlite datasets table if present."""
        if not os.path.exists(self.central_db_path):
            return

        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) AS c, COALESCE(SUM(char_count), 0) AS chars FROM aperta_records")
            row = cur.fetchone()
            record_count = row["c"]
            char_count = row["chars"]

        with self._get_conn(self.central_db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS datasets (
                    name TEXT PRIMARY KEY,
                    item_count INTEGER DEFAULT 0,
                    token_count INTEGER DEFAULT 0,
                    size_bytes INTEGER DEFAULT 0,
                    last_updated TEXT
                );
                """
            )
            now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cur.execute(
                """
                INSERT INTO datasets (name, item_count, token_count, size_bytes, last_updated)
                VALUES ('aperta', ?, ?, 0, ?)
                ON CONFLICT(name) DO UPDATE SET
                    item_count=excluded.item_count,
                    token_count=excluded.token_count,
                    last_updated=excluded.last_updated
                """,
                (record_count, int(char_count / 4), now_str),
            )
            conn.commit()
