"""Persist actual raw bytes and observed producer output in the central catalog."""
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import unicodedata
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

_RUNS = {}


def enabled():
    return bool(os.environ.get('PROTOKOL_PROVENANCE_DB'))


def safe_uri(uri):
    parsed = urlsplit(str(uri))
    if parsed.username or parsed.password:
        raise ValueError('Evidence URI must not contain credentials')
    secret = {'api_key', 'apikey', 'token', 'access_token', 'signature', 'key', 'x-amz-signature', 'x-amz-credential', 'x-amz-security-token'}
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key.lower() not in secret]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def _now():
    return datetime.now(timezone.utc).isoformat()


def _connect():
    path = Path(os.environ['PROTOKOL_PROVENANCE_DB']).resolve()
    db = sqlite3.connect(path.as_uri()+'?mode=rw', uri=True, timeout=10)
    db.execute('PRAGMA foreign_keys=ON')
    for table in ('raw_artifacts', 'raw_artifact_locations', 'producer_occurrence_receipts', 'raw_artifact_acquisitions'):
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
            db.close()
            raise RuntimeError('Producer provenance migration is required')
    return db


def record_raw_receipt(sha256, size, uri, source_id, *, source_uri=None, source_record_id=None, acquired_at=None):
    if not enabled():
        return None
    if len(sha256) != 64 or any(c not in '0123456789abcdef' for c in sha256) or size < 0:
        raise ValueError('Invalid raw artifact receipt')
    uri = safe_uri(uri)
    artifact = 'sha256:'+sha256
    stamp = _now()
    with closing(_connect()) as db, db:
        db.execute('INSERT OR IGNORE INTO raw_artifacts VALUES (?,?,?,?)', (artifact, sha256, size, stamp))
        if db.execute('SELECT byte_size FROM raw_artifacts WHERE raw_artifact_id=?', (artifact,)).fetchone()[0] != size:
            raise ValueError('Raw artifact size conflict')
        db.execute('INSERT OR IGNORE INTO raw_artifact_locations VALUES (?,?)', (artifact, uri))
        run=_manifest(db,source_id)
        source_uri=safe_uri(source_uri or uri)
        source_record_id=str(source_record_id if source_record_id is not None else source_uri)
        receipt=hashlib.sha256(json.dumps([run,source_id,source_record_id,source_uri,artifact],separators=(',', ':')).encode()).hexdigest()
        db.execute('INSERT OR IGNORE INTO raw_artifact_acquisitions VALUES (?,?,?,?,?,?,?)',(receipt,artifact,source_id,source_record_id,source_uri,acquired_at or stamp,run))
    return {'raw_artifact_id': artifact, 'source_id': source_id, 'source_uri': source_uri, 'acquired_at': stamp}


