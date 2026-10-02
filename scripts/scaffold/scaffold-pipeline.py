#!/usr/bin/env python3
"""
Pipeline Scaffolder -- protokol-7

Scaffolds a new ETL pipeline directory under pipelines/<category>/<name>/
using standard shared components (BaseCleaner, BaseParquetSharder, BaseLedger, BaseDriveSync).
"""

import argparse
import os
import sys

ALLOWED_CATEGORIES = ("snapshot", "dump", "api_stream", "multimodal")

CLEANER_TEMPLATE = '''#!/usr/bin/env python3
"""
{name_title} Record Cleaner and Quality Gate -- protokol-7
"""

import sys
import os
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import BaseCleaner, clean_text


class {name_camel}Cleaner(BaseCleaner):
    def __init__(self, min_char_count: int = 50, min_word_count: int = 10):
        super().__init__(
            min_char_count=min_char_count,
            min_word_count=min_word_count,
            filter_paratext=True,
            filter_retracted=True,
        )

    def clean_record(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        title = clean_text(raw.get("title") or "")
        if self.is_paratext(title):
            return None

        text = clean_text(raw.get("text") or "")
        if not self.validate_bounds(text):
            return None

        return {{
            "id": str(raw.get("id") or ""),
            "title": title,
            "text": text,
            "char_count": len(text),
            "word_count": len(text.split()),
        }}
'''

PACKER_TEMPLATE = '''#!/usr/bin/env python3
"""
{name_title} Streaming Parquet Sharder -- protokol-7
"""

import sys
import os
from typing import Any, Callable, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import pyarrow as pa
from pipelines.shared.sharder_base import BaseParquetSharder

{name_upper}_SCHEMA = pa.schema([
    ("id", pa.string()),
    ("title", pa.string()),
    ("text", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
])


class {name_camel}Sharder(BaseParquetSharder):
    def __init__(
        self,
        output_dir: str,
        filename_prefix: str = "{name_snake}",
        max_part_bytes: int = 10 * 1024**3,
        batch_size: int = 10_000,
        start_part_idx: int = 0,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__(
            output_dir=output_dir,
            schema={name_upper}_SCHEMA,
            filename_prefix=filename_prefix,
            max_part_bytes=max_part_bytes,
            batch_size=batch_size,
            start_part_idx=start_part_idx,
            compression="zstd",
            compression_level=3,
            on_shard_completed=on_shard_completed,
        )
'''

DRIVE_SYNC_TEMPLATE = '''#!/usr/bin/env python3
"""
{name_title} Google Drive Synchronizer -- protokol-7
"""

import sys
import os
from typing import Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.drive_sync_base import DEFAULT_ROOT_FOLDER_ID, BaseDriveSync


class {name_camel}DriveSync(BaseDriveSync):
    def __init__(
        self,
        root_folder_id: Optional[str] = None,
        dry_run: bool = False,
    ):
        super().__init__(
            root_folder_id=root_folder_id or DEFAULT_ROOT_FOLDER_ID,
            dry_run=dry_run,
        )
'''

LEDGER_TEMPLATE = '''#!/usr/bin/env python3
"""
{name_title} Transactional SQLite Ledger -- protokol-7
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_LEDGER_PATH = "data/catalogs/{name_snake}_catalog.sqlite"


class {name_camel}Ledger(BaseLedger):
    def __init__(
        self,
        db_path: str = DEFAULT_LEDGER_PATH,
        central_db_path: str = "data/catalog.sqlite",
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
'''

ORCHESTRATOR_TEMPLATE = '''#!/usr/bin/env python3
"""
{name_title} Pipeline Orchestrator CLI -- protokol-7
"""

import argparse
import sys
import os

from cleaner import {name_camel}Cleaner
from packer import {name_camel}Sharder
from drive_sync import {name_camel}DriveSync
from ledger import {name_camel}Ledger


def main():
    parser = argparse.ArgumentParser(description="{name_title} ETL Pipeline")
    parser.add_argument("--output-dir", default="data/scratch/{name_snake}", help="Temporary output directory")
    parser.add_argument("--dry-run", action="store_true", help="Simulate execution without network side effects")
    args = parser.parse_args()

    cleaner = {name_camel}Cleaner()
    ledger = {name_camel}Ledger()
    drive_sync = {name_camel}DriveSync(dry_run=args.dry_run)

    def on_shard_done(shard_info):
        ledger.register_shard(
            shard_name=shard_info["shard_name"],
            part_index=shard_info["part_index"],
            record_count=shard_info["record_count"],
            byte_size=shard_info["byte_size"],
            sha256=shard_info["sha256"],
            md5=shard_info["md5"],
        )
        sync_res = drive_sync.upload_file(shard_info["file_path"], purge_on_success=True)
        if sync_res.get("file_id"):
            ledger.mark_shard_uploaded(
                shard_name=shard_info["shard_name"],
                drive_file_id=sync_res["file_id"],
                verified_md5=sync_res.get("md5"),
            )
            ledger.sync_to_central_catalog("{name_snake}")

    sharder = {name_camel}Sharder(
        output_dir=args.output_dir,
        on_shard_completed=on_shard_done,
    )

    print(f"[{name_upper}] Pipeline initialized. Ready for ingestion.")


if __name__ == "__main__":
    main()
'''

