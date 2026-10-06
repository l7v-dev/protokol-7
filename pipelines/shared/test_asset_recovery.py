"""Real subprocess crash and same-directory archive restart regression tests."""
import subprocess
import sys
import tempfile
import unittest


class AssetRecoveryTests(unittest.TestCase):
    def execute(self, script, directory):
        result = subprocess.run([sys.executable, '-c', script, directory], capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_crash_before_archive_close_requeues_file(self):
        with tempfile.TemporaryDirectory() as directory:
            self.execute('''
import os,sys
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
root=Path(sys.argv[1])
client=ApertaPdfDownloader(db_path=str(root/'source.sqlite'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
with client.ledger._get_conn() as db:
    db.execute("INSERT INTO aperta_records(id) VALUES ('record')")
    db.execute("INSERT INTO aperta_files(file_id,record_id,key,size,download_url,status,created_at) VALUES ('file','record','file.pdf',4,'https://example.org/file','pending','2026')")
    db.commit()
def download(url,path):
    Path(path).write_bytes(b'data')
    return True
client.download_file_to=download
client.sharder.close=lambda: os._exit(0)
client.process_pending_files(max_files=1)
''', directory)

            self.execute('''
import sys
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
root=Path(sys.argv[1])
client=ApertaPdfDownloader(db_path=str(root/'source.sqlite'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
with client.ledger._get_conn() as db:
    status=db.execute("SELECT status FROM aperta_files WHERE file_id='file'").fetchone()[0]
assert status=='pending', status
assert len(list((root/'out').glob('*.tar.gz')))==1
''', directory)


    def test_remote_receipt_reserves_archive_index_after_local_eviction(self):
        with tempfile.TemporaryDirectory() as directory:
            self.execute('''
import sys
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
root=Path(sys.argv[1])
first=ApertaPdfDownloader(db_path=str(root/'source.sqlite'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
first.ledger.register_shard('aperta_raw_pdfs_20261006_p00011.tar.gz',11,1,4,'sha','md5')
second=ApertaPdfDownloader(db_path=str(root/'source.sqlite'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
assert second.sharder.part_idx>=12, second.sharder.part_idx
''', directory)
    def test_archive_restart_preserves_previous_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            self.execute('''
import sys
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_tar_packer import ApertaPdfTarSharder
root=Path(sys.argv[1])
first=ApertaPdfTarSharder(str(root),snapshot_date='20261006',min_free_disk_gb=0)
name=first.append_file('first.pdf',b'first'); first.close()
original=(root/name).read_bytes()
second=ApertaPdfTarSharder(str(root),snapshot_date='20261006',min_free_disk_gb=0)
other=second.append_file('second.pdf',b'second'); second.close()
assert name!=other, 'Archive filename reused'
assert (root/name).read_bytes()==original, 'Archive bytes overwritten'
''', directory)

    def test_rotation_seals_current_file_and_upload_failure_retains_it(self):
        with tempfile.TemporaryDirectory() as directory:
            self.execute('''
import sys,tarfile
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
root=Path(sys.argv[1])
client=ApertaPdfDownloader(db_path=str(root/'source.sqlite'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
client.sharder.target_bytes=1
client.drive_sync=Mock(); client.drive_sync.sync_shard.side_effect=RuntimeError('upload unavailable')
with client.ledger._get_conn() as db:
    db.execute("INSERT INTO aperta_records(id) VALUES ('record')")
    db.execute("INSERT INTO aperta_files(file_id,record_id,key,size,download_url,status,created_at) VALUES ('file','record','file.pdf',4,'https://example.org/file','pending','2026')")
    db.commit()
def download(url,path):
    Path(path).write_bytes(b'data')
    return True
client.download_file_to=download
assert client.process_pending_files(max_files=1)==1
with client.ledger._get_conn() as db:
    status,name=db.execute("SELECT status,archive_shard_name FROM aperta_files WHERE file_id='file'").fetchone()
assert status=='archived',status
assert (root/'out'/name).exists()
with tarfile.open(root/'out'/name) as archive:
    assert archive.extractfile('record_file.pdf').read()==b'data'
with client.ledger._get_conn() as db:
    db.execute("UPDATE aperta_files SET status='downloaded'"); db.commit()
assert client.ledger.recover_unsealed_assets()==0
with client.ledger._get_conn() as db:
    assert db.execute('SELECT status FROM aperta_files').fetchone()[0]=='archived'
''', directory)
