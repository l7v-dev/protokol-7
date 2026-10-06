#!/usr/bin/env python3
"""Revision-pinned research snapshots with verified Drive archival."""

import argparse
import fcntl
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import sys
import time
from urllib.parse import quote, urljoin, urlparse

import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from pipelines.shared.drive_sync_base import BaseDriveSync
from pipelines.shared.daemon_run import monitor_daemon, current_checkpoint
from pipelines.shared.producer_provenance import report_producer_error, EvidenceWriteError, producer_run, record_raw_receipt
from pipelines.shared.url_dedup import DiskUrlDedup
from pipelines.shared.pipeline_runtime import current_stopper

BASE = ROOT / 'data/huggingface'
CONFIG = Path(__file__).with_name('sources.json')
GIB = 1024 ** 3


class AccessBlocked(RuntimeError):
    pass


def get_token():
    token = os.environ.get('HF_TOKEN')
    path = Path(os.environ.get('HF_HOME', str(Path.home() / '.cache/huggingface'))) / 'token'
    return token or (path.read_text().strip() if path.exists() else None)


def allowed_url(url):
    parsed = urlparse(url)
    host = parsed.hostname or ''
    return parsed.scheme == 'https' and not parsed.username and not parsed.password and parsed.port in (None, 443) and (
        host in ('huggingface.co', 'raw.githubusercontent.com', 'api.github.com')
        or host.endswith('.huggingface.co') or host.endswith('.hf.co')
    )


def request(url, **kwargs):
    token = get_token()
    for attempt in range(5):
        current = url
        response = None
        for _ in range(8):
            if not allowed_url(current):
                raise ValueError('Download host not allowed')
            headers = {'User-Agent': 'protokol-7-research-snapshot/1.0', 'Accept-Encoding': 'identity'}
            if token and urlparse(current).hostname == 'huggingface.co':
                headers['Authorization'] = f'Bearer {token}'
            response = requests.get(current, headers=headers, allow_redirects=False, timeout=(20, 120), **kwargs)
            if response.is_redirect:
                current = urljoin(current, response.headers['Location'])
                response.close()
                continue
            break
        else:
            raise RuntimeError('Redirect limit reached')
        if response.status_code in (401, 403):
            response.close()
            raise AccessBlocked('Access denied; account permission required')
        if response.status_code == 429 or response.status_code >= 500:
            delay = response.headers.get('Retry-After', '')
            response.close()
            if attempt == 4:
                raise RuntimeError('Remote retry limit reached')
            time.sleep(min(int(delay), 120) if delay.isdigit() else 2 ** attempt + 1)
            continue
        if not response.ok:
            status = response.status_code
            response.close()
            raise RuntimeError(f'Remote HTTP {status}')
        return response
    raise RuntimeError('Request failed')


def json_get(url):
    with request(url) as response:
        return response.json()


def tree(repo, revision, directory='', recursive=True):
    url = f'https://huggingface.co/api/datasets/{repo}/tree/{revision}'
    if directory:
        url += '/' + quote(directory, safe='/')
    url += '?recursive=' + str(recursive).lower() + '&limit=1000'
    while url:
        with request(url) as response:
            yield from response.json()
            url = response.links.get('next', {}).get('url')


