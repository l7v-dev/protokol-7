import hashlib
import json
import tempfile
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch

from pipelines.cdc.openalex.downloader import DeltaClient, DeltaError
from pipelines.cdc.openalex.ledger import DeltaLedger, STREAM
from pipelines.cdc.openalex.orchestrator import persist_page, run_delta

SINCE, UNTIL = "2025-01-02T00:00:00Z", "2025-01-03T00:00:00Z"


def work(identifier="W1", updated="2025-01-02T12:00:00Z", title="fixture"):
    return {"id": "https://openalex.org/" + identifier, "updated_date": updated, "display_name": title}


def page(records, cursor=None):
    return {"results": records, "meta": {"next_cursor": cursor}}


class DeltaTests(unittest.TestCase):
    def test_page_budget_preserves_window_and_reopen_finishes_it(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            first = run_delta(ledger, lambda window: page([work()], "next"), directory, SINCE, UNTIL, max_pages=1, delay_seconds=0)
            self.assertEqual(first["status"], "partial")
            checkpoint = ledger.get_cursor(STREAM)
            self.assertEqual(checkpoint["window"]["cursor"], "next")
            reopened = DeltaLedger(ledger.db_path)
            seen = []
            def fetch(window):
                seen.append(dict(window))
                return page([work("W2")])
            final = run_delta(reopened, fetch, directory, SINCE, "2025-02-01T00:00:00Z", delay_seconds=0)
            self.assertEqual(final["status"], "success")
            self.assertEqual(seen[0]["to"], checkpoint["window"]["to"])
            self.assertEqual(final["watermark"], "2025-01-03T00:00:00.000000Z")
            with ledger._get_conn() as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM delta_works").fetchone()[0], 2)
            self.assertFalse(Path(ledger.central_db_path).is_file() and ledger.central_db_path.startswith(directory))

    def test_raw_write_failure_or_invalid_page_does_not_advance(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            before = ledger.open_window(SINCE, UNTIL)
            with patch("pipelines.cdc.openalex.orchestrator.persist_page", side_effect=OSError("disk fixture")):
                with self.assertRaises(OSError):
                    run_delta(ledger, lambda window: page([work()]), directory, SINCE, UNTIL)
            self.assertEqual(ledger.get_cursor(STREAM), before)
            with self.assertRaises(ValueError):
                run_delta(ledger, lambda window: page([work(updated="2024-01-01")]), directory, SINCE, UNTIL)
            self.assertEqual(ledger.get_cursor(STREAM), before)
            with ledger._get_conn() as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM delta_works").fetchone()[0], 0)

    def test_conflicting_page_commit_rolls_back_and_latest_version_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            state = ledger.open_window(SINCE, UNTIL)
            payload = page([work()], "next")
            path, digest = persist_page(directory, state, payload)
            later = ledger.commit_page(state, payload["results"], "next", path, digest)
            with self.assertRaises(ValueError):
                ledger.commit_page(state, payload["results"], "other", path, digest)
            self.assertEqual(ledger.get_cursor(STREAM), later)
            older = page([work(updated="2025-01-02T11:00:00Z", title="older")])
            older_path, older_digest = persist_page(directory, later, older)
            ledger.commit_page(later, older["results"], None, older_path, older_digest)
            with ledger._get_conn() as conn:
                row = conn.execute("SELECT record_json, pii_status FROM delta_works").fetchone()
                self.assertEqual(json.loads(row[0])["display_name"], "fixture")
                self.assertEqual(row[1], "unchecked")

    def test_durable_artifact_checksum_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            state = ledger.open_window(SINCE, UNTIL)
            path, digest = persist_page(directory, state, page([work()]))
            Path(path).write_text("corrupt")
            with self.assertRaises(ValueError):
                ledger.commit_page(state, [work()], None, path, digest)
            self.assertEqual(ledger.get_cursor(STREAM), state)

    def test_sql_failure_rolls_back_work_and_cursor(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            before = ledger.open_window(SINCE, UNTIL)
            with ledger._get_conn() as conn:
                conn.execute("CREATE TRIGGER fail_page BEFORE INSERT ON delta_pages BEGIN SELECT RAISE(ABORT, 'page fixture failure'); END;")
                conn.commit()
            with self.assertRaises(sqlite3.Error):
                run_delta(ledger, lambda window: page([work()]), directory, SINCE, UNTIL)
            self.assertEqual(ledger.get_cursor(STREAM), before)
            with ledger._get_conn() as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM delta_works").fetchone()[0], 0)

    def test_new_directory_parent_entries_are_synced(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = DeltaLedger(str(Path(directory) / "ledger.sqlite"))
            state = ledger.open_window(SINCE, UNTIL)
            with patch("pipelines.cdc.openalex.orchestrator.fsync_directory") as synced:
                persist_page(directory, state, page([work()]))
            parents = {str(call.args[0]) for call in synced.call_args_list}
            self.assertIn(str(Path(directory)), parents)
            self.assertIn(str(Path(directory) / "raw"), parents)
            self.assertIn(str(Path(directory) / "raw/openalex"), parents)

    def test_trickling_response_stops_at_deadline_with_shorter_read_timeouts(self):
        clock = [0.0]
        timeouts = []
        class Transport:
            def settimeout(self, value):
                timeouts.append(value)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read1(self, size):
                clock[0] += 0.6
                return b" "
        class Connection:
            sock = Transport()
            def __init__(self, *args, **kwargs): pass
            def connect(self): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        with patch("pipelines.cdc.openalex.downloader.time.monotonic", side_effect=lambda: clock[0]), patch("pipelines.cdc.openalex.downloader.http.client.HTTPSConnection", Connection):
            client = DeltaClient("fixture-key", max_seconds=1)
            with self.assertRaisesRegex(DeltaError, "time budget"):
                client.fetch_page({"from": SINCE, "to": UNTIL, "cursor": "*"})
        self.assertAlmostEqual(timeouts[-2], 1.0)
        self.assertAlmostEqual(timeouts[-1], 0.4)

    def test_absolute_deadline_interrupts_slow_response_headers(self):
        import threading
        import time
        released = threading.Event()
        class Transport:
            def settimeout(self, value): pass
            def shutdown(self, how): released.set()
        class Connection:
            sock = Transport()
            def __init__(self, *args, **kwargs): pass
            def connect(self): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self):
                if not released.wait(0.5):
                    raise AssertionError("header read was not interrupted")
                raise TimeoutError("fixture header timeout")
            def close(self): pass
        started = time.monotonic()
        with patch("pipelines.cdc.openalex.downloader.http.client.HTTPSConnection", Connection):
            client = DeltaClient("fixture-key", max_seconds=0.05)
            with self.assertRaises(DeltaError):
                client.fetch_page({"from": SINCE, "to": UNTIL, "cursor": "*"})
        self.assertLess(time.monotonic() - started, 0.4)

    def test_client_credentials_and_request_budget_fail_before_network(self):
        with self.assertRaises(DeltaError):
            DeltaClient("")
        client = DeltaClient("fixture-key", max_requests=1)
        client.requests = 1
        with self.assertRaises(DeltaError):
            client.fetch_page({"from": SINCE, "to": UNTIL, "cursor": "*"})


if __name__ == "__main__":
    unittest.main()
