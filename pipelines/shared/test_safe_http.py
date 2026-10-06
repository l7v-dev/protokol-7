import socket
import unittest
import urllib.request
from unittest.mock import MagicMock, patch

from pipelines.shared.safe_http import (_connect_public, _public_address, _validate_url,
                                        _RedirectHandler, UnsafeAddressError)


class SafeHTTPTests(unittest.TestCase):
    def test_local_and_mapped_addresses_denied(self):
        for address in ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "224.0.0.1"]:
            self.assertFalse(_public_address(address))
        self.assertTrue(_public_address("8.8.8.8"))

    def test_mixed_dns_rejected_before_any_socket(self):
        candidates = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))
                      for address in ["8.8.8.8", "127.0.0.1"]]
        with patch("socket.getaddrinfo", return_value=candidates), patch("socket.socket") as factory:
            with self.assertRaises(UnsafeAddressError):
                _connect_public(("example.org", 443), 5)
            factory.assert_not_called()

    def test_pinned_numeric_connection(self):
        connection = MagicMock()
        connection.getpeername.return_value = ("8.8.8.8", 443)
        candidates = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
        with patch("socket.getaddrinfo", return_value=candidates) as resolve, patch("socket.socket", return_value=connection):
            self.assertIs(_connect_public(("example.org", 443), 5), connection)
        resolve.assert_called_once()
        connection.connect.assert_called_once_with(("8.8.8.8", 443))

    def test_peer_mismatch_closes_before_request(self):
        connection = MagicMock()
        connection.getpeername.return_value = ("127.0.0.1", 443)
        candidates = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
        with patch("socket.getaddrinfo", return_value=candidates), patch("socket.socket", return_value=connection):
            with self.assertRaises(UnsafeAddressError):
                _connect_public(("example.org", 443), 5)
        connection.close.assert_called_once()
        connection.sendall.assert_not_called()

    def test_redirect_credentials_and_downgrade(self):
        request = urllib.request.Request("https://example.org/a", headers={"Authorization": "secret", "Cookie": "secret"})
        handler = _RedirectHandler()
        redirected = handler.redirect_request(request, None, 302, "", {}, "https://other.org/b")
        self.assertIsNone(redirected.get_header("Authorization"))
        self.assertIsNone(redirected.get_header("Cookie"))
        with self.assertRaises(UnsafeAddressError):
            handler.redirect_request(request, None, 302, "", {}, "http://example.org/b")

    def test_non_http_and_credentials_denied(self):
        for url in ["file:///etc/passwd", "ftp://example.org/a", "https://user:pass@example.org", "https://example.org/\n"]:
            with self.assertRaises(ValueError):
                _validate_url(url)

    def test_public_api_rejects_loopback_before_socket(self):
        from pipelines.shared.safe_http import urlopen
        candidates = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        with patch("socket.getaddrinfo", return_value=candidates), patch("socket.socket") as factory:
            with self.assertRaises(UnsafeAddressError):
                urlopen("http://example.org", timeout=1)
            factory.assert_not_called()

    def test_tls_preserves_hostname_after_pinning(self):
        import ssl
        from pipelines.shared.safe_http import _HTTPSConnection
        context = MagicMock()
        context.verify_mode = ssl.CERT_REQUIRED
        context.check_hostname = True
        connection = _HTTPSConnection("example.org", context=context)
        peer = MagicMock()
        with patch("pipelines.shared.safe_http._connect_public", return_value=peer):
            connection._create_connection = __import__("pipelines.shared.safe_http", fromlist=["_connect_public"])._connect_public
            connection.connect()
        context.wrap_socket.assert_called_once_with(peer, server_hostname="example.org")
        connection.close()
