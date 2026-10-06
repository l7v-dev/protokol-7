"""Bounded monotonic polling; predicate execution must supply its own timeout."""
import math
import time


def wait_until(fn, timeout=10, poll=.1, ignored=(), *, clock=time.monotonic, sleep=time.sleep):
    if not math.isfinite(timeout) or timeout < 0 or not math.isfinite(poll) or poll <= 0:
        raise ValueError('Invalid polling bounds')
    if not isinstance(ignored, tuple) or any(not isinstance(exc, type) or not issubclass(exc, Exception) for exc in ignored):
        raise ValueError('ignored must contain Exception classes')
    deadline = clock() + timeout
    while True:
        try:
            result = fn()
            if result:
                return result
        except ignored:
            pass
        remaining = deadline - clock()
        if remaining <= 0:
            raise TimeoutError('Condition did not become true')
        sleep(min(poll, remaining))
