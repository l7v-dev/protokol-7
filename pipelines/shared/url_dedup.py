"""Restart-safe exact URL receipts; these never replace source verification ledgers."""
import hashlib
import sqlite3
from threading import RLock


class DiskUrlDedup:
    def __init__(self, db_path):
        self._lock = RLock()
        self._connection = sqlite3.connect(db_path, check_same_thread=False)
        self._connection.execute('PRAGMA journal_mode=WAL')
        self._connection.execute('CREATE TABLE IF NOT EXISTS seen_urls (fingerprint BLOB PRIMARY KEY) WITHOUT ROWID')
        self._connection.commit()

    def _fingerprint(self, url):
        if not isinstance(url, str) or not url:
            raise ValueError("URL must be non-empty")
        return hashlib.sha256(url.encode('utf-8')).digest()

    def is_seen(self, url):
        with self._lock:
            return self._connection.execute('SELECT 1 FROM seen_urls WHERE fingerprint=?', (self._fingerprint(url),)).fetchone() is not None

    def mark_seen(self, url):
        with self._lock, self._connection:
            self._connection.execute('INSERT OR IGNORE INTO seen_urls VALUES (?)', (self._fingerprint(url),))

    def close(self):
        with self._lock:
            self._connection.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
