import io
import socket
import unittest
from unittest.mock import MagicMock, patch
from pipelines.shared.curl_downloader import CurlDownloader
from pipelines.shared.safe_http import UnsafeAddressError


class CurlTests(unittest.TestCase):
    def client(self, responses):
        client = CurlDownloader()
        handles = []
        def create():
            status, headers, payload = responses[len(handles)]
            options = {}
            curl = MagicMock()
            curl.impersonate.return_value = 0
            curl.setopt.side_effect = lambda key, value: options.__setitem__(key, value)
            def perform():
                options[client.Opt.HEADERDATA].write(b'HTTP/2 ' + str(status).encode() + b'\r\n' + headers + b'\r\n\r\n')
                options[client.Opt.WRITEFUNCTION](payload)
            curl.perform.side_effect = perform
            curl.getinfo.side_effect = lambda key: getattr(client, 'test_peer', b'8.8.8.8') if key == client.Info.PRIMARY_IP else status
            handles.append((curl, options))
            return curl
        client.Curl = create
        return client, handles

    def dns(self, host, port, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', port))]

    def test_pinning_and_response(self):
        client, handles = self.client([(200, b'Content-Type: application/pdf', b'%PDF')])
        with patch('socket.getaddrinfo', side_effect=self.dns):
            with client.get('https://example.org/a') as response:
                self.assertEqual(response.read(2), b'%P')
                self.assertEqual(response.headers.get('Content-Type'), 'application/pdf')
        curl, options = handles[0]
        self.assertEqual(options[client.Opt.RESOLVE], ['example.org:443:8.8.8.8'])
        self.assertEqual(options[client.Opt.PROXY], b'')
        self.assertEqual(options[client.Opt.FOLLOWLOCATION], 0)
        curl.close.assert_called_once()

    def test_redirect_rechecks_dns_and_strips_credentials(self):
        client, handles = self.client([(302, b'Location: https://other.org/a', b''), (200, b'', b'ok')])
        with patch('socket.getaddrinfo', side_effect=self.dns) as dns:
            self.assertEqual(client.get('https://example.org', {'Authorization': 'secret'}).read(), b'ok')
        self.assertEqual(dns.call_count, 2)
        self.assertEqual(handles[1][1][client.Opt.HTTPHEADER], [])

    def test_private_dns_before_curl_handle(self):
        client, handles = self.client([])
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]
        with patch('socket.getaddrinfo', return_value=private):
            with self.assertRaises(UnsafeAddressError):
                client.get('https://example.org')
        self.assertEqual(handles, [])

    def test_downgrade_redirect_rejected(self):
        client, handles = self.client([(302, b'Location: http://example.org/a', b'')])
        with patch('socket.getaddrinfo', side_effect=self.dns):
            with self.assertRaises(UnsafeAddressError):
                client.get('https://example.org')
        self.assertEqual(len(handles), 1)

    def test_opt_in_fallback_and_default_transport(self):
        import urllib.error
        from pipelines.api_stream.dergipark.pdf_extractor import DergiParkPdfExtractor
        import urllib.request
        request = urllib.request.Request('https://example.org/a')
        error = urllib.error.HTTPError(request.full_url, 403, '', {}, None)
        with patch('pipelines.api_stream.dergipark.pdf_extractor.urlopen', side_effect=error):
            with self.assertRaises(urllib.error.HTTPError):
                DergiParkPdfExtractor()._open_http(request)
            extractor = DergiParkPdfExtractor(use_impersonation=True)
            extractor.curl_backend = MagicMock()
            extractor.curl_backend.get.return_value = io.BytesIO(b'ok')
            self.assertEqual(extractor._open_http(request).read(), b'ok')
            extractor.curl_backend.get.assert_called_once()
        error.close()

    def test_size_limit(self):
        client, handles = self.client([(200, b'', b'too large')])
        client.maximum_bytes = 2
        with patch('socket.getaddrinfo', side_effect=self.dns):
            with self.assertRaises(ValueError):
                client.get('https://example.org')
        handles[0][0].close.assert_called_once()

    def test_peer_mismatch_rejected(self):
        client, handles = self.client([(200, b'', b'ok')])
        client.test_peer = b'127.0.0.1'
        with patch('socket.getaddrinfo', side_effect=self.dns):
            with self.assertRaises(UnsafeAddressError):
                client.get('https://example.org')
        handles[0][0].close.assert_called_once()

    def test_redirect_to_private_address_before_second_handle(self):
        client, handles = self.client([(302, b'Location: https://private.org/a', b'')])
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('10.0.0.1', 443))]
        with patch('socket.getaddrinfo', side_effect=[self.dns('', 443), private]):
            with self.assertRaises(UnsafeAddressError):
                client.get('https://example.org')
        self.assertEqual(len(handles), 1)

    def test_profile_supported_without_network(self):
        from contextlib import closing
        client = CurlDownloader()
        with closing(client.Curl()) as curl:
            self.assertEqual(curl.impersonate('chrome120', default_headers=False), 0)
