"""Conservative retry classification for read-only HTTP operations."""
import errno
import http.client
import ssl
import urllib.error

RETRY_STATUSES = frozenset({429, 499, 500, 502, 503, 504, *range(520, 531)})
RETRY_ERRNOS = frozenset({errno.ECONNRESET, errno.ECONNREFUSED, errno.ECONNABORTED,
                          errno.ETIMEDOUT, errno.ENETUNREACH, errno.EHOSTUNREACH})


def is_retriable(error: Exception) -> bool:
    """Unknown, certificate, permission, and storage failures fail closed."""
    if isinstance(error, urllib.error.HTTPError):
        return error.code in RETRY_STATUSES
    if isinstance(error, ssl.SSLError):
        return False
    if isinstance(error, urllib.error.URLError):
        return isinstance(error.reason, Exception) and is_retriable(error.reason)
    if isinstance(error, (TimeoutError, ConnectionError, http.client.IncompleteRead,
                          http.client.RemoteDisconnected)):
        return True
    return isinstance(error, OSError) and error.errno in RETRY_ERRNOS