def safe_path(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or '\\' in value:
        raise ValueError('Unsafe source path')
    return path


def selected(path, patterns):
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def connect():
    BASE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(BASE / 'catalog.sqlite')
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS sources (
            repo TEXT PRIMARY KEY, revision TEXT, status TEXT, details TEXT
        );
        CREATE TABLE IF NOT EXISTS files (
            repo TEXT, revision TEXT, path TEXT, url TEXT, size INTEGER,
            expected_sha256 TEXT, status TEXT DEFAULT 'pending',
            sha256 TEXT, md5 TEXT, drive_id TEXT, error TEXT,
            PRIMARY KEY(repo, revision, path)
        );
    ''')
    return db


def insert_file(db, source, item):
    path = item['path']
    safe_path(path)
    url = f'https://huggingface.co/datasets/{source["repo"]}/resolve/{source["revision"]}/{quote(path, safe="/")}'
    digest = (item.get('lfs') or {}).get('oid')
    db.execute('INSERT OR IGNORE INTO files(repo,revision,path,url,size,expected_sha256) VALUES(?,?,?,?,?,?)',
               (source['repo'], source['revision'], path, url, item['size'], digest))


def discover(db):
    config = json.loads(CONFIG.read_text())
    for source in config['sources']:
        repo = source['repo']
        previous = db.execute('SELECT * FROM sources WHERE repo=?', (repo,)).fetchone()
        if previous and previous['revision'] == source['revision'] and previous['status'] == 'discovered':
            continue
        print(f'[DISCOVER] {repo}', flush=True)
        try:
            found = {}
            for root in source['roots']:
                for item in tree(repo, source['revision'], root):
                    if item['type'] == 'file' and selected(item['path'], source['patterns']):
                        found[item['path']] = item
            for item in tree(repo, source['revision'], recursive=False):
                name = item['path']
                if item['type'] == 'file' and (name.lower().startswith(('readme', 'license', 'licence', 'copying')) or name == 'tquad.py'):
                    found[name] = item
            data_files = [item for name, item in found.items() if selected(name, source['patterns'])]
            if data_files:
                first = data_files[0]
                url = f'https://huggingface.co/datasets/{repo}/resolve/{source["revision"]}/{quote(first["path"], safe="/")}'
                with request(url, stream=True):
                    pass
            elif repo != 'mcemilg/tquad':
                raise RuntimeError('No matching data files')
            for item in found.values():
                insert_file(db, source, item)
            if repo == 'mcemilg/tquad':
                commit = json_get('https://api.github.com/repos/TQuad/turkish-nlp-qa-dataset/commits/master')['sha']
                for name in ('train-v0.1.json', 'dev-v0.1.json'):
                    url = f'https://raw.githubusercontent.com/TQuad/turkish-nlp-qa-dataset/{commit}/{name}'
                    with request(url) as response:
                        content = response.content
                        json.loads(content)
                    db.execute('INSERT OR IGNORE INTO files(repo,revision,path,url,size,expected_sha256) VALUES(?,?,?,?,?,?)',
                               (repo, source['revision'], 'upstream/' + name, url, len(content), hashlib.sha256(content).hexdigest()))
            status, details = 'discovered', json.dumps(source, ensure_ascii=False)
            print(f'[DISCOVERED] {repo} files={len(found)}', flush=True)
        except AccessBlocked:
            status, details = 'blocked', 'HF account access required'
            print(f'[BLOCKED] {repo}: account access required', flush=True)
        except (requests.RequestException, RuntimeError, ValueError, KeyError) as exc:
            status, details = 'discovery_failed', type(exc).__name__ + ': discovery incomplete'
            print(f'[DISCOVERY-FAILED] {repo} {type(exc).__name__}', flush=True)
        db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?,?)', (repo, source['revision'], status, details))
        db.commit()
    export_manifest(db)


def export_manifest(db):
    payload = {'sources': [dict(row) for row in db.execute('SELECT * FROM sources')],
               'files': [dict(row) for row in db.execute('SELECT * FROM files ORDER BY repo,path')]}
    temp = BASE / 'manifest.json.tmp'
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    temp.replace(BASE / 'manifest.json')


def digests(path):
    sha, md5 = hashlib.sha256(), hashlib.md5()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(4 * 1024 * 1024), b''):
            sha.update(block)
            md5.update(block)
    return sha.hexdigest(), md5.hexdigest()


def validate_file(path, row):
    if path.stat().st_size != row['size']:
        raise ValueError('File size mismatch')
    sha, md5 = digests(path)
    if row['expected_sha256'] and sha != row['expected_sha256']:
        raise ValueError('Source SHA256 mismatch')
    return sha, md5


def download(row, reserve):
    directory = BASE / 'staging' / row['repo'].replace('/', '--') / row['revision']
    target = directory.joinpath(*safe_path(row['path']).parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        sha, md5 = validate_file(target, row)
        return target, sha, md5
    part = target.with_name(target.name + '.part')
    if part.exists():
        part.unlink()
    if shutil.disk_usage(BASE).free < reserve + row['size']:
        raise OSError('Disk reserve reached')
    for attempt in range(4):
        received = 0
        try:
            with request(row['url'], stream=True) as response, part.open('wb') as output:
                for block in response.iter_content(4 * 1024 * 1024):
                    if not block:
                        continue
                    received += len(block)
                    if received > row['size']:
                        raise ValueError('Remote size exceeds manifest')
                    if shutil.disk_usage(BASE).free < reserve + len(block):
                        raise OSError('Disk reserve reached')
                    output.write(block)
            sha, md5 = validate_file(part, row)
            part.replace(target)
            return target, sha, md5
        except (requests.RequestException, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('Download retries exhausted')


def ensure_remote(sync, path, folder, row, sha, md5):
    name = path.name.replace("'", "\\'")
    query = f"name='{name}' and '{folder}' in parents and trashed=false"
    token = None
    while True:
        listing = sync.service.files().list(q=query, fields='nextPageToken,files(id,size,md5Checksum)', pageToken=token).execute()
        for item in listing.get('files', []):
            if int(item.get('size', -1)) == row['size'] and item.get('md5Checksum') == md5:
                return item['id']
        token = listing.get('nextPageToken')
        if not token:
            break
    result = sync.upload_file(str(path), target_folder_id=folder, purge_on_success=False)
    item = sync.service.files().get(fileId=result['file_id'], fields='id,size,md5Checksum').execute()
    if int(item.get('size', -1)) != row['size'] or item.get('md5Checksum') != md5:
        raise ValueError('Remote verification failed; local file retained')
    return item['id']


@monitor_daemon("huggingface")
def run(db, reserve, max_files):
    inventory = [(row['repo'], row['revision']) for row in db.execute(
        "SELECT repo,revision FROM sources WHERE status='discovered' ORDER BY repo,revision")]
    scope = hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest()
    checkpoint = current_checkpoint(f"huggingface:{BASE.resolve()}:{scope}")
    with DiskUrlDedup(str(BASE / 'url-receipts.sqlite')) as urls:
        for previous in db.execute("SELECT url FROM files WHERE status='remote_verified'"):
            urls.mark_seen(previous['url'])
    sync = BaseDriveSync()
    folder = sync.get_or_create_subfolder('HuggingFace')
    meta = sync.service.files().get(fileId=folder, fields='id,name,webViewLink').execute()
    (BASE / 'drive-target.json').write_text(json.dumps(meta, indent=2) + '\n')
    export_manifest(db)
    archive_manifest(sync, folder, 'inventory-start.json')
    count = 0
    rows = db.execute('''SELECT f.* FROM files f JOIN sources s ON f.repo=s.repo AND f.revision=s.revision
        WHERE s.status='discovered' AND f.status != 'remote_verified' ORDER BY f.size, f.repo, f.path''').fetchall()
    stopper = current_stopper()
    for row in rows:
        if stopper and stopper.should_stop()[0]:
            break
        if max_files and count >= max_files:
            break
        key = (row['repo'], row['revision'], row['path'])
        print(f'[DOWNLOAD] {row["repo"]}/{row["path"]} bytes={row["size"]}', flush=True)
        try:
            path, sha, md5 = download(row, reserve)
            db.execute('UPDATE files SET status=?,sha256=?,md5=?,error=NULL WHERE repo=? AND revision=? AND path=?',
                       ('downloaded', sha, md5, *key))
            db.commit()
            dest = folder
            for segment in [row['repo'].replace('/', '--'), row['revision'], *PurePosixPath(row['path']).parts[:-1]]:
                dest = sync.get_or_create_subfolder(segment, dest)
            remote_id = ensure_remote(sync, path, dest, row, sha, md5)
            db.execute('UPDATE files SET status=?,drive_id=? WHERE repo=? AND revision=? AND path=?',
                       ('remote_verified', remote_id, *key))
            db.commit()
            record_raw_receipt(sha, row["size"], "https://drive.google.com/file/d/"+remote_id+"/view", "huggingface", source_uri=row["url"], source_record_id=row["repo"]+"@"+row["revision"]+":"+row["path"])
            path.unlink()
            count += 1
            print(f'[VERIFIED] {row["repo"]}/{row["path"]} drive_id={remote_id}', flush=True)
            export_manifest(db)
        except EvidenceWriteError:
            raise
        except Exception as exc:
            report_producer_error(exc)
            if stopper:
                stopper.record_error()
            db.execute('UPDATE files SET status=?,error=? WHERE repo=? AND revision=? AND path=?',
                       ('failed', type(exc).__name__, *key))
            db.commit()
            export_manifest(db)
            print(f'[STOP] {type(exc).__name__}; source retained; rerun resumes manifest', flush=True)
            raise
        if stopper:
            stopper.record_processed()
        with DiskUrlDedup(str(BASE / 'url-receipts.sqlite')) as urls:
            urls.mark_seen(row['url'])
        if checkpoint:
            checkpoint.advance({'repo': row['repo'], 'revision': row['revision'],
                                'path': row['path'], 'drive_id': remote_id})
    export_manifest(db)
    archive_manifest(sync, folder, 'inventory-current.json')
    if checkpoint:
        remaining = db.execute("""SELECT COUNT(*) FROM files f JOIN sources s
            ON f.repo=s.repo AND f.revision=s.revision
            WHERE s.status='discovered' AND f.status!='remote_verified'""").fetchone()[0]
        if not remaining:
            checkpoint.complete()
    print_status(db)


def archive_manifest(sync, folder, name):
    path = BASE / name
    shutil.copyfile(BASE / 'manifest.json', path)
    sha, md5 = digests(path)
    ensure_remote(sync, path, folder, {'size': path.stat().st_size}, sha, md5)


def print_status(db):
    for row in db.execute('SELECT repo,status FROM sources ORDER BY repo'):
        print('[SOURCE]', row['repo'], row['status'])
    for row in db.execute('SELECT status,count(*) AS files,sum(size) AS bytes FROM files GROUP BY status'):
        print('[FILES]', dict(row))


@producer_run("huggingface")
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['discover', 'run', 'status'])
    parser.add_argument('--min-free-disk-gb', type=float, default=25)
    parser.add_argument('--max-files', type=int, default=0)
    from pipelines.shared.cli_validation import validate_cli
    args = validate_cli(parser, parser.parse_args())
    if args.min_free_disk_gb < 0 or args.max_files < 0:
        parser.error('Limits must be nonnegative')
    db = connect()
    with (BASE / 'runner.lock').open('w') as lock:
        if args.action != 'status':
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'discover':
            discover(db)
            print_status(db)
        elif args.action == 'run':
            run(db, int(args.min_free_disk_gb * GIB), args.max_files)
        else:
            print_status(db)
    db.close()


if __name__ == '__main__':
    try:
        main()
    except EvidenceWriteError:
        raise
    except Exception as exc:
        report_producer_error(exc)
        print(f'[FAILED] {type(exc).__name__}; inspect catalog and retry', flush=True)
        sys.exit(1)
