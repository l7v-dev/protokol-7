"""Dispatch explicitly registered formats; PDF defaults to text-layer parsing."""
from pathlib import Path
from pipelines.shared.pymupdf_parser import PyMuPDFParser


class FormatExtractor:
    def __init__(self, parsers=None):
        self.parsers = {'pdf': PyMuPDFParser()}
        for extension, parser in (parsers or {}).items():
            key = extension.lower().lstrip('.')
            if not key or not callable(getattr(parser, 'parse', None)):
                raise ValueError('Invalid format registration')
            self.parsers[key] = parser

    def parse(self, path, **options):
        extension = Path(path).suffix.lower().lstrip('.')
        if extension not in self.parsers:
            raise ValueError(f'Unsupported format: {extension}')
        return self.parsers[extension].parse(path, **options)
