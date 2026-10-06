"""Bounded retry execution with injectable clocks and HTTP Retry-After support."""
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import math
import random
import time
import urllib.error
from typing import Callable, TypeVar

from pipelines.shared.error_classifier import is_retriable

T = TypeVar("T")


def retry_after_seconds(value: str | None, *, now: datetime | None = None,
                        maximum: float = 30.0) -> float | None:
    if value is None:
        return None
    try:
        delay = float(value)
    except (ValueError, TypeError):
        try:
            deadline = parsedate_to_datetime(value)
            if deadline.tzinfo is None:
                return None
            delay = (deadline - (now or datetime.now(timezone.utc))).total_seconds()
        except (ValueError, TypeError, OverflowError):
            return None
    if not math.isfinite(delay):
        return None
    return min(maximum, max(0.0, delay))


@dataclass(frozen=True)
class RetryPolicy:
    strategy: str = "exponential"
    interval: float = 1.0
    maximum: float = 30.0
    factor: float = 2.0
    max_attempts: int = 5
    total_duration: float | None = None

    def __post_init__(self):
        if self.strategy not in {"constant", "exponential", "random"}:
            raise ValueError("Unknown retry strategy")
        if isinstance(self.max_attempts, bool) or not isinstance(self.max_attempts, int) or self.max_attempts < 1:
            raise ValueError("max_attempts must be a positive integer")
        for value in (self.interval, self.maximum, self.factor):
            if isinstance(value, bool) or not math.isfinite(value) or value <= 0:
                raise ValueError("Retry parameters must be positive and finite")
        if self.factor < 1 or self.interval > self.maximum:
            raise ValueError("Invalid retry factor or cap")
        if self.total_duration is not None and (not math.isfinite(self.total_duration) or self.total_duration <= 0):
            raise ValueError("total_duration must be positive and finite")

    def delay(self, failure_number: int) -> float:
        if failure_number < 1:
            raise ValueError("failure_number must be positive")
        if self.strategy == "constant":
            return self.interval
        if self.factor == 1:
            return random.uniform(0.0, self.interval) if self.strategy == "random" else self.interval
        exponent = failure_number - 1
        threshold = math.log(self.maximum / self.interval) / math.log(self.factor)
        ceiling = self.maximum if exponent >= threshold else self.interval * self.factor ** exponent
        return random.uniform(0.0, ceiling) if self.strategy == "random" else ceiling

    def execute(self, operation: Callable[[], T], *, sleep=time.sleep,
                clock=time.monotonic) -> T:
        """Duration bounds retry scheduling; the transport owns each request timeout."""
        from pipelines.shared.daemon_run import record_current_retry_policy
        record_current_retry_policy(asdict(self))
        started = clock()
        for attempt in range(1, self.max_attempts + 1):
            try:
                return operation()
            except Exception as error:
                if attempt == self.max_attempts or not is_retriable(error):
                    raise
                delay = self.delay(attempt)
                if isinstance(error, urllib.error.HTTPError):
                    header = error.headers.get("Retry-After") if error.headers else None
                    specified = retry_after_seconds(header, maximum=self.maximum)
                    if specified is not None:
                        delay = specified
                if self.total_duration is not None and clock() - started + delay >= self.total_duration:
                    raise
                sleep(delay)
                if self.total_duration is not None and clock() - started >= self.total_duration:
                    raise
        raise AssertionError("Unreachable retry state")
