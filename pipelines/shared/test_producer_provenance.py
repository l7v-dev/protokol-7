"""Cross-source lineage, raw retention, replay, and fail-closed regressions."""
import hashlib
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from pipelines.shared import producer_provenance as producer


class ProducerProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.catalog = self.root/'central.sqlite'
        with sqlite3.connect(self.catalog) as db:
            db.executescript('''CREATE TABLE document_provenance(document_id TEXT PRIMARY KEY,canonicalization_version TEXT,language TEXT,pii_status TEXT,split TEXT,rights_status TEXT,created_at TEXT);
CREATE TABLE document_occurrences(occurrence_id INTEGER PRIMARY KEY,document_id TEXT REFERENCES document_provenance(document_id),source_id TEXT,source_record_id TEXT,source_uri TEXT,acquired_at TEXT,raw_artifact_id TEXT);
CREATE TABLE document_occurrence_runs(occurrence_id INTEGER PRIMARY KEY REFERENCES document_occurrences(occurrence_id),run_id TEXT);
CREATE TABLE pipeline_run_manifests(manifest_id TEXT PRIMARY KEY,run_id TEXT UNIQUE,trace_id TEXT,pipeline TEXT,started_at TEXT,status TEXT,agent_id TEXT,agent_version TEXT,config_sha256 TEXT,created_at TEXT,finished_at TEXT,counts_json TEXT,errors_json TEXT);''')
            db.executescript(Path('infra/migrations/0011-producer-raw-evidence.sql').read_text())
        self.env = patch.dict(os.environ, {'PROTOKOL_PROVENANCE_DB':str(self.catalog),'PROTOKOL_RAW_EVIDENCE_DIR':str(self.root/'raw'),'PROTOKOL_RAW_MIN_FREE_GB':'0'})
        self.env.start()
        producer._RUNS.clear()

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def test_raw_bytes_preserved_and_cross_source_occurrences_retained(self):
        payload=b'<raw>Original source bytes</raw>'
        first=producer.capture_bytes(payload,'one','https://example.org/page?api_key=secret')
        second=producer.capture_bytes(payload,'two','https://example.org/other')
        record={'id':'record','text':' A\r\n\uff21 '}
        producer.record_output(record,first)
        producer.record_output(record,first)
        producer.record_output(record,second)
        sha=hashlib.sha256(payload).hexdigest()
        self.assertEqual((self.root/'raw'/sha).read_bytes(),payload)
        with sqlite3.connect(self.catalog) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM raw_artifacts').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM document_provenance').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM document_occurrences').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT count(*) FROM document_occurrence_runs').fetchone()[0],2)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertNotIn('secret',str(db.execute('SELECT source_uri FROM document_occurrences').fetchall()))
            self.assertEqual(db.execute('SELECT document_id FROM document_provenance').fetchone()[0],hashlib.sha256(b'A\nA').hexdigest())

    def test_unknown_raw_rollback_and_missing_schema_do_not_create_catalog(self):
        with self.assertRaises(ValueError): producer.record_output({'id':'one','text':'Body'},None)
        evidence={'source_id':'one','raw_artifact_id':'missing','source_uri':'https://example.org','acquired_at':'2026-10-06T00:00:00+00:00'}
        with self.assertRaises(ValueError):producer.record_output({'id':'one','text':'Body'},evidence)
        with sqlite3.connect(self.catalog) as db:self.assertEqual(db.execute('SELECT count(*) FROM pipeline_run_manifests').fetchone()[0],0)
        missing=self.root/'missing.sqlite'
        with patch.dict(os.environ,{'PROTOKOL_PROVENANCE_DB':str(missing)}):
            with self.assertRaises(producer.EvidenceWriteError):producer.record_raw_receipt('a'*64,1,'https://example.org','one')
        self.assertFalse(missing.exists())

    def test_unsealed_archive_is_not_evidence_then_remote_location_replaces_local(self):
        from pipelines.shared.ledger_base import BaseLedger
        ledger=BaseLedger(str(self.root/'source.sqlite'))
        payload=self.root/'payload';payload.write_bytes(b'raw data')
        archive=self.root/'archive.tar.gz';archive.write_bytes(b'archive fixture')
        producer.stage_archive_raw(ledger,archive.name,str(payload),'aperta','https://example.org/raw','record/file')
        self.assertEqual(producer.flush_archive_raw(ledger,str(self.root)),0)
        ledger.register_shard(archive.name,0,1,archive.stat().st_size,'a'*64,'b'*32)
        self.assertEqual(producer.flush_archive_raw(ledger,str(self.root)),1)
        self.assertEqual(producer.flush_archive_raw(ledger,str(self.root)),0)
        ledger.mark_shard_uploaded(archive.name,'remote-id','b'*32)
        archive.unlink()
        self.assertEqual(producer.flush_archive_raw(ledger,str(self.root)),1)
        with sqlite3.connect(self.catalog) as db:
            self.assertIn('https://drive.google.com/file/d/remote-id/view#member=',str(db.execute('SELECT uri FROM raw_artifact_locations').fetchall()))

    def test_handled_failure_finishes_partial_manifest(self):
        @producer.producer_run('fixture')
        def run():
            producer.capture_bytes(b'actual source', 'one', 'https://example.org')
            producer.report_producer_error(OSError('failed section'))
        run()
        with sqlite3.connect(self.catalog) as db:
            self.assertEqual(db.execute('SELECT status FROM pipeline_run_manifests').fetchone()[0], 'partial')

    def test_existing_raw_corruption_is_rejected(self):
        evidence=producer.capture_bytes(b'raw','one','https://example.org')
        sha=evidence['raw_artifact_id'].split(':')[1]
        (self.root/'raw'/sha).write_bytes(b'bad')
        with self.assertRaises(producer.EvidenceWriteError):producer.capture_bytes(b'raw','one','https://example.org')
        self.assertFalse(list((self.root/'raw').glob('.capture-*')))

    def test_metadata_only_is_not_document_and_lifecycle_finishes_actual_manifest(self):
        @producer.producer_run('fixture')
        def run():
            evidence=producer.capture_bytes(b'{"metadata":true}','one','https://example.org')
            producer.record_output({'id':'meta','title':'Only metadata'},evidence)
            producer.record_output({'id':'text','text':'Actual text'},evidence)
        run()
        with sqlite3.connect(self.catalog) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM document_provenance').fetchone()[0],1)
            status,finished,counts=db.execute('SELECT status,finished_at,counts_json FROM pipeline_run_manifests').fetchone()
            self.assertEqual(status,'success')
            self.assertTrue(finished)
            import json
            self.assertEqual(json.loads(counts),{'raw_acquisitions':1,'document_occurrences':1})

    def test_real_tar_member_with_colon_matches_staged_raw_receipt(self):
        import subprocess,sys
        script='''
import sys,tarfile,sqlite3,os
from pathlib import Path
sys.path.insert(0,'pipelines/api_stream/aperta')
from pdf_downloader import ApertaPdfDownloader
root=Path(sys.argv[1])
client=ApertaPdfDownloader(db_path=str(root/'source'),output_dir=str(root/'archive'),sync_drive=False,min_free_disk_gb=0)
with client.ledger._get_conn() as db:
    db.execute("INSERT INTO aperta_records(id) VALUES ('record')")
    db.execute("INSERT INTO aperta_files(file_id,record_id,key,size,download_url,status,created_at) VALUES ('file','record','a:b.bin',4,'https://example.org','pending','2026')")
    db.commit()
def download(url,path): Path(path).write_bytes(b'raw!'); return True
client.download_file_to=download
assert client.process_pending_files(max_files=1)==1
with client.ledger._get_conn() as db:
    shard,member=db.execute('SELECT shard_name,member FROM raw_archive_outbox').fetchone()
with tarfile.open(root/'archive'/shard) as archive:
    assert archive.extractfile(member).read()==b'raw!'
assert member=='record_a_b.bin'
'''
        result=subprocess.run([sys.executable,'-c',script,str(self.root)],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_dergipark_evidence_fault_does_not_become_pdf_failure(self):
        import subprocess,sys
        script='''
import sys
from unittest.mock import patch
sys.path.insert(0,'pipelines/api_stream/dergipark')
import pdf_extractor as module
from pipelines.shared.producer_provenance import EvidenceWriteError
client=module.DergiParkPdfExtractor()
client.resolve_pdf_url=lambda url:'https://example.org/pdf'
client.fetch_pdf_bytes=lambda url:(b'%PDF-1.7',None)
with patch.object(module,'capture_bytes',side_effect=OSError('reserve')):
    try: client.process_article({'id':'one','fulltext_url':'https://example.org'})
    except EvidenceWriteError: pass
    else: raise AssertionError('Storage failure was converted into failed PDF')
'''
        result=subprocess.run([sys.executable,'-c',script],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
