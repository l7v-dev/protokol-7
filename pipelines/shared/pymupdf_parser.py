"""PDF text-layer parsing with explicit document lifetime and page selection."""
import re
from pathlib import Path
from pipelines.shared.document_parser import DocumentParser, ParseResult


class PyMuPDFParser(DocumentParser):
    def parse(self, path, *, page_range=''):
        return self.parse_bytes(Path(path).read_bytes(), source_path=str(path), page_range=page_range)

    def parse_bytes(self, payload, *, source_path='', page_range=''):
        import pymupdf
        if not payload or not payload.startswith(b'%PDF'):
            raise ValueError("Invalid PDF bytes")
        with pymupdf.open(stream=payload, filetype='pdf') as document:
            selected = set(range(document.page_count))
            if page_range:
                selected = set()
                for segment in page_range.split(','):
                    match = re.fullmatch(r'\s*(\d+)(?:-(\d+))?\s*', segment)
                    if not match:
                        raise ValueError("Invalid page range")
                    first, last = int(match[1]), int(match[2] or match[1])
                    if first < 1 or last < first or last > document.page_count:
                        raise ValueError("Page range exceeds document")
                    selected.update(range(first - 1, last))
            pages = []
            for number in sorted(selected):
                text = document[number].get_text('text')
                cleaned = re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t]+', ' ', text)).strip()
                if cleaned:
                    pages.append(f'<!-- Page {number + 1} -->\n{cleaned}')
            return ParseResult('\n\n'.join(pages).strip(), {'selected_pages': [number + 1 for number in sorted(selected)]},
                               source_path, document.page_count)
