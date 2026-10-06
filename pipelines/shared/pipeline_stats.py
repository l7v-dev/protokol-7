"""Thread-safe JSON-safe run statistics with detached snapshots."""
from copy import deepcopy
import json
import math
from threading import RLock


class PipelineStats:
    def __init__(self):
        self._values = {}
        self._lock = RLock()

    def set(self, key, value):
        if not isinstance(key, str) or not key:
            raise ValueError('Stats key must be non-empty')
        json.dumps(value, allow_nan=False)
        with self._lock:
            self._values[key] = deepcopy(value)

    def inc(self, key, count=1):
        if isinstance(count, bool) or not isinstance(count, (int, float)) or not math.isfinite(count):
            raise ValueError("Stats increment must be finite")
        with self._lock:
            self.set(key, self._values.get(key, 0) + count)

    def max(self, key, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("Stats bound must be finite")
        with self._lock:
            self.set(key, max(self._values.get(key, value), value))

    def min(self, key, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("Stats bound must be finite")
        with self._lock:
            self.set(key, min(self._values.get(key, value), value))

    def dump(self):
        with self._lock:
            return deepcopy(self._values)


class DummyStats(PipelineStats):
    def __init__(self):
        pass
    def set(self, *args):
        pass
    def inc(self, *args):
        pass
    def max(self, *args):
        pass
    def min(self, *args):
        pass
    def dump(self):
        return {}
