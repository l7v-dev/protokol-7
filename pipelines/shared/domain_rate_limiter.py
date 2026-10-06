"""Host rules reuse adaptive pacing and durable exact URL receipts."""
from dataclasses import dataclass
from fnmatch import fnmatchcase
import math
from threading import RLock
from urllib.parse import urlsplit
from pipelines.shared.adaptive_rate_limiter import AdaptiveRateLimiter


@dataclass(frozen=True)
class DomainLimitRule:
    pattern: str
    delay: float
    max_delay: float = 60

    def __post_init__(self):
        if not self.pattern or any(char in self.pattern for char in '/:@'):
            raise ValueError('Expected a hostname pattern')
        if not math.isfinite(self.delay) or not math.isfinite(self.max_delay) or not 0 <= self.delay <= self.max_delay or self.max_delay <= 0:
            raise ValueError('Invalid domain delay')


class DomainRateLimiter:
    def __init__(self, rules=(), *, url_store=None, **timing):
        self.rules = tuple(rules)
        self.url_store = url_store
        self.timing = timing
        self._hosts = {}
        self._lock = RLock()

    def _limiter(self, url):
        parsed = urlsplit(url)
        host = parsed.hostname
        if parsed.scheme not in ('http', 'https') or not host:
            raise ValueError('Expected HTTP URL')
        host = host.lower().rstrip('.')
        with self._lock:
            if host not in self._hosts:
                rule = next((rule for rule in self.rules if fnmatchcase(host, rule.pattern.lower())), DomainLimitRule('*', .35))
                self._hosts[host] = AdaptiveRateLimiter(rule.delay, rule.max_delay, **self.timing)
            return self._hosts[host], 'https://' + host

    def wait(self, url):
        limiter, host = self._limiter(url)
        limiter.wait(host)

    def update_delay(self, url, status):
        limiter, host = self._limiter(url)
        return limiter.update_delay(host, status)

    def is_seen(self, url):
        self._limiter(url)
        return self.url_store.is_seen(url) if self.url_store is not None else False

    def mark_seen(self, url):
        self._limiter(url)
        if self.url_store is None:
            raise RuntimeError('No URL receipt store configured')
        self.url_store.mark_seen(url)
