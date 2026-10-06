"""Phase six boundary tests use isolated catalogs and no external services."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock
import subprocess
import sys
from pydantic import ValidationError
from pipelines.shared.condition_wait import wait_until
from pipelines.shared.cache_mode import CacheMode
from pipelines.shared.step_context import StepContext
from pipelines.shared.format_extractor import FormatExtractor
from pipelines.shared.extraction_tier import ExtractionTier, select_tier
from pipelines.shared.domain_rate_limiter import DomainLimitRule, DomainRateLimiter
from pipelines.shared.url_dedup import DiskUrlDedup
from pipelines.shared.actor_telemetry import ActorTelemetry
from pipelines.shared.shutdown_coordinator import ShutdownCoordinator
from pipelines.shared.cli_validation import PipelineArguments, validate_cli
from pipelines.shared.daemon_run import DaemonRun


class PhaseSixTests(unittest.TestCase):
    def test_wait_transient_and_return_value(self):
        now = [0]
        predicate = Mock(side_effect=[LookupError(), False, 'ready'])
        result = wait_until(predicate, 1, .2, (LookupError,), clock=lambda: now[0], sleep=lambda delay: now.__setitem__(0, now[0] + delay))
        self.assertEqual((result, now[0]), ('ready', .4))

    def test_wait_deadline_and_fatal(self):
        now, sleeps = [0], []
        def sleep(delay):
            sleeps.append(delay); now[0] += delay
        with self.assertRaises(TimeoutError):
            wait_until(lambda: False, .25, .2, clock=lambda: now[0], sleep=sleep)
        self.assertAlmostEqual(sum(sleeps), .25)
        with self.assertRaises(PermissionError):
            wait_until(Mock(side_effect=PermissionError()), ignored=(LookupError,))

    def test_cache_read_policy(self):
        self.assertEqual([mode.value for mode in CacheMode if mode.can_read], ['enabled', 'read_only'])

    def test_cache_write_and_invalid(self):
        self.assertEqual([mode.value for mode in CacheMode if mode.can_write], ['enabled', 'write_only'])
        with self.assertRaises(ValueError):
            CacheMode('unknown')

    def test_input_nested_and_missing(self):
        context = StepContext({'source': {'count': 0}})
        self.assertEqual(context.resolve('${input.source.count}'), 0)
        with self.assertRaises(KeyError):
            context.resolve('${input.source.missing}')

    def test_input_rejects_execution_and_attributes(self):
        context = StepContext({'source': object()})
        for expression in ('${input.__class__}', '${input.source()}', 'prefix ${input.source}'):
            with self.assertRaises(ValueError):
                context.resolve(expression)
        with self.assertRaises(KeyError):
            context.resolve('${input.source.attribute}')

    def test_format_dispatch_options(self):
        parser = Mock(); parser.parse.return_value = 'parsed'
        extractor = FormatExtractor({'.TXT': parser})
        self.assertEqual(extractor.parse('sample.TXT', encoding='utf8'), 'parsed')
        parser.parse.assert_called_once_with('sample.TXT', encoding='utf8')

    def test_format_unknown_and_registration(self):
        with self.assertRaises(ValueError):
            FormatExtractor().parse('sample.docx')
        with self.assertRaises(ValueError):
            FormatExtractor({'txt': object()})

    def test_tier_thresholds_and_budget(self):
        costs = {ExtractionTier.TEXT: 0, ExtractionTier.OCR: 2, ExtractionTier.FULL: 5}
        self.assertEqual(select_tier(10_000_001, 2, costs=costs), ExtractionTier.OCR)
        self.assertEqual(select_tier(100_000_001, 5, costs=costs), ExtractionTier.FULL)
        with self.assertRaises(ValueError):
            select_tier(100_000_001, 4, costs=costs)

    def test_tier_unavailable_and_invalid(self):
        with self.assertRaises(ValueError):
            select_tier(10_000_001, 100)
        for size, budget in ((-1, 1), (True, 1), (1, float('nan'))):
            with self.assertRaises(ValueError):
                select_tier(size, budget)

    def test_domain_rules_pacing_and_feedback(self):
        now = [0]
        limiter = DomainRateLimiter([DomainLimitRule('*.example.org', 2)], clock=lambda: now[0], sleep=lambda delay: now.__setitem__(0, now[0] + delay), jitter=lambda: 1)
        limiter.wait('https://a.example.org'); limiter.wait('http://a.example.org./path')
        self.assertEqual(now[0], 2)
        self.assertEqual(limiter.update_delay('https://a.example.org', 429), 4)
        self.assertEqual(limiter.update_delay('https://b.example.org', 200), 2)

    def test_domain_receipts_restart_and_invalid_url(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'urls.sqlite'
            with DiskUrlDedup(path) as store:
                limiter = DomainRateLimiter(url_store=store)
                self.assertFalse(limiter.is_seen('https://example.org/a'))
                limiter.mark_seen('https://example.org/a')
            with DiskUrlDedup(path) as store:
                self.assertTrue(DomainRateLimiter(url_store=store).is_seen('https://example.org/a'))
        with self.assertRaises(ValueError):
            DomainRateLimiter().wait('file:///etc/passwd')

    def test_telemetry_exact_cost_and_concurrency(self):
        telemetry = ActorTelemetry(input_price='2', output_price='5')
        with ThreadPoolExecutor(4) as pool:
            list(pool.map(lambda _: telemetry.record(1000, 200), range(100)))
        self.assertEqual(telemetry.snapshot(), {'input_tokens': 100000, 'output_tokens': 20000, 'cost': '0.3'})

    def test_telemetry_unknown_and_invalid(self):
        telemetry = ActorTelemetry()
        self.assertIsNone(telemetry.snapshot()['cost'])
        with self.assertRaises(ValueError):
            telemetry.record(-1)
        with self.assertRaises(ValueError):
            ActorTelemetry(input_price='NaN')

    def test_shutdown_order_and_idempotence(self):
        closed = []
        coordinator = ShutdownCoordinator()
        coordinator.register('ledger', lambda: closed.append('ledger'))
        coordinator.register('upload', lambda: closed.append('upload'), ['ledger'])
        coordinator.register('producer', lambda: closed.append('producer'), ['upload'])
        coordinator.close(); coordinator.close()
        self.assertEqual(closed, ['producer', 'upload', 'ledger'])

    def test_shutdown_failure_retains_dependencies_and_retries(self):
        ledger, upload = Mock(), Mock(side_effect=[RuntimeError('drain'), None])
        coordinator = ShutdownCoordinator()
        coordinator.register('ledger', ledger)
        coordinator.register('upload', upload, ['ledger'])
        with self.assertRaises(ExceptionGroup):
            coordinator.close()
        ledger.assert_not_called()
        coordinator.close(); ledger.assert_called_once()

    def test_shutdown_cycle_validated_before_close(self):
        close = Mock(); coordinator = ShutdownCoordinator()
        coordinator.register('a', close, ['b']); coordinator.register('b', close, ['a'])
        with self.assertRaises(ValueError):
            coordinator.close()
        close.assert_not_called()

    def test_cli_rejects_numbers_and_archive_bounds(self):
        for args in ({'workers': 0}, {'max_files': -1}, {'rate_limit': float('inf')}, {'target_gb': 52, 'max_gb': 51}):
            with self.assertRaises(ValidationError):
                PipelineArguments.model_validate(args)

    def test_cli_preserves_namespace_and_errors_before_run(self):
        args = argparse.Namespace(max_files=0, unrelated='preserved')
        parser = argparse.ArgumentParser()
        self.assertIs(validate_cli(parser, args), args)
        with self.assertRaises(SystemExit) as error:
            validate_cli(parser, argparse.Namespace(batch_size=-1))
        self.assertEqual(error.exception.code, 2)

    def test_cli_entrypoints_reject_before_resource_construction(self):
        cases = (
            ('pipelines/api_stream/doaj/orchestrator.py', '--batch-size', 'run'),
            ('pipelines/api_stream/aperta/orchestrator.py', '--batch-size', 'run'),
            ('pipelines/api_stream/dergipark/fulltext_runner.py', '--workers', 'run'),
            ('pipelines/api_stream/aperta/pdf_downloader.py', '--max-files', 'ApertaPdfDownloader'),
            ('pipelines/snapshot/huggingface/orchestrator.py', '--max-files', 'connect'),
        )
        script = """import importlib.util,sys
