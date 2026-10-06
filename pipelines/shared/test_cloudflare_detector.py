import unittest
from unittest.mock import patch
from pipelines.shared.cloudflare_detector import challenge_type, reject_challenge, ChallengeError


class ChallengeTests(unittest.TestCase):
    def test_challenge_types(self):
        for markup, expected in [('<title>Just a moment...</title>', 'js'),
                                 ('<input name="cf-turnstile-response">', 'turnstile'),
                                 ('<title>Access denied</title>', 'access_denied'),
                                 ('<div id="cf-please-wait"></div>', 'js')]:
            self.assertEqual(challenge_type(markup), expected)
            with self.assertRaises(ChallengeError):
                reject_challenge(markup.encode())

    def test_normal_content_and_quoted_words(self):
        for payload in [b'<records><title>Article</title></records>', b'%PDF-1.7',
                        b'<p>Cloudflare access denied documentation</p>']:
            reject_challenge(payload)

    def test_metadata_challenge_is_not_retried(self):
        from pipelines.api_stream.dergipark.downloader import DergiParkDownloader
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'<title>Just a moment...</title>'
        with patch('pipelines.api_stream.dergipark.downloader.urlopen', return_value=response) as request:
            with self.assertRaises(ChallengeError):
                DergiParkDownloader(min_interval=0)._fetch_raw('https://example.org')
            self.assertEqual(request.call_count, 1)

    def test_pdf_unsafe_address_is_not_retried(self):
        from pipelines.api_stream.dergipark.pdf_extractor import DergiParkPdfExtractor
        from pipelines.shared.safe_http import UnsafeAddressError
        with patch('pipelines.api_stream.dergipark.pdf_extractor.urlopen', side_effect=UnsafeAddressError()) as request:
            payload, reason = DergiParkPdfExtractor().fetch_pdf_bytes('https://example.org/a.pdf')
            self.assertIsNone(payload)
            self.assertEqual(reason, 'network_error_UnsafeAddressError')
            self.assertEqual(request.call_count, 1)
