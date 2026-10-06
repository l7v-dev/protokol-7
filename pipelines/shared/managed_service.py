"""Own one child process and bound startup and graceful termination waits."""
from abc import ABC, abstractmethod
import math
import os
import subprocess
import time
from threading import RLock
from pipelines.shared.managed_process_control import ManagedProcessControl


class ServiceStartError(RuntimeError):
    pass


class ManagedService(ABC):
    def __init__(self, *, startup_timeout_s=10, graceful_shutdown_timeout_s=60, cwd=None):
        for value in (startup_timeout_s, graceful_shutdown_timeout_s):
            if not math.isfinite(value) or value <= 0:
                raise ValueError('Timeout must be positive and finite')
        self.startup_timeout_s = startup_timeout_s
        self.graceful_shutdown_timeout_s = graceful_shutdown_timeout_s
        self.cwd = cwd
        self._proc = None
        self._control = None
        self._lock = RLock()

    @abstractmethod
    def command(self):
        raise NotImplementedError

    def is_connectable(self):
        return self._proc is not None and self._proc.poll() is None

    def start(self):
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                raise RuntimeError('Service is already running')
            try:
                self._proc = subprocess.Popen(self.command(), cwd=self.cwd, start_new_session=True)
                started = time.monotonic()
                attempt = 0
                while time.monotonic() - started < self.startup_timeout_s:
                    if self._proc.poll() is not None:
                        raise ServiceStartError('Child exited before readiness')
                    if self.is_connectable():
                        return self
                    time.sleep(min(.01 + .05 * attempt, .5))
                    attempt += 1
                raise ServiceStartError('Readiness deadline expired')
            except BaseException:
                self.stop()
                raise

    def stop(self):
        with self._lock:
            process = self._proc
            if self._control:
                self._control.close()
                self._control = None
            if process is None:
                return
            if process.poll() is None:
                try:
                    process.terminate()
                except ProcessLookupError:
                    pass
            try:
                process.wait(timeout=self.graceful_shutdown_timeout_s)
            except subprocess.TimeoutExpired:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
            self._proc = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *args):
        self.stop()


class PipelineService(ManagedService):
    """Run a watcher-enabled Python command; readiness means authenticated handshake."""
    def __init__(self, argv, **kwargs):
        super().__init__(**kwargs)
        self.argv = list(argv)

    def command(self):
        return self.argv

    def start(self):
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                raise RuntimeError('Service is already running')
            if self._proc is not None or self._control is not None:
                self.stop()
            self._control = ManagedProcessControl.create()
            try:
                self._proc = subprocess.Popen(self.command(), cwd=self.cwd, env={**os.environ, **self._control.child_env()},
                                              pass_fds=(self._control.child.fileno(),), start_new_session=True)
                self._control.release_child()
                self._control.start()
                started = time.monotonic()
                while time.monotonic() - started < self.startup_timeout_s:
                    if self._proc.poll() is not None:
                        raise ServiceStartError('Child exited before control handshake')
                    if self._control.is_ready():
                        return self
                    time.sleep(.02)
                raise ServiceStartError('Control handshake deadline expired')
            except BaseException:
                self.stop()
                raise

    def stop(self):
        with self._lock:
            if not self._control:
                return super().stop()
            self._control.close()
            self._control = None
            process = self._proc
            if process is None:
                return
            try:
                process.wait(timeout=self.graceful_shutdown_timeout_s)
            except subprocess.TimeoutExpired:
                try:
                    process.terminate()
                    process.wait(timeout=.5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
                except ProcessLookupError:
                    process.wait(timeout=5)
            self._proc = None


PIPELINE_ENTRYPOINTS = {
    'doaj': 'pipelines/api_stream/doaj/orchestrator.py',
    'aperta': 'pipelines/api_stream/aperta/orchestrator.py',
    'aperta-assets': 'pipelines/api_stream/aperta/pdf_downloader.py',
    'dergipark-fulltext': 'pipelines/api_stream/dergipark/fulltext_runner.py',
    'huggingface': 'pipelines/snapshot/huggingface/orchestrator.py',
}


def pipeline_service(source, arguments=(), **kwargs):
    """Construct a service without starting it; arguments remain a literal argv list."""
    import sys
    from pathlib import Path
    if source not in PIPELINE_ENTRYPOINTS:
        raise ValueError('Unknown pipeline source')
    root = Path(__file__).resolve().parents[2]
    return PipelineService([sys.executable, str(root / PIPELINE_ENTRYPOINTS[source]), *arguments],
                           cwd=str(root), **kwargs)