from pathlib import Path
from unittest.mock import patch
path=Path(sys.argv[1]); sys.path.insert(0,str(path.parent.resolve()))
spec=importlib.util.spec_from_file_location('fixture',path)
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
argv=['pipeline',sys.argv[2],'-1']
if 'huggingface' in str(path): argv.insert(1,'run')
with patch.object(module,sys.argv[3]) as resource,patch.object(sys,'argv',argv):
    try: module.main()
    except SystemExit as error: assert error.code==2
    else: raise AssertionError('CLI accepted invalid bounds')
    resource.assert_not_called()
"""
        for filename, flag, target in cases:
            with self.subTest(filename=filename):
                result = subprocess.run([sys.executable, '-c', script, filename, flag, target], capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_backfill_progress_bounds_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'run.sqlite'
            with DaemonRun(str(path), 'isolated') as run:
                bounds = ('2026-01-01T00:00:00+00:00', '2026-02-01T00:00:00+00:00')
                run.record_backfill(*bounds, '2026-01-10T00:00:00+00:00')
                with self.assertRaises(ValueError):
                    run.record_backfill(*bounds, '2026-01-05T00:00:00+00:00')
                with closing(sqlite3.connect(path)) as conn:
                    self.assertEqual(conn.execute('SELECT backfill_current FROM pipeline_runs').fetchone()[0], '2026-01-10T00:00:00+00:00')

    def test_backfill_schema_reopen_and_terminal_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'run.sqlite')
            with DaemonRun(path, 'first') as run:
                with self.assertRaises(ValueError):
                    run.record_backfill('2026-01-01', '2026-02-01', '2026-01-10')
            with self.assertRaises(RuntimeError):
                run.record_backfill('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-01-10T00:00:00Z')
            with DaemonRun(path, 'second'):
                pass
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(conn.execute('SELECT count(*) FROM pipeline_runs').fetchone()[0], 2)
