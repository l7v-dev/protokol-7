import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from pipelines.snapshot.huggingface import orchestrator as hf


class SnapshotTests(unittest.TestCase):
    def test_verified_files_resume_with_versioned_partial_state(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(hf, 'BASE', Path(directory)):
            monitor = str(Path(directory) / 'monitor.sqlite')
            db = hf.connect()
            db.execute("INSERT INTO sources VALUES ('test/data','abc','discovered','{}')")
            for name in ('one.txt', 'two.txt'):
                hf.insert_file(db, {'repo':'test/data','revision':'abc'}, {'path':name,'size':3})
            db.commit()
            sync = MagicMock()
            sync.get_or_create_subfolder.return_value = 'folder'
            sync.service.files.return_value.get.return_value.execute.return_value = {'id':'folder'}

            def download(row, reserve):
                path = Path(directory) / row['path']
                path.write_bytes(b'abc')
                return path, 'fixture-sha', 'fixture-md5'

            try:
                with patch.dict(os.environ, {'PROTOKOL_DAEMON_RUN_DB':monitor}), patch.object(hf, 'BaseDriveSync', return_value=sync), patch.object(hf, 'download', side_effect=download) as fetch, patch.object(hf, 'ensure_remote', return_value='verified-id'), patch.object(hf, 'export_manifest'), patch.object(hf, 'archive_manifest'), patch.object(hf, 'print_status'):
                    hf.run(db, 0, 1)
                    with closing(sqlite3.connect(monitor)) as conn:
                        first = conn.execute('SELECT state_type,state_payload,cursor_version FROM pipeline_states').fetchone()
                    self.assertEqual(first[0], 'partial')
                    self.assertEqual(json.loads(first[1])['partial']['cursor']['path'], 'one.txt')
                    hf.run(db, 0, 0)
                    self.assertEqual([call.args[0]['path'] for call in fetch.call_args_list], ['one.txt', 'two.txt'])
                    with closing(sqlite3.connect(monitor)) as conn:
                        last = conn.execute('SELECT state_type,state_payload,cursor_version FROM pipeline_states').fetchone()
                    self.assertEqual(last[0], 'completed')
                    self.assertTrue(json.loads(last[1])['snapshot_completed'])
                    self.assertGreater(last[2], first[2])
            finally:
                db.close()

    def test_remote_verification_failure_does_not_advance_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(hf, 'BASE', Path(directory)):
            monitor = str(Path(directory) / 'monitor.sqlite')
            db = hf.connect()
            db.execute("INSERT INTO sources VALUES ('test/data','abc','discovered','{}')")
            hf.insert_file(db, {'repo':'test/data','revision':'abc'}, {'path':'one.txt','size':3})
            db.commit()
            path = Path(directory) / 'one.txt'
            path.write_bytes(b'abc')
            sync = MagicMock()
            sync.get_or_create_subfolder.return_value = 'folder'
            sync.service.files.return_value.get.return_value.execute.return_value = {'id':'folder'}
            try:
                with patch.dict(os.environ, {'PROTOKOL_DAEMON_RUN_DB':monitor}), patch.object(hf, 'BaseDriveSync', return_value=sync), patch.object(hf, 'download', return_value=(path,'sha','md5')), patch.object(hf, 'ensure_remote', side_effect=ValueError('fixture-verification')), patch.object(hf, 'export_manifest'), patch.object(hf, 'archive_manifest'):
                    with self.assertRaises(ValueError):
                        hf.run(db, 0, 0)
                with closing(sqlite3.connect(monitor)) as conn:
                    state = conn.execute('SELECT state_payload,cursor_version FROM pipeline_states').fetchone()
                self.assertEqual(state[1], 1)
                self.assertEqual(json.loads(state[0])['partial'], {})
                self.assertTrue(path.exists())
            finally:
                db.close()

    def test_language_boundaries(self):
        pattern = ['multilingual/c4-tr.*.json.gz']
        self.assertTrue(hf.selected('multilingual/c4-tr.00000.json.gz', pattern))
        self.assertFalse(hf.selected('multilingual/c4-trp.00000.json.gz', pattern))
        self.assertFalse(hf.selected('multilingual/c4-en.00000.json.gz', pattern))
        self.assertFalse(hf.selected('data/tur_Latn_removed/train/000.parquet', ['data/tur_Latn/**/*.parquet']))

    def test_checkpoint_failure_does_not_undo_remote_verification(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(hf, 'BASE', Path(directory)):
            db = hf.connect()
            db.execute("INSERT INTO sources VALUES ('test/data','abc','discovered','{}')")
            hf.insert_file(db, {'repo':'test/data','revision':'abc'}, {'path':'one.txt','size':3})
            db.commit()
            path = Path(directory) / 'one.txt'
            path.write_bytes(b'abc')
            sync = MagicMock()
            sync.get_or_create_subfolder.return_value = 'folder'
            sync.service.files.return_value.get.return_value.execute.return_value = {'id':'folder'}
            checkpoint = MagicMock()
            checkpoint.advance.side_effect = RuntimeError('fixture-checkpoint-write')
            try:
                with patch.dict(os.environ, {'PROTOKOL_DAEMON_RUN_DB':''}), patch.object(hf, 'current_checkpoint', return_value=checkpoint), patch.object(hf, 'BaseDriveSync', return_value=sync), patch.object(hf, 'download', return_value=(path,'sha','md5')), patch.object(hf, 'ensure_remote', return_value='verified-id'), patch.object(hf, 'export_manifest'), patch.object(hf, 'archive_manifest'):
                    with self.assertRaises(RuntimeError):
                        hf.run(db, 0, 0)
                self.assertEqual(db.execute('SELECT status,drive_id FROM files').fetchone()[:], ('remote_verified','verified-id'))
            finally:
                db.close()

    def test_paths(self):
        for value in ('../outside', '/tmp/file', 'a/../../secret', 'a\\b'):
            with self.assertRaises(ValueError):
                hf.safe_path(value)
        self.assertEqual(str(hf.safe_path('train/000.parquet')), 'train/000.parquet')

    def test_hosts(self):
        for url in ('http://huggingface.co/a', 'https://huggingface.co.attacker.test/a',
                    'https://127.0.0.1/a', 'https://user@huggingface.co/a'):
            self.assertFalse(hf.allowed_url(url))
        self.assertTrue(hf.allowed_url('https://cas-bridge.xethub.hf.co/a'))

    def test_source_integrity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data'
            path.write_bytes(b'abc')
            row = {'size': 3, 'expected_sha256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}
            sha, md5 = hf.validate_file(path, row)
            self.assertEqual(md5, '900150983cd24fb0d6963f7d28e17f72')
            path.write_bytes(b'abd')
            with self.assertRaises(ValueError):
                hf.validate_file(path, row)
            path.write_bytes(b'ab')
            with self.assertRaises(ValueError):
                hf.validate_file(path, row)

    def test_redirect_does_not_forward_token(self):
        first = MagicMock(is_redirect=True, headers={'Location': 'https://cas-bridge.xethub.hf.co/blob'})
        second = MagicMock(is_redirect=False, status_code=200, ok=True)
        with patch.object(hf, 'get_token', return_value='fixture-token'), patch.object(hf.requests, 'get', side_effect=[first, second]) as get:
            hf.request('https://huggingface.co/datasets/example/data/resolve/revision/file')
            self.assertIn('Authorization', get.call_args_list[0].kwargs['headers'])
            self.assertNotIn('Authorization', get.call_args_list[1].kwargs['headers'])

    def test_access_denied_not_retried(self):
        response = MagicMock(is_redirect=False, status_code=403)
        with patch.object(hf.requests, 'get', return_value=response) as get:
            with self.assertRaises(hf.AccessBlocked):
                hf.request('https://huggingface.co/file')
            self.assertEqual(get.call_count, 1)

    def test_existing_remote_recovers_upload_commit_gap(self):
        sync = MagicMock()
        sync.service.files.return_value.list.return_value.execute.return_value = {
            'files': [{'id': 'existing', 'size': '3', 'md5Checksum': '900150983cd24fb0d6963f7d28e17f72'}]}
        result = hf.ensure_remote(sync, Path('file'), 'folder', {'size': 3}, 'sha', '900150983cd24fb0d6963f7d28e17f72')
        self.assertEqual(result, 'existing')
        sync.upload_file.assert_not_called()

    def test_missing_remote_checksum_rejected(self):
        sync = MagicMock()
        sync.service.files.return_value.list.return_value.execute.return_value = {'files': []}
        sync.upload_file.return_value = {'file_id': 'new'}
        sync.service.files.return_value.get.return_value.execute.return_value = {'id': 'new', 'size': '3'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'file'
            path.write_bytes(b'abc')
            with self.assertRaises(ValueError):
                hf.ensure_remote(sync, path, 'folder', {'size': 3}, 'sha', '900150983cd24fb0d6963f7d28e17f72')
            self.assertTrue(path.exists())
            self.assertFalse(sync.upload_file.call_args.kwargs['purge_on_success'])

    def test_disk_reserve_prevents_download(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(hf, 'BASE', Path(directory)), patch.object(hf, 'request') as request:
            row = {'repo': 'test/data', 'revision': 'abc', 'path': 'file', 'size': 2 ** 62}
            with self.assertRaises(OSError):
                hf.download(row, 25 * hf.GIB)
            request.assert_not_called()

    def test_pagination(self):
        first = MagicMock()
        first.__enter__.return_value = first
        first.json.return_value = [{'path': 'one'}]
        first.links = {'next': {'url': 'https://huggingface.co/next'}}
        second = MagicMock()
        second.__enter__.return_value = second
        second.json.return_value = [{'path': 'two'}]
        second.links = {}
        with patch.object(hf, 'request', side_effect=[first, second]):
            self.assertEqual([x['path'] for x in hf.tree('test/data', 'commit')], ['one', 'two'])


if __name__ == '__main__':
    unittest.main()
