import errno
import ssl
import unittest
import urllib.error
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from pipelines.shared.error_classifier import is_retriable
from pipelines.shared.retry_policy import RetryPolicy, retry_after_seconds


class RetryPolicyTests(unittest.TestCase):
    def test_failure_classification(self):
        for error in [TimeoutError(), ConnectionResetError(), OSError(errno.ECONNREFUSED, "refused"),
                      urllib.error.URLError(TimeoutError())]:
            self.assertTrue(is_retriable(error))
        for error in [ValueError(), PermissionError(), OSError(errno.ENOSPC, "full"),
                      ssl.SSLCertVerificationError(), RuntimeError(), urllib.error.URLError("unknown")]:
            self.assertFalse(is_retriable(error))
        for status in [401, 403, 404, 429, 500, 503, 525]:
            error = urllib.error.HTTPError("https://example.org", status, "", {}, None)
            try:
                self.assertEqual(is_retriable(error), status in [429, 500, 503, 525])
            finally:
                error.close()

    def test_retry_after_numeric_date_and_invalid(self):
        now = datetime(2026, 10, 6, tzinfo=timezone.utc)
        self.assertEqual(retry_after_seconds("99999"), 30)
        self.assertEqual(retry_after_seconds("Tue, 06 Oct 2026 00:00:12 GMT", now=now), 12)
        self.assertEqual(retry_after_seconds("-2"), 0)
        for value in ["nan", "inf", "garbage", None]:
            self.assertIsNone(retry_after_seconds(value))

    def test_attempt_limit_raises_last_error_without_final_sleep(self):
        operation = MagicMock(side_effect=TimeoutError("expired"))
        sleeps = []
        with self.assertRaises(TimeoutError):
            RetryPolicy(max_attempts=3).execute(operation, sleep=sleeps.append)
        self.assertEqual(operation.call_count, 3)
        self.assertEqual(sleeps, [1, 2])

    def test_fatal_error_is_not_retried(self):
        operation = MagicMock(side_effect=PermissionError())
        with self.assertRaises(PermissionError):
            RetryPolicy().execute(operation, sleep=lambda _: self.fail("Unexpected sleep"))
        self.assertEqual(operation.call_count, 1)

    def test_duration_budget(self):
        operation = MagicMock(side_effect=TimeoutError())
        with self.assertRaises(TimeoutError):
            RetryPolicy(total_duration=1).execute(operation, clock=lambda: 0,
                                                 sleep=lambda _: self.fail("Budget exceeded"))
        self.assertEqual(operation.call_count, 1)

    def test_success_after_retry_and_header(self):
        error = urllib.error.HTTPError("https://example.org", 429, "", {"Retry-After": "7"}, None)
        operation = MagicMock(side_effect=[error, b"ok"])
        sleeps = []
        self.assertEqual(RetryPolicy().execute(operation, sleep=sleeps.append), b"ok")
        self.assertEqual(sleeps, [7])
        error.close()

    def test_delay_cap_and_validation(self):
        self.assertEqual(RetryPolicy().delay(10**10), 30)
        for config in [{"max_attempts": 0}, {"max_attempts": True}, {"interval": float("nan")},
                       {"factor": .5}, {"strategy": "invalid"}, {"total_duration": 0}]:
            with self.assertRaises(ValueError):
                RetryPolicy(**config)

    def test_constant_and_random_policies(self):
        self.assertEqual(RetryPolicy(strategy="constant").delay(99), 1)
        with patch("random.uniform", return_value=.25) as jitter:
            self.assertEqual(RetryPolicy(strategy="random", factor=1).delay(5), .25)
            jitter.assert_called_once_with(0.0, 1.0)

    def test_source_exhaustion_never_returns_empty(self):
        from pipelines.api_stream.doaj.downloader import DoajDownloader
        from pipelines.api_stream.dergipark.downloader import DergiParkDownloader
        from pipelines.api_stream.aperta.downloader import ApertaDownloader
        for cls, method in [(DoajDownloader, "_fetch_raw"), (DergiParkDownloader, "_fetch_raw"),
                            (ApertaDownloader, "_fetch_url")]:
            with self.subTest(source=cls.__name__):
                client = cls(max_retries=2, min_interval=0)
                error = urllib.error.HTTPError("https://example.org", 429, "", {}, None)
                with patch(cls.__module__ + ".urlopen", side_effect=error) as request, patch("time.sleep") as sleep:
                    with self.assertRaises(urllib.error.HTTPError):
                        getattr(client, method)("https://example.org")
                self.assertEqual(request.call_count, 2)
                self.assertEqual(sleep.call_count, 1)

    def test_run_policy_receipt(self):
        import json
        from contextlib import closing
        import sqlite3
        import tempfile
        from pathlib import Path
        from pipelines.shared.daemon_run import DaemonRun, _CURRENT_RUN
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'runs.sqlite')
            with DaemonRun(path, 'test') as run:
                token = _CURRENT_RUN.set(run)
                try:
                    self.assertEqual(RetryPolicy(max_attempts=3).execute(lambda: 'ok'), 'ok')
                finally:
                    _CURRENT_RUN.reset(token)
                with closing(sqlite3.connect(path)) as conn:
                    receipt = json.loads(conn.execute('SELECT retry_config FROM pipeline_runs').fetchone()[0])
                self.assertEqual(receipt['max_attempts'], 3)
                self.assertEqual(receipt['strategy'], 'exponential')
