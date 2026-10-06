"""Document parsing contract and atomic publication of validated output pairs."""
import asyncio
import fcntl
import json
import os
import shutil
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ParseResult:
    raw_text: str
    metadata: dict
    source_path: str
    page_count: int | None = None

    def save(self, destination):
        """Publish text.md and meta.json together in a new destination directory."""
        if not isinstance(self.raw_text, str) or not isinstance(self.metadata, dict) or not isinstance(self.source_path, str):
            raise ValueError("Invalid parse result")
        if self.page_count is not None and (isinstance(self.page_count, bool) or not isinstance(self.page_count, int) or self.page_count < 0):
            raise ValueError("Invalid page_count")
        encoded = json.dumps(self.metadata, ensure_ascii=False, allow_nan=False, sort_keys=True)
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise FileExistsError(destination)
        staging = Path(tempfile.mkdtemp(prefix='.parse-', dir=destination.parent))
        try:
            for name, text in [('text.md', self.raw_text), ('meta.json', encoded)]:
                with (staging / name).open('w', encoding='utf-8') as output:
                    output.write(text)
                    output.flush()
                    os.fsync(output.fileno())
            with (destination.parent / '.document-publish.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                if destination.exists():
                    raise FileExistsError(destination)
                os.rename(staging, destination)
        finally:
            if staging.exists():
                shutil.rmtree(staging)


class DocumentParser(ABC):
    @abstractmethod
    def parse(self, path, *, page_range='') -> ParseResult:
        raise NotImplementedError

    async def parse_async(self, path, **kwargs):
        return await asyncio.to_thread(self.parse, path, **kwargs)

    def parse_batch(self, paths, **kwargs):
        return [self.parse(path, **kwargs) for path in paths]

    async def parse_batch_async(self, paths, **kwargs):
        return await asyncio.gather(*(self.parse_async(path, **kwargs) for path in paths))

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
