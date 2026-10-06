"""Offline orchestrator tests at shard and durable-source checkpoint seams."""

import subprocess
import sys
import tempfile
import unittest


BOOTSTRAP = """import os,sys,json,sqlite3,importlib.util
from pathlib import Path
from unittest.mock import patch
root=Path(sys.argv[1])
os.environ['PROTOKOL_DAEMON_RUN_DB']=str(root/'monitor.sqlite')
def load(name):
    path=Path('pipelines/api_stream')/name/'orchestrator.py'
    sys.path.insert(0,str(path.parent.resolve()))
    spec=importlib.util.spec_from_file_location('fixture_orchestrator',path)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
"""


class SourceCheckpointTests(unittest.TestCase):
    def execute(self, script):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, "-c", BOOTSTRAP + script, directory],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_doaj_async_upload_failure_keeps_shards(self):
        self.execute("""
from pipelines.shared.drive_sync_base import BaseDriveSync
m=load('doaj'); original=m.DoajLedger
m.DoajLedger=lambda db_path: original(db_path,central_db_path=str(root/'central.sqlite'))
def stream(self,max_records=None,resumption_token=None):
    self.oai_page_token='page'; self.oai_snapshot_complete=False
    for name in ['first','second']:
        yield {'id':name,'title':'fixture','year':2026}
    self.oai_snapshot_complete=True
args=['fixture','--all','--async-upload','--max-records','0','--batch-size','1','--max-shard-records','1',
      '--output-dir',str(root/'out'),'--db-path',str(root/'source.sqlite')]
with patch.object(BaseDriveSync,'_init_service'), patch.object(BaseDriveSync,'upload_file',side_effect=ValueError('checksum mismatch')), patch.object(m.DoajDriveSync,'get_doaj_folder_id',return_value='folder'), patch.object(m.DoajDownloader,'stream_oai_articles',stream), patch.object(m.DoajCleaner,'clean_record',lambda self,row: row), patch.object(original,'sync_to_central_catalog'):
    with patch.object(sys,'argv',args): m.main()
with sqlite3.connect(root/'source.sqlite') as db:
    assert db.execute("SELECT COUNT(*) FROM shards WHERE status='failed'").fetchone()[0]==2
assert len(list((root/'out').glob('*.parquet')))==2
with sqlite3.connect(root/'monitor.sqlite') as db:
    stats=json.loads(db.execute('SELECT stats_json FROM pipeline_runs').fetchone()[0])
    assert stats['records_processed']==2 and stats['uploads_failed']==2
""")

    def test_doaj_async_upload_keeps_ingestion_running_and_drains(self):
        self.execute("""
from threading import Event
from pipelines.shared.drive_sync_base import BaseDriveSync
m=load('doaj'); original=m.DoajLedger
m.DoajLedger=lambda db_path: original(db_path,central_db_path=str(root/'central.sqlite'))
entered,release=Event(),Event()
def stream(self,max_records=None,resumption_token=None):
    self.oai_page_token='page'; self.oai_snapshot_complete=False
    yield {'id':'first','title':'fixture','year':2026}
    assert entered.wait(2)
    release.set()
    yield {'id':'second','title':'fixture','year':2026}
    self.oai_snapshot_complete=True
def upload(self,local_path,**kwargs):
    assert kwargs['purge_on_success'] is False
    entered.set(); assert release.wait(2)
    return {'status':'uploaded','file_id':'remote','md5':'verified','byte_size':Path(local_path).stat().st_size}
args=['fixture','--all','--async-upload','--max-records','0','--batch-size','1','--max-shard-records','1',
      '--output-dir',str(root/'out'),'--db-path',str(root/'source.sqlite')]
with patch.object(BaseDriveSync,'_init_service'), patch.object(BaseDriveSync,'upload_file',upload), patch.object(m.DoajDriveSync,'get_doaj_folder_id',return_value='folder'), patch.object(m.DoajDownloader,'stream_oai_articles',stream), patch.object(m.DoajCleaner,'clean_record',lambda self,row: row), patch.object(original,'sync_to_central_catalog'):
    with patch.object(sys,'argv',args): m.main()
with sqlite3.connect(root/'source.sqlite') as db:
    assert db.execute("SELECT COUNT(*) FROM shards WHERE status='uploaded'").fetchone()[0]==2
assert list((root/'out').glob('*.parquet'))==[]
with sqlite3.connect(root/'monitor.sqlite') as db:
    stats=json.loads(db.execute('SELECT stats_json FROM pipeline_runs').fetchone()[0])
    assert stats['records_processed']==2 and stats['uploads_succeeded']==2
""")

    def test_doaj_stop_condition_preserves_partial_state_and_reason(self):
        self.execute("""
os.environ['PROTOKOL_STOP_MAX_RECORDS']='1'
m=load('doaj'); original=m.DoajLedger
m.DoajLedger=lambda db_path: original(db_path,central_db_path=str(root/'central.sqlite'))
def stream(self,max_records=None,resumption_token=None):
    self.oai_page_token='page-start'; self.oai_snapshot_complete=False
    for index in range(3):
        yield {'id':str(index),'title':'fixture','year':2026}
    self.oai_snapshot_complete=True
args=['fixture','--all','--no-drive','--max-records','0','--batch-size','1',
      '--max-shard-records','1','--output-dir',str(root/'out'),'--db-path',str(root/'source.sqlite')]
with patch.object(m.DoajDownloader,'stream_oai_articles',stream), patch.object(m.DoajCleaner,'clean_record',lambda self,row: row), patch.object(original,'sync_to_central_catalog'):
    with patch.object(sys,'argv',args): m.main()
with sqlite3.connect(root/'monitor.sqlite') as db:
    assert db.execute('SELECT stop_reason FROM pipeline_runs').fetchone()[0]=='max_records'
    assert db.execute('SELECT state_type FROM pipeline_states').fetchone()[0]=='partial'
assert len(list((root/'out').glob('*.parquet')))==1
""")

    def test_doaj_resume_is_saved_only_by_closed_shards(self):
        self.execute("""
m=load('doaj'); original=m.DoajLedger
m.DoajLedger=lambda db_path: original(db_path,central_db_path=str(root/'central.sqlite'))
stage={'complete':False}
def stream(self,max_records=None,resumption_token=None):
    assert resumption_token == ('safe-page' if stage['complete'] else None)
    self.oai_page_token='safe-page'; self.oai_snapshot_complete=False
    yield {'id':'second' if stage['complete'] else 'first','title':'fixture','year':2026}
    self.oai_snapshot_complete=stage['complete']
args=['fixture','--all','--no-drive','--max-records','1','--batch-size','1',
      '--max-shard-records','1','--output-dir',str(root/'out'),'--db-path',str(root/'source.sqlite')]
with patch.object(m.DoajDownloader,'stream_oai_articles',stream), patch.object(m.DoajCleaner,'clean_record',lambda self,row: row), patch.object(original,'sync_to_central_catalog'):
    with patch.object(sys,'argv',args): m.main()
    with sqlite3.connect(root/'monitor.sqlite') as db:
        row=db.execute('SELECT state_type,state_payload FROM pipeline_states').fetchone()
        assert row[0]=='partial'
        assert json.loads(row[1])['partial']['cursor']['oai_token']=='safe-page'
    first=list((root/'out').glob('*.parquet')); assert len(first)==1
    saved=first[0].read_bytes(); stage['complete']=True
    with patch.object(sys,'argv',args): m.main()
    assert first[0].read_bytes()==saved
    assert len(list((root/'out').glob('*.parquet')))==2
    with sqlite3.connect(root/'monitor.sqlite') as db:
        assert db.execute('SELECT state_type FROM pipeline_states').fetchone()[0]=='completed'
""")

    def test_doaj_page_token_and_natural_completion_are_distinct_from_record_limit(self):
        self.execute("""
m=load('doaj')
def page(identifier,token=''):
    return ('<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">'
      '<ListRecords><record><header><identifier>oai:'+identifier+'</identifier></header>'
      '<metadata><dc:dc xmlns:dc="http://www.openarchives.org/OAI/2.0/oai_dc/">'
      '<title xmlns="http://purl.org/dc/elements/1.1/">fixture</title>'
      '</dc:dc></metadata></record>'+('<resumptionToken>'+token+'</resumptionToken>' if token else '')+
      '</ListRecords></OAI-PMH>').encode()
downloader=m.DoajDownloader()
with patch.object(downloader,'_fetch_raw',side_effect=[page('one','next'),page('two')]):
    stream=downloader.stream_oai_articles()
    assert next(stream)['id']=='one' and downloader.oai_page_token is None
    assert next(stream)['id']=='two' and downloader.oai_page_token=='next'
    assert list(stream)==[] and downloader.oai_snapshot_complete
with patch.object(downloader,'_fetch_raw',return_value=page('one')):
    assert len(list(downloader.stream_oai_articles(max_records=1)))==1
    assert not downloader.oai_snapshot_complete
""")

    def test_aperta_recovers_indexed_rows_before_resuming_next_page(self):
        self.execute("""
m=load('aperta'); original=m.ApertaLedger
m.ApertaLedger=lambda db_path: original(db_path,central_db_path=str(root/'central.sqlite'))
stage={'restart':False}
def fetch(self,resumption_token=None,metadata_prefix=None):
    if stage['restart']:
        assert resumption_token=='page-2'
        with sqlite3.connect(root/'source.sqlite') as db:
            assert db.execute("SELECT status FROM aperta_records WHERE id='first'").fetchone()[0]=='sharded'
        return ([{'id':'second','title':'fixture'}],None,2,2)
    return ([{'id':'first','title':'fixture'}],'page-2',1,2)
args=['fixture','--all','--no-sync-drive','--max-records','1','--batch-size','1000',
      '--output-dir',str(root/'out'),'--db-path',str(root/'source.sqlite')]
with patch.object(m.ApertaDownloader,'fetch_oai_page',fetch), patch.object(m.ApertaCleaner,'clean_record',lambda self,row: row):
    with patch.object(m.ApertaParquetSharder,'close',side_effect=RuntimeError('fixture-crash-before-seal')):
        try:
            with patch.object(sys,'argv',args): m.main()
            raise AssertionError('failure was not raised')
        except RuntimeError: pass
    with sqlite3.connect(root/'source.sqlite') as db:
        assert db.execute("SELECT status FROM aperta_records WHERE id='first'").fetchone()[0]=='indexed'
    stage['restart']=True
    # No record limit: natural OAI completion promotes the snapshot state.
    args[args.index('--max-records')+1]='0'
    with patch.object(sys,'argv',args): m.main()
    with sqlite3.connect(root/'source.sqlite') as db:
        assert db.execute("SELECT COUNT(*) FROM aperta_records WHERE status='sharded'").fetchone()[0]==2
    with sqlite3.connect(root/'monitor.sqlite') as db:
        assert db.execute('SELECT state_type FROM pipeline_states').fetchone()[0]=='completed'
""")

    def test_aperta_updated_metadata_remains_replayable_until_resealed(self):
        self.execute("""
m=load('aperta')
ledger=m.ApertaLedger(str(root/'source.sqlite'),central_db_path=str(root/'central.sqlite'))
ledger.upsert_record({'id':'record','title':'old'})
ledger.mark_sharded(['record'],'old.parquet')
assert ledger.get_unsharded_records()==[]
ledger.upsert_record({'id':'record','title':'updated'})
pending=ledger.get_unsharded_records()
assert len(pending)==1 and pending[0]['title']=='updated'
with sqlite3.connect(root/'source.sqlite') as db:
    assert db.execute('SELECT shard_name FROM aperta_records').fetchone()[0] is None
""")


if __name__ == '__main__':
    unittest.main()