TEST_TEMPLATE = '''#!/usr/bin/env python3
"""
Unit tests for {name_title} pipeline.
"""

import os
import sys
import shutil
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from cleaner import {name_camel}Cleaner
from packer import {name_camel}Sharder


class Test{name_camel}Pipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.cleaner = {name_camel}Cleaner(min_char_count=10, min_word_count=2)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_cleaner_filtering(self):
        valid = self.cleaner.clean_record({{
            "id": "1",
            "title": "Legitimate Article",
            "text": "This is a clean and valid test sentence for verification.",
        }})
        self.assertIsNotNone(valid)
        self.assertEqual(valid["id"], "1")

        paratext = self.cleaner.clean_record({{
            "id": "2",
            "title": "Table of Contents",
            "text": "This should be discarded by quality gate.",
        }})
        self.assertIsNone(paratext)

    def test_sharder_output(self):
        sharder = {name_camel}Sharder(output_dir=self.temp_dir, batch_size=2)
        sharder.add_record({{"id": "1", "title": "T1", "text": "Content 1", "char_count": 9, "word_count": 2}})
        sharder.add_record({{"id": "2", "title": "T2", "text": "Content 2", "char_count": 9, "word_count": 2}})
        shards = sharder.close()
        self.assertEqual(len(shards), 1)
        self.assertEqual(shards[0]["record_count"], 2)


if __name__ == "__main__":
    unittest.main()
'''


def to_camel(s: str) -> str:
    return "".join(part.capitalize() for part in s.replace("-", "_").split("_"))


def scaffold_pipeline(category: str, name: str, base_dir: str = "pipelines") -> str:
    if category not in ALLOWED_CATEGORIES:
        raise ValueError(f"Category '{category}' must be one of {ALLOWED_CATEGORIES}")

    name_snake = name.lower().replace("-", "_")
    name_camel = to_camel(name_snake)
    name_title = name_snake.replace("_", " ").title()
    name_upper = name_snake.upper()

    target_dir = os.path.join(base_dir, category, name_snake)
    os.makedirs(target_dir, exist_ok=True)

    params = {
        "name_snake": name_snake,
        "name_camel": name_camel,
        "name_title": name_title,
        "name_upper": name_upper,
    }

    files = {
        "__init__.py": '"""\nPipeline package.\n"""\n',
        "cleaner.py": CLEANER_TEMPLATE.format(**params),
        "packer.py": PACKER_TEMPLATE.format(**params),
        "drive_sync.py": DRIVE_SYNC_TEMPLATE.format(**params),
        "ledger.py": LEDGER_TEMPLATE.format(**params),
        "orchestrator.py": ORCHESTRATOR_TEMPLATE.format(**params),
        f"test_{name_snake}_pipeline.py": TEST_TEMPLATE.format(**params),
    }

    for filename, content in files.items():
        filepath = os.path.join(target_dir, filename)
        if not os.path.exists(filepath):
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[SCAFFOLD] Created {filepath}")
        else:
            print(f"[SCAFFOLD] Skipped existing {filepath}")

    return target_dir


def main():
    parser = argparse.ArgumentParser(description="Protokol-7 Pipeline Scaffolder")
    parser.add_argument("--category", choices=ALLOWED_CATEGORIES, required=True, help="Pipeline taxonomy category")
    parser.add_argument("--name", required=True, help="Pipeline identifier name (e.g. common_crawl, pubmed)")
    parser.add_argument("--base-dir", default="pipelines", help="Root pipelines directory")
    args = parser.parse_args()

    target = scaffold_pipeline(args.category, args.name, args.base_dir)
    print(f"[OK] Pipeline successfully scaffolded at: {target}")


if __name__ == "__main__":
    main()
