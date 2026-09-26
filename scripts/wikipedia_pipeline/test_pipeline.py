#!/usr/bin/env python3
import bz2
import os
import tempfile
import pyarrow.parquet as pq
import pytest

from cleaner import clean_wikitext, stream_articles
from packer import StreamingParquetSharder
from drive_queue import calculate_file_md5, GoogleDriveSequentialSyncQueue


def test_clean_wikitext_removes_markup_and_preserves_text():
    raw_wikitext = """
    <!-- bu bir yorumdur -->
    {{Bilgi kutusu|ad=Mustafa Kemal Atatürk|doğum=1881}}
    '''Mustafa Kemal Atatürk''', [[Türkiye|Türkiye Cumhuriyeti]]'nin kurucusudur.<ref>Kaynak 1</ref>
    == Yaşamı ==
    Selanik'te doğmuştur.<ref name="ref2"/>
    [[Kategori:Türk askerler]]
    [[Dosya:Ataturk.jpg|küçük|Atatürk portresi]]
    """
    cleaned = clean_wikitext(raw_wikitext)

    assert "<!-- bu bir yorumdur -->" not in cleaned
    assert "Bilgi kutusu" not in cleaned
    assert "Kaynak 1" not in cleaned
    assert "Kategori:Türk askerler" not in cleaned
    assert "Dosya:Ataturk.jpg" not in cleaned
    assert "Mustafa Kemal Atatürk, Türkiye Cumhuriyeti'nin kurucusudur." in cleaned
    assert "Yaşamı" in cleaned
    assert "Selanik'te doğmuştur." in cleaned


def test_stream_articles_filters_namespace_and_redirects():
    sample_xml = b"""<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
      <page>
        <title>Ana Madde</title>
        <ns>0</ns>
        <id>101</id>
        <revision>
          <text>Bu gecerli ve yeterince uzun bir ansiklopedik Turkce makale metnidir. LLM on egitimi icin temizlenecek ve kullanilacaktir. Minimum karakter sinirini rahatlikla asmaktadir.</text>
        </revision>
      </page>
      <page>
        <title>Yonlendirme Sayfasi</title>
        <ns>0</ns>
        <id>102</id>
        <redirect title="Ana Madde" />
        <revision>
          <text>#YONLENDIRME [[Ana Madde]]</text>
        </revision>
      </page>
      <page>
        <title>Kullanici:Ahmet</title>
        <ns>2</ns>
        <id>103</id>
        <revision>
          <text>Bu kullanici sayfasidir ve namespace sifir degildir, elenmelidir.</text>
        </revision>
      </page>
    </mediawiki>"""

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
        f.write(sample_xml)
        temp_xml = f.name

    try:
        articles = list(stream_articles(temp_xml, min_chars=50))
        assert len(articles) == 1
        assert articles[0]["id"] == "101"
        assert articles[0]["title"] == "Ana Madde"
        assert "Bu gecerli ve yeterince uzun bir ansiklopedik" in articles[0]["text"]
        assert articles[0]["url"] == "https://tr.wikipedia.org/wiki/Ana_Madde"

        articles_az = list(stream_articles(temp_xml, min_chars=50, lang="az"))
        assert articles_az[0]["url"] == "https://az.wikipedia.org/wiki/Ana_Madde"
    finally:
        if os.path.exists(temp_xml):
            os.remove(temp_xml)


def test_streaming_parquet_sharder():
    with tempfile.TemporaryDirectory() as tmp_dir:
        ready_parts = []

        def callback(path, count):
            ready_parts.append((path, count))

        sharder = StreamingParquetSharder(
            output_dir=tmp_dir,
            max_part_bytes=10 * 1024 * 1024 * 1024,  # 10 GB
            batch_size=5,
            compression="zstd",
            compression_level=6,
            on_part_ready=callback,
        )

        for i in range(12):
            sharder.add_article(
                {
                    "id": str(i),
                    "url": f"https://tr.wikipedia.org/wiki/Item_{i}",
                    "title": f"Madde {i}",
                    "text": f"Temiz makale icerigi {i}. LLM icin hazirlanmis Turkce metin.",
                }
            )

        sharder.close()

        assert len(ready_parts) == 1
        part_path, count = ready_parts[0]
        assert count == 12
        assert os.path.exists(part_path)

        # Verify Parquet file contents with pyarrow
        table = pq.read_table(part_path)
        assert table.num_rows == 12
        assert table.column_names == ["id", "url", "title", "text"]
        assert table["title"][0].as_py() == "Madde 0"


def test_drive_queue_dry_run_hash_verification_and_cleanup():
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = os.path.join(tmp_dir, "test-part.parquet")
        with open(test_file, "wb") as f:
            f.write(b"SAMPLE_PARQUET_DATA_STREAM")

        assert os.path.exists(test_file)
        md5_before = calculate_file_md5(test_file)
        assert len(md5_before) == 32

        queue = GoogleDriveSequentialSyncQueue(dry_run=True)
        success = queue.upload_and_verify(test_file)

        assert success is True
        # In dry run mode, local file must be preserved safely
        assert os.path.exists(test_file)


