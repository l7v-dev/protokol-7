from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
from threading import Event
import unittest
from unittest.mock import patch, MagicMock
from pipelines.shared.adaptive_rate_limiter import AdaptiveRateLimiter
from pipelines.shared.pipeline_stats import PipelineStats, DummyStats
from pipelines.shared.upload_queue import UploadQueue
from pipelines.shared.drive_sync_base import BaseDriveSync


class PerformanceTests(unittest.TestCase):
    def test_stats_concurrency_and_snapshot(self):
        stats = PipelineStats()
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: stats.inc('count'), range(100)))
        stats.max('peak', 3); stats.max('peak', 2)
        stats.min('low', 3); stats.min('low', 2)
        self.assertEqual(stats.dump(), {'count': 100, 'peak': 3, 'low': 2})
        stats.set('nested', {'values': [1]})
        snapshot = stats.dump(); snapshot['nested']['values'].append(2)
        self.assertEqual(stats.dump()['nested']['values'], [1])
        with self.assertRaises(ValueError):
            stats.set('invalid', float('nan'))
        dummy = DummyStats(); dummy.inc('count'); self.assertEqual(dummy.dump(), {})

    def test_feedback_domains_and_success_floor(self):
        limiter = AdaptiveRateLimiter(base_delay=1, max_delay=10, jitter=lambda: 1)
        self.assertEqual([limiter.update_delay('https://a.org', 429) for _ in range(3)], [2, 4, 8])
        self.assertEqual(limiter.update_delay('https://b.org', 200), 1)
        for _ in range(20):
            limiter.update_delay('https://a.org', 200)
        self.assertEqual(limiter.update_delay('https://a.org', 200), 1)
        self.assertEqual(limiter.update_delay('https://a.org', 403), 1)

    def test_monotonic_wait_and_cooldown(self):
        now = [0]
        limiter = AdaptiveRateLimiter(base_delay=1, clock=lambda: now[0], sleep=lambda delay: now.__setitem__(0, now[0]+delay))
        limiter.wait('https://a.org'); limiter.wait('https://a.org')
        self.assertEqual(now[0], 1)
        limiter.cooldown(3)
        limiter.wait('https://b.org')
        self.assertEqual(now[0], 4)

    def test_queue_nonblocking_failure_and_drain(self):
        entered, release = Event(), Event()
        queue = UploadQueue(4)
        def operation():
            entered.set(); release.wait(2); return 'done'
        try:
            first = queue.submit(operation)
            self.assertTrue(entered.wait(1))
            second = queue.submit(lambda: 'second')
            self.assertFalse(first.done())
            self.assertFalse(second.done())
            release.set()
            self.assertEqual(first.result(2), 'done')
            self.assertEqual(second.result(2), 'second')
            failure = queue.submit(lambda: 1/0)
            with self.assertRaises(ZeroDivisionError):
                failure.result(2)
        finally:
            release.set(); queue.close()
        with self.assertRaises(RuntimeError):
            queue.submit(lambda: None)

    def test_upload_callback_precedes_eviction(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shard.parquet'; path.write_bytes(b'content')
            sync = BaseDriveSync(dry_run=True)
            result = {'status': 'uploaded', 'file_id': 'remote', 'md5': 'digest', 'byte_size': 7}
            receipts = []
            with patch.object(BaseDriveSync, 'upload_file', return_value=result):
                future = sync.upload_async(str(path), on_success=lambda value: receipts.append(path.exists()))
                sync.close_uploads()
                self.assertEqual(future.result(), result)
            self.assertEqual(receipts, [True])
            self.assertFalse(path.exists())

    def test_callback_failure_preserves_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shard.parquet'; path.write_bytes(b'content')
            sync = BaseDriveSync(dry_run=True)
            def failed_receipt(result):
                raise RuntimeError('catalog unavailable')
            with patch.object(BaseDriveSync, 'upload_file', return_value={'status': 'uploaded'}):
                future = sync.upload_async(str(path), on_success=failed_receipt)
                sync.close_uploads()
                with self.assertRaises(RuntimeError):
                    future.result()
            self.assertTrue(path.exists())

    def test_missing_remote_checksum_preserves_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shard'; path.write_bytes(b'content')
            sync = BaseDriveSync(dry_run=True)
            sync.dry_run = False
            sync.service = MagicMock()
            sync.service.files.return_value.create.return_value.next_chunk.return_value = (None, {'id': 'remote'})
            with patch('pipelines.shared.drive_sync_base.MediaFileUpload'):
                with self.assertRaises(ValueError):
                    sync.upload_file(str(path), purge_on_success=True)
            self.assertTrue(path.exists())

    def test_recursive_submission_is_rejected(self):
        queue = UploadQueue(1)
        try:
            future = queue.submit(lambda: queue.submit(lambda: None))
            with self.assertRaises(RuntimeError):
                future.result(2)
        finally:
            queue.close()

    def test_dry_run_never_evicts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shard'; path.write_bytes(b'content')
            sync = BaseDriveSync(dry_run=True)
            sync.upload_file(str(path), purge_on_success=True)
            future = sync.upload_async(str(path))
            sync.close_uploads()
            self.assertEqual(future.result()['status'], 'dry_run')
            self.assertTrue(path.exists())
