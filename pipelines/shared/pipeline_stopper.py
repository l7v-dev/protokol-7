"""Monotonic, run-local stop conditions with a stable first stop reason."""
from dataclasses import dataclass
import math
import os
from threading import RLock
import time


@dataclass(frozen=True)
class StopConditions:
    timeout_s: float | None = None
    max_records: int | None = None
    max_errors: int | None = None
    idle_timeout_s: float | None = None

    def __post_init__(self):
        for value in (self.timeout_s, self.idle_timeout_s):
            if value is not None and (isinstance(value, bool) or not math.isfinite(value) or value <= 0):
                raise ValueError('Stop timeout must be positive and finite')
        for value in (self.max_records, self.max_errors):
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value <= 0):
                raise ValueError('Stop count must be a positive integer')

    @classmethod
    def from_environment(cls):
        values = {}
        for name, variable, convert in [('timeout_s', 'PROTOKOL_STOP_TIMEOUT_SECONDS', float),
                                       ('idle_timeout_s', 'PROTOKOL_STOP_IDLE_SECONDS', float),
                                       ('max_records', 'PROTOKOL_STOP_MAX_RECORDS', int),
                                       ('max_errors', 'PROTOKOL_STOP_MAX_ERRORS', int)]:
            value = os.environ.get(variable)
            if value is not None:
                values[name] = convert(value)
        return cls(**values)


class PipelineStopper:
    def __init__(self, conditions=None, *, clock=time.monotonic, stats=None):
        self.stats = stats
        self.conditions = conditions or StopConditions()
        self.clock = clock
        self.started = self.last_item = clock()
        self.records = self.errors = 0
        self.reason = None
        self._lock = RLock()

    def record_processed(self, count=1):
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValueError('Processed count must be nonnegative')
        with self._lock:
            self.records += count
            if self.stats:
                self.stats.inc("records_processed", count)
            if count:
                self.last_item = self.clock()

    def record_error(self):
        with self._lock:
            self.errors += 1
            if self.stats:
                self.stats.inc("errors")

    def record_item(self):
        with self._lock:
            self.last_item = self.clock()

    def request_stop(self, reason):
        if not isinstance(reason, str) or not reason:
            raise ValueError('Stop reason must be non-empty')
        with self._lock:
            self.reason = self.reason or reason

    def should_stop(self):
        with self._lock:
            now, config = self.clock(), self.conditions
            for condition, reason in [(config.timeout_s is not None and now - self.started >= (config.timeout_s or 0), 'timeout'),
                                      (config.max_records is not None and self.records >= (config.max_records or 0), 'max_records'),
                                      (config.max_errors is not None and self.errors >= (config.max_errors or 0), 'max_errors'),
                                      (config.idle_timeout_s is not None and now - self.last_item >= (config.idle_timeout_s or 0), 'idle_timeout')]:
                if condition:
                    self.reason = self.reason or reason
            return self.reason is not None, self.reason