def test_downloader_in_flight_md5_verification():
    import hashlib
    from downloader import download_file, calculate_md5

    with tempfile.TemporaryDirectory() as tmp_dir:
        source_file = os.path.join(tmp_dir, "source.bin")
        target_file = os.path.join(tmp_dir, "target.bin")
        content = b"IN_FLIGHT_HASH_TEST_DATA_" * 1024
        with open(source_file, "wb") as f:
            f.write(content)

        expected_hash = hashlib.md5(content).hexdigest()
        file_url = f"file://{os.path.abspath(source_file)}"

        # 1. Successful in-flight verification
        out_path = download_file(file_url, target_file, expected_md5=expected_hash)
        assert os.path.exists(out_path)
        assert calculate_md5(out_path) == expected_hash

        # 2. Failed in-flight verification throws RuntimeError
        target_bad = os.path.join(tmp_dir, "bad.bin")
        with pytest.raises(RuntimeError) as exc_info:
            download_file(file_url, target_bad, expected_md5="00000000000000000000000000000000")
        assert "mismatch" in str(exc_info.value).lower()


def test_downloader_parallel_multipart_range():
    import hashlib
    import http.server
    import threading
    from downloader import download_file, calculate_md5

    with tempfile.TemporaryDirectory() as srv_dir, tempfile.TemporaryDirectory() as out_dir:
        test_content = b"PARALLEL_RANGE_CHUNK_BUFFER_DATA_" * 3000
        source_name = "test_chunk.bin"
        source_path = os.path.join(srv_dir, source_name)
        with open(source_path, "wb") as f:
            f.write(test_content)

        expected_hash = hashlib.md5(test_content).hexdigest()

        class RangeHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=srv_dir, **kwargs)

            def log_message(self, format, *args):
                pass  # suppress server log spam

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), RangeHandler)
        port = server.server_address[1]
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        try:
            http_url = f"http://127.0.0.1:{port}/{source_name}"
            target_path = os.path.join(out_dir, "downloaded.bin")

            out = download_file(
                http_url,
                target_path,
                expected_md5=expected_hash,
                concurrency=2,
                min_multipart_bytes=1000,
            )

            assert os.path.exists(out)
            assert calculate_md5(out) == expected_hash
            assert os.path.getsize(out) == len(test_content)
        finally:
            server.shutdown()
            server.server_close()


def test_stream_remote_articles_in_flight():
    import hashlib
    import http.server
    import threading
    from cleaner import stream_remote_articles

    sample_xml = b"""<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
      <page>
        <title>InFlight Test Article</title>
        <ns>0</ns>
        <id>777</id>
        <revision>
          <text>Bu makale uzak HTTP akisi uzerinden hic diske yazilmadan bellek icinde stream edilmistir. LLM on egitiminde disk IO darbozaini tamamen kaldirir.</text>
        </revision>
      </page>
    </mediawiki>"""

    compressed = bz2.compress(sample_xml)
    expected_md5 = hashlib.md5(compressed).hexdigest()

    with tempfile.TemporaryDirectory() as srv_dir:
        source_name = "test_dump.xml.bz2"
        with open(os.path.join(srv_dir, source_name), "wb") as f:
            f.write(compressed)

        class DumpHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=srv_dir, **kwargs)

            def log_message(self, format, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), DumpHandler)
        port = server.server_address[1]
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        try:
            dump_url = f"http://127.0.0.1:{port}/{source_name}"

            # 1. Valid stream with in-flight MD5 verification
            articles = list(stream_remote_articles(dump_url, expected_md5=expected_md5, min_chars=20))
            assert len(articles) == 1
            assert articles[0]["id"] == "777"
            assert articles[0]["title"] == "InFlight Test Article"
            assert "uzak HTTP akisi uzerinden" in articles[0]["text"]

            # 2. Corrupt/mismatched expected MD5 raises ValueError
            with pytest.raises(ValueError) as exc:
                list(stream_remote_articles(dump_url, expected_md5="00000000000000000000000000000000"))
            assert "verification failed" in str(exc.value)
        finally:
            server.shutdown()
            server.server_close()


def test_find_fastest_wikimedia_mirror():
    import http.server
    import threading
    from downloader import find_fastest_wikimedia_mirror

    with tempfile.TemporaryDirectory() as srv_dir:
        with open(os.path.join(srv_dir, "test.bz2"), "wb") as f:
            f.write(b"mirror_data")

        class MirrorHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=srv_dir, **kwargs)

            def log_message(self, format, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), MirrorHandler)
        port = server.server_address[1]
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        try:
            active_mirror = f"http://127.0.0.1:{port}"
            dead_mirror = "http://127.0.0.1:1"  # dead port

            selected = find_fastest_wikimedia_mirror(
                dump_url=f"http://example.com/test.bz2",
                mirrors=[dead_mirror, active_mirror],
                timeout=1.0,
            )

            assert active_mirror in selected
        finally:
            server.shutdown()
            server.server_close()


def test_downloader_redownloads_when_existing_file_corrupt():
    import hashlib
    from downloader import download_file, calculate_md5

    with tempfile.TemporaryDirectory() as tmp_dir:
        source_file = os.path.join(tmp_dir, "valid_source.bin")
        target_file = os.path.join(tmp_dir, "output.bin")
        valid_content = b"VALID_STREAM_CONTENT_12345"
        with open(source_file, "wb") as f:
            f.write(valid_content)

        expected_hash = hashlib.md5(valid_content).hexdigest()
        file_url = f"file://{os.path.abspath(source_file)}"

        # Create a corrupt existing file at output.bin
        with open(target_file, "wb") as f:
            f.write(b"CORRUPTED_OLD_CONTENT")

        # Must detect mismatch and overwrite with valid download
        out_path = download_file(file_url, target_file, expected_md5=expected_hash)
        assert os.path.exists(out_path)
        assert calculate_md5(out_path) == expected_hash




