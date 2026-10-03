#!/usr/bin/env python3
"""
Synchronizes all SQLite databases in protokol-7 into dbx (com.dbx.app) -- protokol-7

Finds all SQLite catalogs, master databases, and language metadata databases,
and registers them into the user's local dbx database (~/.local/share/com.dbx.app/dbx.db).
Also prunes stale connections whose underlying database files no longer exist.
"""

import glob
import json
import os
import shutil
import sqlite3
import sys
import uuid

DBX_PATH = os.path.expanduser("~/.local/share/com.dbx.app/dbx.db")


def sync_dbx_connections():
    if not os.path.exists(DBX_PATH):
        print(f"[DBX-SYNC] dbx.db not found at {DBX_PATH}. Is dbx installed?")
        return

    # Backup dbx.db
    shutil.copyfile(DBX_PATH, DBX_PATH + ".bak")

    conn = sqlite3.connect(DBX_PATH)
    c = conn.cursor()

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # Prune stale protokol connections where host file does not exist
    c.execute("SELECT id, config_json FROM connections")
    rows = c.fetchall()
    pruned_count = 0
    existing_hosts = set()

    for conn_id, cjson in rows:
        try:
            cfg = json.loads(cjson)
            name = cfg.get("name", "")
            host = cfg.get("host", "")
            if name.startswith("protokol-"):
                if not os.path.exists(host):
                    c.execute("DELETE FROM connections WHERE id = ?", (conn_id,))
                    pruned_count += 1
                    print(f"[DBX-SYNC] Pruned stale connection: {name} ({host})")
                    continue
            existing_hosts.add(os.path.abspath(host))
        except Exception:
            pass

    # Core databases
    core_dbs = [
        ("protokol-catalog", os.path.join(base_dir, "data/catalog.sqlite")),
        ("protokol-doaj", os.path.join(base_dir, "data/catalogs/doaj_catalog.sqlite")),
        ("protokol-biorxiv", os.path.join(base_dir, "data/catalogs/biorxiv_catalog.sqlite")),
        ("protokol-pubmed", os.path.join(base_dir, "data/catalogs/pubmed_catalog.sqlite")),
        ("protokol-instagram", os.path.join(base_dir, "data/catalogs/instagram.sqlite")),
        ("protokol-openalex", os.path.join(base_dir, "data/catalogs/openalex_catalog.sqlite")),
        ("protokol-openalex-snapshot", os.path.join(base_dir, "data/catalogs/openalex_snapshot_catalog.sqlite")),
        ("protokol-semanticscholar", os.path.join(base_dir, "data/catalogs/semanticscholar_catalog.sqlite")),
        ("protokol-gutenberg", os.path.join(base_dir, "data/catalogs/gutenberg_catalog.sqlite")),
        ("protokol-stackexchange", os.path.join(base_dir, "data/catalogs/stackexchange_catalog.sqlite")),
        ("protokol-wikisource", os.path.join(base_dir, "data/catalogs/wikisource_catalog.sqlite")),
        ("protokol-wiktionary", os.path.join(base_dir, "data/catalogs/wiktionary_catalog.sqlite")),
        ("protokol-wikiquote", os.path.join(base_dir, "data/catalogs/wikiquote_catalog.sqlite")),
        ("protokol-wikibooks", os.path.join(base_dir, "data/catalogs/wikibooks_catalog.sqlite")),
        ("protokol-wikinews", os.path.join(base_dir, "data/catalogs/wikinews_catalog.sqlite")),
        ("protokol-wikispecies", os.path.join(base_dir, "data/catalogs/wikispecies_catalog.sqlite")),
        ("protokol-wikiversity", os.path.join(base_dir, "data/catalogs/wikiversity_catalog.sqlite")),
        ("protokol-wikivoyage", os.path.join(base_dir, "data/catalogs/wikivoyage_catalog.sqlite")),
    ]

    wiki_dbs = []
    for p in sorted(glob.glob(os.path.join(base_dir, "data/catalogs/wikipedia/*_metadata.sqlite"))):
        lang = os.path.basename(p).replace("_metadata.sqlite", "")
        wiki_dbs.append((f"protokol-wiki-{lang}", os.path.abspath(p)))

    all_to_add = core_dbs + wiki_dbs
    added_count = 0

    for name, host in all_to_add:
        if not os.path.exists(host):
            continue
        if host in existing_hosts:
            continue

        conn_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"dbx://protokol-7/{name}"))
        cfg = {
            "id": conn_id,
            "name": name,
            "db_type": "sqlite",
            "driver_profile": None,
            "driver_label": None,
            "url_params": None,
            "host": host,
            "port": 0,
            "username": "",
            "password": "",
            "database": None,
            "color": None,
            "connect_timeout_secs": 10,
            "query_timeout_secs": 60,
            "idle_timeout_secs": 60,
            "keepalive_interval_secs": 30,
            "ssl": False,
            "sysdba": False,
            "connection_string": None,
            "external_config": None,
            "jdbc_driver_class": None,
            "jdbc_driver_paths": [],
            "save_password": True,
            "database_info": {"productName": "SQLite"},
        }

        c.execute(
            "INSERT OR REPLACE INTO connections (id, config_json) VALUES (?, ?)",
            (conn_id, json.dumps(cfg)),
        )
        added_count += 1
        existing_hosts.add(host)
        print(f"[DBX-SYNC] Registered: {name} ({host})")

    conn.commit()

    # Query active protokol connections
    c.execute("SELECT count(*) FROM connections")
    total_active = c.fetchone()[0]
    conn.close()

    print(
        f"[DBX-SYNC] Complete. Added: {added_count}, Pruned: {pruned_count}, "
        f"Total active in dbx: {total_active}."
    )


if __name__ == "__main__":
    sync_dbx_connections()