def capture_stream(stream, source_id, source_uri):
    """Retain source bytes before any parsing or scratch-file eviction."""
    if not enabled():
        return None
    root = Path(os.environ.get('PROTOKOL_RAW_EVIDENCE_DIR', 'data/raw_evidence')).resolve()
    root.mkdir(parents=True, exist_ok=True)
    reserve = int(float(os.environ.get('PROTOKOL_RAW_MIN_FREE_GB', '25'))*1024**3)
    digest = hashlib.sha256()
    total = 0
    fd, temporary = tempfile.mkstemp(prefix='.capture-', dir=root)
    try:
        with os.fdopen(fd, 'wb') as output:
            while chunk := stream.read(1024*1024):
                if shutil.disk_usage(root).free < reserve + len(chunk):
                    raise OSError('Raw evidence disk reserve reached')
                output.write(chunk)
                digest.update(chunk)
                total += len(chunk)
            output.flush()
            os.fsync(output.fileno())
        sha = digest.hexdigest()
        target = root/sha
        try:
            os.link(temporary, target)
        except FileExistsError:
            with target.open('rb') as prior:
                if target.stat().st_size != total or hashlib.file_digest(prior, 'sha256').hexdigest() != sha:
                    raise RuntimeError('Existing raw evidence content conflict')
        directory_fd = os.open(root, os.O_RDONLY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
        evidence = record_raw_receipt(sha, total, target.as_uri(), source_id, source_uri=source_uri)
        evidence['source_uri'] = safe_uri(source_uri)
        return evidence
    finally:
        os.unlink(temporary)


def capture_bytes(payload, source_id, source_uri):
    if not enabled(): return None
    import io
    return capture_stream(io.BytesIO(payload), source_id, source_uri)


def capture_path(path, source_id, source_uri):
    if not enabled(): return None
    with open(path, 'rb') as stream:
        return capture_stream(stream, source_id, source_uri)


def record_output(record, evidence, *, source_record_id=None):
    if not enabled(): return record
    if not evidence:
        raise ValueError('Actual raw evidence is required for producer output')
    source_id = evidence['source_id']
    if source_record_id is None:
        source_record_id = next((record.get(key) for key in ('id', 'paper_id', 'book_id', 'pmid', 'doi', 'page_id', 'question_id', 'article_id', 'thread_id', 'doc_id', 'work_id') if record.get(key) is not None), None)
    if source_record_id is None:
        raise ValueError('Stable source record identity is required')
    text = next((record.get(key) for key in ('text', 'content', 'full_text', 'fulltext', 'markdown', 'body', 'pdf_text') if isinstance(record.get(key), str) and record[key].strip()), None)
    if not text and all(isinstance(record.get(key),str) for key in ('question','answer')):
        text=record['question']+'\n'+record['answer']
    if not text:
        text=next((record.get(key) for key in ('abstract','description') if isinstance(record.get(key),str) and record[key].strip()),None)
    if not text:return record
    canonical,version=canonical_text(text)
    document = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    run_id,started,context=_run_identity(source_id)
    receipt = hashlib.sha256(json.dumps([run_id, source_id, str(source_record_id), document, evidence['raw_artifact_id']], separators=(',', ':')).encode()).hexdigest()
    with closing(_connect()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        _manifest(db,source_id)
        if db.execute('SELECT 1 FROM producer_occurrence_receipts WHERE receipt_id=?', (receipt,)).fetchone(): return record
        if not db.execute('SELECT 1 FROM raw_artifacts WHERE raw_artifact_id=?', (evidence['raw_artifact_id'],)).fetchone(): raise ValueError('Unknown raw artifact')
        db.execute("INSERT OR IGNORE INTO document_provenance (document_id,canonicalization_version,language,pii_status,split,rights_status,created_at) VALUES (?,?,?,'unchecked','unassigned','unknown',?)", (document,version,str(record.get('language') or record.get('lang') or 'und'),_now()))
        if db.execute('SELECT canonicalization_version FROM document_provenance WHERE document_id=?', (document,)).fetchone()[0] != version: raise ValueError('Canonicalization policy conflict')
        occurrence = db.execute('INSERT INTO document_occurrences(document_id,source_id,source_record_id,source_uri,acquired_at,raw_artifact_id) VALUES (?,?,?,?,?,?)', (document,source_id,str(source_record_id),safe_uri(evidence['source_uri']),evidence['acquired_at'],evidence['raw_artifact_id'])).lastrowid
        db.execute('INSERT INTO document_occurrence_runs VALUES (?,?)', (occurrence,run_id))
        db.execute('INSERT INTO producer_occurrence_receipts VALUES (?,?,?)', (receipt,occurrence,run_id))
    return record


def capture_fetch(source_id):
    """Capture exact byte-returning connector responses before their parser runs."""
    from functools import wraps
    def decorate(function):
        @wraps(function)
        def wrapped(self, url, *args, **kwargs):
            payload = function(self, url, *args, **kwargs)
            self.raw_evidence = capture_bytes(payload, source_id, url) if payload else None
            return payload
        return wrapped
    return decorate


def stage_archive_raw(ledger, shard_name, path, source_id, source_uri, member, *, file_id=None):
    """Keep receipt pending until the archive has a closed shard record."""
    if not enabled(): return
    with open(path, 'rb') as stream:
        sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    payload = json.dumps({'sha256':sha,'size':os.path.getsize(path),'source_id':source_id,'source_uri':safe_uri(source_uri),'member':member,'acquired_at':_now()})
    with ledger._get_conn() as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS raw_archive_outbox (shard_name TEXT NOT NULL, member TEXT NOT NULL, payload TEXT NOT NULL, reported_uri TEXT, PRIMARY KEY(shard_name,member))')
        db.execute('INSERT OR REPLACE INTO raw_archive_outbox(shard_name,member,payload) VALUES (?,?,?)', (shard_name,member,payload))
        if file_id is not None:
            db.execute("UPDATE aperta_files SET status='downloaded',archive_shard_name=? WHERE file_id=?", (shard_name,file_id))


def flush_archive_raw(ledger, output_dir):
    if not enabled(): return 0
    with ledger._get_conn() as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='raw_archive_outbox'").fetchone():return 0
        rows=db.execute("SELECT o.shard_name,o.member,o.payload,s.drive_file_id FROM raw_archive_outbox o JOIN shards s ON s.shard_name=o.shard_name WHERE o.reported_uri IS NULL OR (s.drive_file_id IS NOT NULL AND o.reported_uri LIKE 'file:%')").fetchall()
    for row in rows:
        payload=json.loads(row['payload'])
        location='https://drive.google.com/file/d/'+row['drive_file_id']+'/view' if row['drive_file_id'] else (Path(output_dir)/row['shard_name']).resolve().as_uri()
        location+='#member='+urlencode({'name':row['member']})
        if not row['drive_file_id'] and not (Path(output_dir)/row['shard_name']).is_file():raise FileNotFoundError('Closed raw archive is unavailable')
        record_raw_receipt(payload['sha256'],payload['size'],location,payload['source_id'],source_uri=payload['source_uri'],source_record_id=payload['member'],acquired_at=payload['acquired_at'])
        with ledger._get_conn() as db, db:
            db.execute('UPDATE raw_archive_outbox SET reported_uri=? WHERE shard_name=? AND member=?', (location,row['shard_name'],row['member']))
    return len(rows)


def canonical_text(text):
    """Match TextNormalizer default policy, including its existing policy fingerprint."""
    import re
    policy={'nfkc':True,'stripControlChars':True,'stripZeroWidth':True,'collapseWhitespace':True,'maxConsecutiveNewlines':2}
    version='text-normalizer.v1.'+hashlib.sha256(json.dumps(policy,separators=(',', ':')).encode()).hexdigest()[:16]
    value=unicodedata.normalize('NFKC',text)
    value=re.sub('[\u200b-\u200d\ufeff\u2060\u00a0]',lambda match:' ' if match[0]=='\u00a0' else '',value)
    value=re.sub('[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]','',value)
    value=value.replace('\r\n','\n').replace('\r','\n')
    whitespace='\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
    value='\n'.join(re.sub('[ \t]+',' ',line).strip(whitespace) for line in value.split('\n'))
    value=re.sub('\n{3,}','\n\n\n',value).strip(whitespace)
    return value,version


class EvidenceWriteError(RuntimeError):
    """A central/storage fault; source records must remain eligible for retry."""


from contextvars import ContextVar
_CURRENT_PRODUCER = ContextVar('current_producer', default=None)


def _run_identity(source_id):
    from pipelines.shared.daemon_run import current_run_id
    context=_CURRENT_PRODUCER.get()
    monitored=current_run_id()
    run,started=_RUNS.setdefault((source_id,monitored,context['run_id'] if context else None),(monitored or (context['run_id'] if context else str(uuid4())),_now()))
    if context:context['runs'].add(run)
    return run,started,context


def _manifest(db,source_id):
    run,started,context=_run_identity(source_id)
    config=context['config_sha256'] if context else hashlib.sha256(b'producer-provenance.v1').hexdigest()
    pipeline=context['pipeline'] if context else source_id
    db.execute("INSERT OR IGNORE INTO pipeline_run_manifests (manifest_id,run_id,trace_id,pipeline,started_at,status,agent_id,agent_version,config_sha256,created_at) VALUES (?,?,?,?,?,'partial','python-producer','1',?,?)",(run,run,run.replace('-',''),pipeline,started,config,started))
    return run


def report_producer_error(error):
    """Report handled failures without stopping independent source work."""
    context = _CURRENT_PRODUCER.get()
    if context is not None:
        context.setdefault('handled_errors', []).append(type(error).__name__)


def producer_run(pipeline):
    """Finish only actually observed manifests; exceptions record failure then propagate."""
    from functools import wraps
    import sys
    def decorate(function):
        @wraps(function)
        def wrapped(*args,**kwargs):
            if not enabled():return function(*args,**kwargs)
            config=hashlib.sha256(json.dumps({'pipeline':pipeline,'argv':sys.argv[1:]},sort_keys=True,separators=(',', ':')).encode()).hexdigest()
            context={'run_id':str(uuid4()),'pipeline':pipeline,'config_sha256':config,'runs':set()}
            token=_CURRENT_PRODUCER.set(context)
            status='success'
            error=None
            try:
                return function(*args,**kwargs)
            except BaseException as failure:
                status='aborted' if isinstance(failure,(KeyboardInterrupt,SystemExit)) else 'failed'
                error=type(failure).__name__
                raise
            finally:
                try:
                    if status == 'success' and context.get('handled_errors'):
                        status = 'partial'
                        error = context['handled_errors'][-1]
                    if context.get('evidence_error'):
                        status='failed'
                        error=context['evidence_error']
                    with closing(_connect()) as db,db:
                        for run in context['runs']:
                            count=db.execute('SELECT count(*) FROM raw_artifact_acquisitions WHERE run_id=?',(run,)).fetchone()[0]
                            documents=db.execute('SELECT count(*) FROM document_occurrence_runs WHERE run_id=?',(run,)).fetchone()[0]
                            db.execute('UPDATE pipeline_run_manifests SET status=?,finished_at=?,counts_json=?,errors_json=? WHERE run_id=?',(status,_now(),json.dumps({'raw_acquisitions':count,'document_occurrences':documents}),json.dumps([error] if error else []),run))
                finally:_CURRENT_PRODUCER.reset(token)
        return wrapped
    return decorate


def _evidence_operation(function):
    from functools import wraps
    @wraps(function)
    def wrapped(*args,**kwargs):
        try:return function(*args,**kwargs)
        except EvidenceWriteError:raise
        except (OSError,sqlite3.Error,RuntimeError) as error:
            context=_CURRENT_PRODUCER.get()
            if context:context['evidence_error']=type(error).__name__
            raise EvidenceWriteError('Producer evidence persistence failed') from error
    return wrapped


for _operation in ('capture_stream','capture_bytes','capture_path','record_raw_receipt','record_output','stage_archive_raw','flush_archive_raw'):
    globals()[_operation]=_evidence_operation(globals()[_operation])
