"""Offline asset transport checks without opening production ledgers."""
import subprocess
import sys
import unittest


class AssetHTTPTests(unittest.TestCase):
    def test_aperta_transport_retries_and_fatal_rejection(self):
        script = '''
import sys, ssl, urllib.error
from unittest.mock import patch, MagicMock
sys.path.insert(0, 'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
from pipelines.shared.safe_http import UnsafeAddressError
client = object.__new__(ApertaPdfDownloader)
client.timeout = 2
client.max_retries = 2
client._ssl_context = ssl.create_default_context()
client._wait_for_rate_limit = lambda: None
response = MagicMock()
response.__enter__.return_value.read.return_value = b'%PDF-1.7'
with patch('pdf_downloader.urlopen', side_effect=[TimeoutError(), response]) as request, patch('time.sleep'):
    assert client.download_file_bytes('https://example.org/a.pdf') == b'%PDF-1.7'
    assert request.call_count == 2
with patch('pdf_downloader.urlopen', side_effect=UnsafeAddressError()) as request, patch('time.sleep') as sleep:
    assert client.download_file_bytes('http://127.0.0.1/a') is None
    assert request.call_count == 1
    sleep.assert_not_called()
response.__enter__.return_value.read.return_value = b'<title>Just a moment...</title>'
with patch('pdf_downloader.urlopen', return_value=response) as request:
    assert client.download_file_bytes('https://example.org/a') is None
    assert request.call_count == 1
'''
        result = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_parent_loss_finishes_current_asset_and_closes_archive(self):
        script = '''
import sys, os, sqlite3, tempfile
from pathlib import Path
from unittest.mock import MagicMock
sys.path.insert(0, 'pipelines/api_stream/aperta')
os.environ.pop('PROTOKOL_DAEMON_RUN_DB', None)
from pdf_downloader import ApertaPdfDownloader
from pipelines.shared.pipeline_runtime import current_stopper
connection = sqlite3.connect(':memory:')
connection.row_factory = sqlite3.Row
connection.execute('CREATE TABLE aperta_files(file_id TEXT,record_id TEXT,key TEXT,size INTEGER,download_url TEXT,status TEXT,created_at TEXT,archive_shard_name TEXT)')
for name in ['one','two']:
    connection.execute('INSERT INTO aperta_files VALUES (?,?,?,?,?,?,?,?)', (name,'record',name,4,'https://example.org/'+name,'pending','2026',None))
connection.commit()
client = object.__new__(ApertaPdfDownloader)
client.ledger = MagicMock()
client.ledger._get_conn.return_value = connection
client.local_copy_dir = None
client.sharder = MagicMock()
client.sharder.current_shard_name = 'archive.tar.gz'
client.sharder.append_path.return_value = 'archive.tar.gz'
client.output_dir = tempfile.mkdtemp()
def download(url,path):
    current_stopper().request_stop('parent_lost')
    Path(path).write_bytes(b'data')
    return True
client.download_file_to = download
assert client.process_pending_files() == 1
assert connection.execute("SELECT status FROM aperta_files WHERE file_id='one'").fetchone()[0] == 'downloaded'
assert connection.execute("SELECT status FROM aperta_files WHERE file_id='two'").fetchone()[0] == 'pending'
client.sharder.close.assert_called_once()
connection.close()
'''
        result = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
