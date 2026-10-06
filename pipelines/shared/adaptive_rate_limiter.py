"""Monotonic per-domain pacing with feedback and a compatibility cooldown."""
from dataclasses import dataclass
import math
import random
from threading import RLock
import time
from urllib.parse import urlsplit


@dataclass
class DomainState:
    current_delay: float
    fail_count: int = 0
    next_request_time: float = 0.0


class AdaptiveRateLimiter:
    def __init__(self, base_delay=.35, max_delay=60, *, clock=time.monotonic, sleep=time.sleep, jitter=None):
        if not math.isfinite(base_delay) or not math.isfinite(max_delay) or base_delay < 0 or max_delay <= 0 or base_delay > max_delay:
            raise ValueError('Invalid rate delay bounds')
        self.base_delay, self.max_delay = base_delay, max_delay
        self.clock, self.sleep = clock, sleep
        self.jitter = jitter or (lambda: random.uniform(.75, 1.25))
        self._domains = {}
        self._cooldown_until = 0
        self._lock = RLock()

    def _state(self, url):
        domain = (urlsplit(url).hostname or 'default').lower()
        return self._domains.setdefault(domain, DomainState(self.base_delay))

    def wait(self, url=''):
        while True:
            with self._lock:
                state = self._state(url)
                now = self.clock()
                delay = max(state.next_request_time, self._cooldown_until) - now
                if delay <= 0:
                    state.next_request_time = now + state.current_delay
                    return
            self.sleep(delay)

    def update_delay(self, url, status_code):
        with self._lock:
            state = self._state(url)
            if status_code in {429, 503}:
                state.current_delay = min(max(state.current_delay, .1) * 2 * self.jitter(), self.max_delay)
                state.fail_count += 1
                state.next_request_time = max(state.next_request_time, self.clock() + state.current_delay)
            elif 200 <= status_code < 400:
                state.current_delay = max(self.base_delay, state.current_delay * .75)
                state.fail_count = 0
            return state.current_delay

    def cooldown(self, seconds=8):
        if not math.isfinite(seconds) or seconds < 0:
            raise ValueError('Invalid cooldown duration')
        with self._lock:
            self._cooldown_until = max(self._cooldown_until, self.clock() + seconds)
