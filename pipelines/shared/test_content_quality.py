import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from pipelines.shared.document_parser import ParseResult
from pipelines.shared.pymupdf_parser import PyMuPDFParser
from pipelines.shared.content_dedup import content_fingerprint, Simhash, LRUSimhashCache
from pipelines.shared.url_dedup import DiskUrlDedup


class ContentQualityTests(unittest.TestCase):
    def test_save_validates_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'result'
            with self.assertRaises(ValueError):
                ParseResult('text', {'invalid': float('nan')}, 'source').save(destination)
            self.assertFalse(destination.exists())

    def test_save_rolls_back_second_file_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'result'
            original = Path.open
            def open_file(path, *args, **kwargs):
                if path.name == 'meta.json':
                    raise OSError('disk full')
                return original(path, *args, **kwargs)
            with patch.object(Path, 'open', open_file):
                with self.assertRaises(OSError):
                    ParseResult('text', {}, 'source').save(destination)
            self.assertFalse(destination.exists())
            self.assertEqual(list(Path(directory).glob('.parse-*')), [])

    def test_save_pair_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'result'
            result = ParseResult('text', {'language': 'tr'}, 'source', 1)
            result.save(destination)
            self.assertEqual((destination / 'text.md').read_text(), 'text')
            self.assertEqual(json.loads((destination / 'meta.json').read_text()), {'language': 'tr'})
            with self.assertRaises(FileExistsError):
                result.save(destination)

    def test_pdf_page_range_async_and_document_close(self):
        import pymupdf
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.pdf'
            with pymupdf.open() as document:
                document.new_page().insert_text((72, 72), 'First page text')
                document.new_page().insert_text((72, 72), 'Second page text')
                document.save(path)
            with PyMuPDFParser() as parser:
                result = parser.parse(path, page_range='2')
                self.assertEqual(result.page_count, 2)
                self.assertIn('Second page', result.raw_text)
                self.assertNotIn('First page', result.raw_text)
                self.assertEqual(len(asyncio.run(parser.parse_batch_async([path, path]))), 2)
                with self.assertRaises(ValueError):
                    parser.parse(path, page_range='3')

    def test_similarity_and_cache_scope(self):
        text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
        self.assertEqual(Simhash(text).similarity(Simhash(text)), 1)
        self.assertLess(Simhash(text).similarity(Simhash('independent unrelated sentence')), .9)
        cache = LRUSimhashCache(capacity=1)
        self.assertFalse(cache.is_near_duplicate(text))
        self.assertTrue(cache.is_near_duplicate(text))
        cache.is_near_duplicate('independent unrelated sentence')
        self.assertFalse(cache.is_near_duplicate(text))
        self.assertEqual(len(content_fingerprint(text)), 16)
        with self.assertRaises(ValueError):
            content_fingerprint('')

    def test_similar_content_and_thread_race(self):
        from concurrent.futures import ThreadPoolExecutor
        text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa ' * 20
        self.assertGreaterEqual(Simhash(text).similarity(Simhash(text + 'additional ending')), .9)
        cache = LRUSimhashCache()
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(cache.is_near_duplicate, [text] * 20))
        self.assertEqual(sum(results), 19)

    def test_publish_failure_removes_staging(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'result'
            with patch('os.rename', side_effect=OSError('rename failed')):
                with self.assertRaises(OSError):
                    ParseResult('text', {}, 'source').save(destination)
            self.assertFalse(destination.exists())
            self.assertEqual(list(Path(directory).glob('.parse-*')), [])

    def test_urls_survive_restart_and_are_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'urls.sqlite')
            with DiskUrlDedup(path) as urls:
                self.assertFalse(urls.is_seen('https://example.org/a?revision=1'))
                urls.mark_seen('https://example.org/a?revision=1')
                urls.mark_seen('https://example.org/a?revision=1')
            with DiskUrlDedup(path) as urls:
                self.assertTrue(urls.is_seen('https://example.org/a?revision=1'))
                self.assertFalse(urls.is_seen('https://example.org/a?revision=2'))
