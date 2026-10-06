"""HTTP transport that pins vetted DNS addresses before sending request bytes."""
import http.client
import ipaddress
import os
import socket
import ssl
import urllib.parse
import urllib.request


class UnsafeAddressError(ValueError):
    """The URL or connected peer violates the public-address transport policy."""


def _public_address(address: str) -> bool:
    parsed = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
        parsed = parsed.ipv4_mapped
    return parsed.is_global and not parsed.is_multicast


def _connect_public(destination, timeout, source_address=None):
    host, port = destination
    candidates = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not candidates or any(not _public_address(candidate[4][0]) for candidate in candidates):
        raise UnsafeAddressError("DNS contains a non-public address")
    last_error = None
    for family, kind, protocol, _, address in candidates:
        connection = socket.socket(family, kind, protocol)
        try:
            connection.settimeout(timeout)
            if source_address:
                connection.bind(source_address)
            connection.connect(address)
            peer = connection.getpeername()[0]
            if not _public_address(peer) or ipaddress.ip_address(peer) != ipaddress.ip_address(address[0]):
                raise UnsafeAddressError("Connected peer differs from the vetted public address")
            return connection
        except Exception as error:
            connection.close()
            if not isinstance(error, OSError):
                raise
            last_error = error
    raise last_error or UnsafeAddressError("No public address available")


class _HTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _connect_public


class _HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _connect_public


class _HTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, request):
        return self.do_open(_HTTPConnection, request)


class _HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        return self.do_open(_HTTPSConnection, request, context=self._context)


def _validate_url(url: str):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username is not None:
        raise UnsafeAddressError("Only HTTP(S) URLs without user credentials are allowed")
    if any(ord(character) < 33 for character in url):
        raise UnsafeAddressError("URL contains whitespace or control characters")
    _ = parsed.port
    return parsed


class _RedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        previous = _validate_url(request.full_url)
        target = _validate_url(new_url)
        if previous.scheme == "https" and target.scheme != "https":
            raise UnsafeAddressError("HTTPS downgrade redirect rejected")
        redirected = super().redirect_request(request, response, code, message, headers, new_url)
        if redirected and (previous.scheme, previous.hostname, previous.port) != (target.scheme, target.hostname, target.port):
            for header in ("Authorization", "Cookie", "Proxy-Authorization"):
                redirected.remove_header(header)
        return redirected


def urlopen(request, *, timeout, context=None):
    """Disable implicit proxies; each hop uses pinned DNS and normal TLS hostname checks."""
    setting = os.environ.get("SSRF_PROTECTION", "true").lower()
    if setting not in {"true", "false"}:
        raise ValueError("SSRF_PROTECTION must be true or false")
    if setting == "false":
        return urllib.request.urlopen(request, timeout=timeout, context=context)
    _validate_url(request.full_url if isinstance(request, urllib.request.Request) else request)
    tls = context or ssl.create_default_context()
    if not tls.check_hostname or tls.verify_mode != ssl.CERT_REQUIRED:
        raise ValueError("HTTP transport requires TLS certificate and hostname verification")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _HTTPHandler(),
                                         _HTTPSHandler(context=tls), _RedirectHandler())
    return opener.open(request, timeout=timeout)
