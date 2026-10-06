"""Exercise the asset worker with a payload larger than its memory budget."""
import subprocess
import sys
import tempfile
import unittest


class ApertaStreamingTests(unittest.TestCase):
    def test_large_asset_under_memory_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-c', '''
import os,resource,sys,tarfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'pipelines/api_stream/aperta')
import pdf_downloader as module
root=Path(sys.argv[1])
client=module.ApertaPdfDownloader(db_path=str(root/'db'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
size=384*1024*1024
with client.ledger._get_conn() as db:
    db.execute("INSERT INTO aperta_records(id) VALUES ('record')")
    db.execute("INSERT INTO aperta_files(file_id,record_id,key,size,download_url,status,created_at) VALUES ('file','record','large.bin',?,'https://example.org/file','pending','2026')",(size,))
    db.commit()
class Response:
    headers={'Content-Length':str(size)}
    remaining=size
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self,n=-1):
        count=self.remaining if n<0 else min(n,self.remaining)
        self.remaining-=count
        return b'x'*count
baseline=int(next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines() if line.startswith('VmSize:')))*1024
limit=baseline+320*1024*1024
resource.setrlimit(resource.RLIMIT_AS,(limit,limit))
with patch.object(module,'urlopen',return_value=Response()):
    assert client.process_pending_files(max_files=1)==1
with client.ledger._get_conn() as db:
    status,name=db.execute('SELECT status,archive_shard_name FROM aperta_files').fetchone()
assert status=='archived',status
with tarfile.open(root/'out'/name) as archive:
    member=archive.getmember('record_large.bin')
    assert member.size==size
    with archive.extractfile(member) as stream:
        total=0
        while block:=stream.read(1024*1024):
            assert block==b'x'*len(block)
            total+=len(block)
        assert total==size
assert not list((root/'out').glob('aperta-download-*'))
''', directory], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_retry_truncation_short_response_and_disk_failure(self):
        result = subprocess.run([sys.executable, '-c', '''
import sys,tempfile,shutil
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'pipelines/api_stream/aperta')
import pdf_downloader as module
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    client=module.ApertaPdfDownloader(db_path=str(root/'db'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
    client._wait_for_rate_limit=lambda:None
    class Response:
        def __init__(self,chunks,length): self.chunks=iter(chunks); self.headers={'Content-Length':str(length)}
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self,n):
            assert 0<n<=1024*1024
            value=next(self.chunks,b'')
            if isinstance(value,Exception): raise value
            return value
    path=str(root/'payload')
    with patch.object(module,'urlopen',side_effect=[Response([b'old',TimeoutError()],7),Response([b'new!'],4)]),patch('time.sleep'):
        assert client.download_file_to('https://example.org',path)
        assert Path(path).read_bytes()==b'new!'
    with patch.object(module,'urlopen',return_value=Response([b'cut'],7)) as request,patch('time.sleep') as sleep:
        assert not client.download_file_to('https://example.org',path)
        assert request.call_count==1
        sleep.assert_not_called()
    with patch.object(module,'urlopen',return_value=Response([b'1234'],4)),patch.object(module.shutil,'disk_usage',return_value=shutil._ntuple_diskusage(1,1,0)):
        try: client.download_file_to('https://example.org',path)
        except OSError: pass
        else: raise AssertionError('Disk reserve failure was swallowed')
    with patch.object(module,'urlopen',return_value=Response([b'<title>Just a moment...</title>'],30)):
        assert not client.download_file_to('https://example.org',path)
'''], capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rotation_association_and_failed_append(self):
        result = subprocess.run([sys.executable, '-c', '''
import sys,tempfile
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    client=ApertaPdfDownloader(db_path=str(root/'db'),output_dir=str(root/'out'),sync_drive=False,min_free_disk_gb=0)
    client.sharder.max_bytes=8
    with client.ledger._get_conn() as db:
        db.execute("INSERT INTO aperta_records(id) VALUES ('record')")
        for key in ['one','two']:
            db.execute("INSERT INTO aperta_files(file_id,record_id,key,size,download_url,status,created_at) VALUES (?,'record',?,5,'https://example.org','pending','2026')",(key,key))
        db.commit()
    def download(url,path): Path(path).write_bytes(b'12345'); return True
    client.download_file_to=download
    assert client.process_pending_files(max_files=2)==2
    with client.ledger._get_conn() as db:
        rows=db.execute('SELECT status,archive_shard_name FROM aperta_files ORDER BY file_id').fetchall()
        assert all(row[0]=='archived' for row in rows)
        assert rows[0][1]!=rows[1][1]
        db.execute("UPDATE aperta_files SET status='pending',archive_shard_name=NULL WHERE file_id='one'"); db.commit()
    def fail(*args): raise OSError('injected append failure')
    client.sharder.append_path=fail
    try: client.process_pending_files(max_files=1)
    except OSError: pass
    else: raise AssertionError('Append failure was swallowed')
    with client.ledger._get_conn() as db:
        assert tuple(db.execute("SELECT status,archive_shard_name FROM aperta_files WHERE file_id='one'").fetchone())==('pending',None)
    assert not list((root/'out').glob('aperta-download-*'))
'''], capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
