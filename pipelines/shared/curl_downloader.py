"""Opt-in HTTPS impersonation with numeric DNS pinning and explicit redirects."""
import io
import math
from contextlib import closing
import ipaddress
import socket
import urllib.error
import urllib.parse
from email.parser import BytesParser

from pipelines.shared.safe_http import _validate_url, _public_address, UnsafeAddressError


class CurlDownloader:
    def __init__(self, impersonate="chrome120", maximum_bytes=50 * 1024 * 1024):
        if isinstance(maximum_bytes, bool) or not isinstance(maximum_bytes, int) or maximum_bytes <= 0:
            raise ValueError("maximum_bytes must be a positive integer")
        from curl_cffi import Curl, CurlOpt, CurlInfo, CurlError
        self.Curl, self.Opt, self.Info, self.Error = Curl, CurlOpt, CurlInfo, CurlError
        self.impersonate = impersonate
        self.maximum_bytes = maximum_bytes

    def get(self, url, headers=None, timeout=35):
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be positive and finite")
        headers = dict(headers or {})
        for hop in range(6):
            parsed = _validate_url(url)
            if parsed.scheme != "https":
                raise UnsafeAddressError("Impersonation requires HTTPS")
            host = parsed.hostname.encode("idna").decode("ascii")
            port = parsed.port or 443
            candidates = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            if not candidates or any(not _public_address(row[4][0]) for row in candidates):
                raise UnsafeAddressError("DNS contains a non-public address")
            address = candidates[0][4][0]
            pinned = f"[{address}]" if ":" in address else address
            body, raw_headers = io.BytesIO(), io.BytesIO()
            exceeded = False

            def consume(chunk):
                nonlocal exceeded
                if body.tell() + len(chunk) > self.maximum_bytes:
                    exceeded = True
                    return 0
                return body.write(chunk)

            with closing(self.Curl()) as curl:
                if curl.impersonate(self.impersonate, default_headers=False) != 0:
                    raise ValueError("Unsupported impersonation profile")
                curl.setopt(self.Opt.URL, url.encode())
                curl.setopt(self.Opt.RESOLVE, [f"{host}:{port}:{pinned}"])
                curl.setopt(self.Opt.PROXY, b"")
                curl.setopt(self.Opt.FOLLOWLOCATION, 0)
                curl.setopt(self.Opt.SSL_VERIFYPEER, 1)
                curl.setopt(self.Opt.SSL_VERIFYHOST, 2)
                curl.setopt(self.Opt.TIMEOUT_MS, int(timeout * 1000))
                curl.setopt(self.Opt.HTTPHEADER, [f"{key}: {value}".encode() for key, value in headers.items()])
                curl.setopt(self.Opt.WRITEFUNCTION, consume)
                curl.setopt(self.Opt.HEADERDATA, raw_headers)
                try:
                    curl.perform()
                except self.Error as error:
                    if exceeded:
                        raise ValueError("HTTP response exceeds byte limit") from error
                    if error.code == 28:
                        raise TimeoutError("Curl request timed out") from error
                    if error.code in {7, 18, 52, 55, 56}:
                        raise ConnectionError("Curl transport failed") from error
                    raise
                if exceeded:
                    raise ValueError("HTTP response exceeds byte limit")
                peer = curl.getinfo(self.Info.PRIMARY_IP).decode()
                if not _public_address(peer) or ipaddress.ip_address(peer) != ipaddress.ip_address(address):
                    raise UnsafeAddressError("Curl peer differs from pinned address")
                status = curl.getinfo(self.Info.RESPONSE_CODE)
            blocks = raw_headers.getvalue().strip().split(b"\r\n\r\n")
            response_headers = BytesParser().parsebytes(blocks[-1].split(b"\r\n", 1)[-1] + b"\r\n\r\n")
            if status in {301, 302, 303, 307, 308}:
                location = response_headers.get("Location")
                if not location or hop == 5:
                    raise ValueError("Invalid or excessive redirect")
                target = urllib.parse.urljoin(url, location)
                next_url = _validate_url(target)
                if (parsed.hostname, parsed.port) != (next_url.hostname, next_url.port):
                    headers = {key: value for key, value in headers.items()
                               if key.lower() not in {"authorization", "cookie", "proxy-authorization", "host"}}
                url = target
                continue
            response = io.BytesIO(body.getvalue())
            response.headers = response_headers
            response.status = status
            if status >= 400:
                raise urllib.error.HTTPError(url, status, "Curl HTTP error", response_headers, response)
            return response
        raise AssertionError("Unreachable redirect state")
