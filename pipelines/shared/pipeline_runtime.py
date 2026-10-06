"""Run-local stop accounting and opt-in inherited process control."""
from contextlib import contextmanager
from contextvars import ContextVar
import os
import signal
import threading
import json
import time
from pipelines.shared.pipeline_stats import PipelineStats
from pipelines.shared.pipeline_stopper import PipelineStopper, StopConditions
from pipelines.shared.managed_process_control import ManagedProcessControlWatcher

_CURRENT_STATS = ContextVar('pipeline_stats', default=None)
_CURRENT_STOPPER = ContextVar('pipeline_stopper', default=None)


def current_stopper():
    return _CURRENT_STOPPER.get()


def current_stats():
    return _CURRENT_STATS.get()


@contextmanager
def pipeline_runtime(*, interrupt_on_parent_loss=True):
    stats = PipelineStats()
    stopper = PipelineStopper(StopConditions.from_environment(), stats=stats)
    stats_token = _CURRENT_STATS.set(stats)
    token = _CURRENT_STOPPER.set(stopper)
    previous = None
    previous_interrupt = None
    watcher = None
    def shutdown():
        stopper.request_stop('parent_lost')
        if interrupt_on_parent_loss:
            os.kill(os.getpid(), signal.SIGINT)
    try:
        if threading.current_thread() is threading.main_thread():
            previous = signal.getsignal(signal.SIGTERM)
            previous_interrupt = signal.getsignal(signal.SIGINT)
            def terminate(signum, frame):
                stopper.request_stop('operator_signal')
                raise KeyboardInterrupt
            signal.signal(signal.SIGTERM, terminate)
            signal.signal(signal.SIGINT, terminate)
        watcher = ManagedProcessControlWatcher.from_environment(shutdown)
        if watcher:
            watcher.start()
        yield stopper
    finally:
        if watcher:
            watcher.close()
        if previous is not None:
            signal.signal(signal.SIGTERM, previous)
            signal.signal(signal.SIGINT, previous_interrupt)
        stats.set("elapsed_seconds", time.monotonic() - stopper.started)
        stats.set("stop_reason", stopper.should_stop()[1])
        print("[STATS] " + json.dumps(stats.dump(), sort_keys=True), flush=True)
        _CURRENT_STATS.reset(stats_token)
        _CURRENT_STOPPER.reset(token)
