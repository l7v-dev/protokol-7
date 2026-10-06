import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch
from pipelines.shared.managed_service import ManagedService, PipelineService, ServiceStartError
from pipelines.shared.pipeline_stopper import PipelineStopper, StopConditions


class SleepService(ManagedService):
    def command(self):
        return [sys.executable, '-c', 'import time; time.sleep(60)']


class LifecycleTests(unittest.TestCase):
    def test_stop_conditions_and_first_reason(self):
        for config, advance, expected in [(StopConditions(timeout_s=2), 'time', 'timeout'),
                                          (StopConditions(max_records=2), 'records', 'max_records'),
                                          (StopConditions(max_errors=2), 'errors', 'max_errors'),
                                          (StopConditions(idle_timeout_s=2), 'time', 'idle_timeout')]:
            now = [0]
            stopper = PipelineStopper(config, clock=lambda: now[0])
            if advance == 'time':
                now[0] = 2
            elif advance == 'records':
                stopper.record_processed(2)
            else:
                stopper.record_error(); stopper.record_error()
            self.assertEqual(stopper.should_stop(), (True, expected))
            stopper.request_stop('later')
            self.assertEqual(stopper.should_stop()[1], expected)

    def test_idle_activity_resets_and_invalid_conditions(self):
        now = [0]
        stopper = PipelineStopper(StopConditions(idle_timeout_s=2), clock=lambda: now[0])
        now[0] = 1
        stopper.record_item()
        now[0] = 2
        self.assertEqual(stopper.should_stop(), (False, None))
        for kwargs in [{'max_records': 0}, {'max_errors': True}, {'timeout_s': float('nan')}]:
            with self.assertRaises(ValueError):
                StopConditions(**kwargs)

    def test_term_timeout_kill_and_join(self):
        service = SleepService(graceful_shutdown_timeout_s=.1)
        process = MagicMock()
        process.poll.return_value = None
        process.wait.side_effect = [subprocess.TimeoutExpired('child', .1), 0]
        service._proc = process
        service.stop()
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        self.assertEqual(process.wait.call_count, 2)
        service.stop()
        self.assertEqual(process.kill.call_count, 1)

    def test_controlled_service_readiness_failure(self):
        service = PipelineService([sys.executable, '-c', 'import time; time.sleep(10)'],
                                  startup_timeout_s=.1, graceful_shutdown_timeout_s=.1)
        with self.assertRaises(ServiceStartError):
            service.start()
        self.assertIsNone(service._proc)
        self.assertIsNone(service._control)

    def test_runtime_restores_signal_handlers(self):
        from pipelines.shared.pipeline_runtime import pipeline_runtime
        before = (signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGINT))
        with pipeline_runtime():
            self.assertNotEqual(signal.getsignal(signal.SIGTERM), before[0])
        self.assertEqual((signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGINT)), before)

    def test_factory_does_not_start_process(self):
        from pipelines.shared.managed_service import pipeline_service
        service = pipeline_service('doaj', ['--no-drive'])
        self.assertIsNone(service._proc)
        self.assertEqual(service.command()[-1], '--no-drive')
        with self.assertRaises(ValueError):
            pipeline_service('unknown')

    def test_real_child_termination(self):
        service = SleepService(graceful_shutdown_timeout_s=.2)
        service.start()
        process = service._proc
        service.stop()
        self.assertIsNotNone(process.poll())

    def test_readiness_failure_cleans_up(self):
        service = SleepService(startup_timeout_s=.1, graceful_shutdown_timeout_s=.1)
        service.is_connectable = lambda: False
        with self.assertRaises(ServiceStartError):
            service.start()
        self.assertIsNone(service._proc)

    def test_control_handshake_and_channel_close(self):
        script = '''
from threading import Event
from pipelines.shared.managed_process_control import ManagedProcessControlWatcher
stop = Event()
watcher = ManagedProcessControlWatcher.from_environment(stop.set)
watcher.start()
stop.wait(10)
watcher.close()
'''
        service = PipelineService([sys.executable, '-c', script], graceful_shutdown_timeout_s=.5)
        service.start()
        process = service._proc
        service.stop()
        self.assertEqual(process.returncode, 0)

    def test_wrong_hmac_requests_shutdown(self):
        import socket
        from threading import Event
        from pipelines.shared.managed_process_control import ManagedProcessControlWatcher
        parent, child = socket.socketpair()
        stopped = Event()
        watcher = ManagedProcessControlWatcher(child, b'a' * 32, stopped.set)
        try:
            watcher.start()
            parent.recv(34)
            parent.sendall(b'HB' + b'x' * 32)
            self.assertTrue(stopped.wait(2))
        finally:
            watcher.close()
            parent.close()

    def test_parent_sigkill_child_observes_eof(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = str(Path(directory) / 'closed')
            child_script = '''
from threading import Event
from pathlib import Path
from pipelines.shared.managed_process_control import ManagedProcessControlWatcher
stopped = Event()
watcher = ManagedProcessControlWatcher.from_environment(stopped.set)
watcher.start()
stopped.wait(10)
Path(MARKER).write_text('closed')
watcher.close()
'''.replace('MARKER', repr(marker))
            parent_script = f'''
import sys, time
from pipelines.shared.managed_service import PipelineService
service = PipelineService([sys.executable, '-c', {child_script!r}])
service.start()
print(service._proc.pid, flush=True)
time.sleep(30)
'''
            process = subprocess.Popen([sys.executable, '-c', parent_script], stdout=subprocess.PIPE, text=True)
            try:
                child_pid = int(process.stdout.readline())
                process.kill()
                process.wait(timeout=2)
                deadline = time.monotonic() + 3
                while not Path(marker).exists() and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertEqual(Path(marker).read_text(), 'closed')
            finally:
                if process.poll() is None:
                    process.kill(); process.wait(timeout=2)
                process.stdout.close()
