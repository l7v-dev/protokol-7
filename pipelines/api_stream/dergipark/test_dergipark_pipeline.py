#!/usr/bin/env python3
"""
Unit and Integration Tests for DergiPark Ingestion Pipeline -- protokol-7
"""

import os
import shutil
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import DergiParkCleaner
from downloader import DergiParkDownloader
from drive_sync import DergiParkDriveSync
from fulltext_packer import DergiParkFulltextSharder
from ledger import DergiParkLedger
from packer import DergiParkParquetSharder
from pdf_extractor import DergiParkPdfExtractor, ThreadSafeRateLimiter
from pdf_tar_packer import DergiParkPdfTarSharder




@pytest.fixture
def tmp_dir():
    d = tempfile.mkdtemp(prefix="test_dergipark_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_cleaner_valid_record():
    cleaner = DergiParkCleaner()
    raw = {
        "id": "oai:dergipark.org.tr:article/12345",
        "title": "Türkiye'de Bilişim Hukuku ve Veri Koruma Standartları",
        "abstract": "Bu çalışma Kişisel Verilerin Korunması Kanunu (KVKK) çerçevesinde yapılmıştır.",
        "authors": ["Yılmaz, Ali", "Demir, Ayşe"],
        "journal": "Hukuk Araştırmaları Dergisi, Vol. 12 No. 2, ISSN: 1300-1234",
        "publisher": "Adalet Yayınevi",
        "date": "2023-06-15",
        "language": "tr",
        "identifiers": [
            "https://dergipark.org.tr/article/12345",
            "https://doi.org/10.1234/had.2023.12345",
            "https://dergipark.org.tr/article/12345/download.pdf",
        ],
        "keywords": ["bilişim hukuku", "kvkk", "veri güvenliği"],
    }
    rec = cleaner.clean_record(raw)
    assert rec is not None
    assert rec["id"] == "article/12345"
    assert rec["title"] == "Türkiye'de Bilişim Hukuku ve Veri Koruma Standartları"
    assert "Yılmaz, Ali" in rec["authors"]
    assert rec["doi"] == "10.1234/had.2023.12345"
    assert rec["issn"] == "1300-1234"
    assert rec["language"] == "tr"
    assert rec["year"] == 2023
    assert rec["fulltext_url"] == "https://dergipark.org.tr/article/12345/download.pdf"
    assert rec["char_count"] > 50
    assert rec["word_count"] > 10


def test_cleaner_landing_page_and_doi_url():
    cleaner = DergiParkCleaner()
    # 1. Landing page URL extraction
    raw = {
        "id": "oai:dergipark.org.tr:article/99999",
        "title": "Yapay Zeka ve Hukuk",
        "abstract": "Ozet metin",
        "authors": ["Veli, Can"],
        "journal": "Bilisim Dergisi",
        "identifiers": [
            "https://dergipark.org.tr/tr/pub/bilisim/article/99999",
            "https://doi.org/10.1234/bilisim.99999",
        ],
    }
    rec = cleaner.clean_record(raw)
    assert rec is not None
    assert rec["fulltext_url"] == "https://dergipark.org.tr/tr/pub/bilisim/article/99999"

    # 2. DOI fallback when no direct URL is present
    raw_doi_only = {
        "id": "oai:dergipark.org.tr:article/88888",
        "title": "Veri Analitigi",
        "abstract": "Ozet metin",
        "authors": ["Veli, Can"],
        "journal": "Veri Dergisi",
        "identifiers": [
            "https://doi.org/10.1234/veri.88888",
        ],
    }
    rec_doi = cleaner.clean_record(raw_doi_only)
    assert rec_doi is not None
    assert rec_doi["fulltext_url"] == "https://doi.org/10.1234/veri.88888"

    # 3. Set spec pattern fallback
    raw_set_only = {
        "id": "oai:dergipark.org.tr:article/77777",
        "set_spec": "mulkiye",
        "title": "Iktisat Tarihi",
        "abstract": "Ozet metin",
        "authors": ["Ahmet, Can"],
        "journal": "Mulkiye Dergisi",
    }
    rec_set = cleaner.clean_record(raw_set_only)
    assert rec_set is not None
    assert rec_set["fulltext_url"] == "https://dergipark.org.tr/tr/pub/mulkiye/article/77777"


def test_cleaner_turkish_normalization():
    cleaner = DergiParkCleaner()
    raw = {
        "id": "oai:dergipark.org.tr:article/999",
        "title": "Şiir ve Edebiyatta Çağdaş Öğeler &amp; İncelemeler",
        "abstract": "Özgün Türkçe metin: ç, ğ, ı, ö, ş, ü, İ harfleri korunmalıdır.",
        "language": "tur",
        "date": "2021",
    }
    rec = cleaner.clean_record(raw)
    assert rec is not None
    assert rec["title"] == "Şiir ve Edebiyatta Çağdaş Öğeler & İncelemeler"
    assert "Özgün Türkçe metin" in rec["abstract"]
    assert rec["language"] == "tr"
    assert rec["year"] == 2021


def test_cleaner_deleted_or_empty_rejected():
    cleaner = DergiParkCleaner()
    assert cleaner.clean_record({"status": "deleted"}) is None
    assert cleaner.clean_record({"id": "1", "title": "ab"}) is None
    assert cleaner.clean_record({}) is None


def test_cleaner_doi_and_issn_extraction():
    cleaner = DergiParkCleaner()
    raw = {
        "id": "test:article/100",
        "title": "Sağlık Bilimlerinde İstatistiksel Modeller",
        "journal": "Tıp ve Sağlık Dergisi",
        "identifiers": [
            "10.5555/tip.2020.100",
            "9876-543X",
        ],
    }
    rec = cleaner.clean_record(raw)
    assert rec is not None
    assert rec["doi"] == "10.5555/tip.2020.100"
    assert rec["issn"] == "9876-543X"


def test_downloader_xml_record_parser():
    downloader = DergiParkDownloader()
    sample_xml = """
    <record xmlns="http://www.openarchives.org/OAI/2.0/">
        <header>
            <identifier>oai:dergipark.org.tr:article/555</identifier>
            <datestamp>2026-01-01</datestamp>
        </header>
        <metadata>
            <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                       xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:title><![CDATA[Kuantum Hesaplama ve Kriptografi]]></dc:title>
                <dc:creator>Özdemir, Can</dc:creator>
                <dc:description>Kuantum algoritmalarının klasik şifrelemeye etkileri.</dc:description>
                <dc:date>2025-05-20</dc:date>
                <dc:publisher>TÜBİTAK</dc:publisher>
                <dc:source>Bilişim Bülteni, Vol. 5</dc:source>
                <dc:language>tr</dc:language>
                <dc:identifier>https://dergipark.org.tr/article/555</dc:identifier>
                <dc:subject>kuantum</dc:subject>
                <dc:subject>kripto</dc:subject>
            </oai_dc:dc>
        </metadata>
    </record>
    """
    elem = ET.fromstring(sample_xml)
    parsed = downloader._parse_oai_record(elem)
    assert parsed is not None
    assert parsed["id"] == "oai:dergipark.org.tr:article/555"
    assert parsed["title"] == "Kuantum Hesaplama ve Kriptografi"
    assert "Özdemir, Can" in parsed["authors"]
    assert parsed["publisher"] == "TÜBİTAK"
    assert "kuantum" in parsed["keywords"]


def test_ledger_index_and_retrieve(tmp_dir):
    db_path = os.path.join(tmp_dir, "test_dergipark.sqlite")
    central_db = os.path.join(tmp_dir, "test_central.sqlite")
    ledger = DergiParkLedger(db_path=db_path, central_db_path=central_db)

    record = {
        "id": "dp:101",
        "doi": "10.1000/dp101",
        "title": "Yapay Zeka ve Dil Modelleri",
        "journal": "Yapay Zeka Dergisi",
        "publisher": "TÜBİTAK",
        "issn": "2148-1234",
        "language": "tr",
        "year": 2026,
        "authors": "Gözüpek, Mehmet",
        "affiliations": "ODTÜ",
        "keywords": "yapay zeka, nlp",
        "subjects": "",
        "fulltext_url": "https://dergipark.org.tr/article/101.pdf",
        "char_count": 150,
        "word_count": 25,
    }

    ledger.index_article(record)
    assert ledger.get_article_count() == 1

    fetched = ledger.get_article("dp:101")
    assert fetched is not None
    assert fetched["title"] == "Yapay Zeka ve Dil Modelleri"
    assert fetched["year"] == 2026

    # Test journal stats
    j_stats = ledger.get_journal_stats()
    assert len(j_stats) == 1
    assert j_stats[0]["journal"] == "Yapay Zeka Dergisi"
    assert j_stats[0]["article_count"] == 1

    # Part index initial check
    assert ledger.get_next_part_index() == 0


def test_packer_parquet_generation(tmp_dir):
    shards_completed = []

    def on_shard(info):
        shards_completed.append(info)

    sharder = DergiParkParquetSharder(
        output_dir=tmp_dir,
        filename_prefix="test_dp",
        max_part_entries=2,
        batch_size=1,
        on_shard_completed=on_shard,
    )

    r1 = {
        "id": "1",
        "doi": "10.1/1",
        "title": "Makale 1",
        "abstract": "Özet 1",
        "journal": "Dergi A",
        "publisher": "Yayıncı A",
        "issn": "1111-2222",
        "language": "tr",
        "year": 2024,
        "authors": "Yazar 1",
        "affiliations": "",
        "keywords": "anahtar",
        "subjects": "",
        "fulltext_url": "",
        "char_count": 100,
        "word_count": 15,
    }
    r2 = {
        "id": "2",
        "doi": "10.1/2",
        "title": "Makale 2",
        "abstract": "Özet 2",
        "journal": "Dergi B",
        "publisher": "Yayıncı B",
        "issn": "3333-4444",
        "language": "en",
        "year": 2025,
        "authors": "Yazar 2",
        "affiliations": "",
        "keywords": "keyword",
        "subjects": "",
        "fulltext_url": "",
        "char_count": 120,
        "word_count": 18,
    }

    sharder.add_record(r1)
    sharder.add_record(r2)

    assert len(shards_completed) == 1
    s_info = shards_completed[0]
    assert s_info["record_count"] == 2
    assert s_info["shard_name"].startswith("test_dp_")
    assert s_info["byte_size"] > 0
    assert len(s_info["sha256"]) == 64
    assert len(s_info["md5"]) == 32


def test_drive_sync_dry_run(tmp_dir):
    fake_shard = os.path.join(tmp_dir, "fake_dergipark_p00000.parquet")
    with open(fake_shard, "wb") as f:
        f.write(b"PARQUET_TEST_PAYLOAD")

    sync = DergiParkDriveSync(dry_run=True)
    res = sync.sync_shard(fake_shard, purge_on_success=True)
    assert res["status"] in ("dry_run", "simulated", "uploaded")
    assert not os.path.exists(fake_shard)


def test_partitioner_date_windows():
    from partitioner import DergiParkPartitioner

    # 1. Auto mode
    parts = DergiParkPartitioner.generate_date_partitions(start_year=1970, end_year=2024, mode="auto")
    assert len(parts) > 10
    assert parts[0]["from_date"] == "1970-01-01"
    assert parts[-1]["until_date"] == "2024-12-31"

    # Verify chronological sequence
    for i in range(len(parts) - 1):
        assert parts[i]["from_date"] < parts[i + 1]["from_date"]

    # 2. Year mode
    y_parts = DergiParkPartitioner.generate_date_partitions(start_year=2020, end_year=2022, mode="year")
    assert len(y_parts) == 3
    assert y_parts[0]["partition_id"] == "dp_date_2020-01-01_2020-12-31"
    assert y_parts[2]["partition_id"] == "dp_date_2022-01-01_2022-12-31"

    # 3. Half year mode
    h_parts = DergiParkPartitioner.generate_date_partitions(start_year=2023, end_year=2023, mode="half_year")
    assert len(h_parts) == 2
    assert h_parts[0]["until_date"] == "2023-06-30"
    assert h_parts[1]["from_date"] == "2023-07-01"

    # 4. Error on inverted years
    with pytest.raises(ValueError):
        DergiParkPartitioner.generate_date_partitions(start_year=2025, end_year=2020)


def test_ledger_partition_and_deduplication(tmp_dir):
    db_path = os.path.join(tmp_dir, "test_part_dergipark.sqlite")
    ledger = DergiParkLedger(db_path=db_path)

    # 1. Deduplication helpers
    assert not ledger.has_article("article/123")
    assert len(ledger.load_existing_ids()) == 0

    ledger.index_article({
        "id": "article/123",
        "title": "Test Title",
        "journal": "Test Journal",
        "year": 2024,
    })
    assert ledger.has_article("article/123")
    existing = ledger.load_existing_ids()
    assert "article/123" in existing

    # 2. Partition tracking
    p1 = ledger.init_partition("dp_date_2024-01-01_2024-06-30", "2024-01-01", "2024-06-30")
    assert p1["status"] == "pending"
    assert p1["from_date"] == "2024-01-01"

    ledger.start_partition("dp_date_2024-01-01_2024-06-30")
    p1_running = ledger.get_partition("dp_date_2024-01-01_2024-06-30")
    assert p1_running["status"] == "running"
    assert p1_running["started_at"] is not None

    ledger.update_partition_progress("dp_date_2024-01-01_2024-06-30", resumption_token="tok_123", raw_count=100, clean_count=98, new_count=95)
    p1_prog = ledger.get_partition("dp_date_2024-01-01_2024-06-30")
    assert p1_prog["resumption_token"] == "tok_123"
    assert p1_prog["clean_count"] == 98
    assert p1_prog["new_count"] == 95

    ledger.complete_partition("dp_date_2024-01-01_2024-06-30", raw_count=200, clean_count=195, new_count=190)
    p1_done = ledger.get_partition("dp_date_2024-01-01_2024-06-30")
    assert p1_done["status"] == "completed"
    assert p1_done["resumption_token"] is None
    assert p1_done["completed_at"] is not None

    # List partitions
    completed = ledger.get_partitions(status="completed")
    assert len(completed) == 1
    assert completed[0]["partition_id"] == "dp_date_2024-01-01_2024-06-30"


def test_downloader_token_callback(monkeypatch):
    downloader = DergiParkDownloader()
    sample_xml = b"""<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
        <ListRecords>
            <record>
                <header>
                    <identifier>oai:dergipark.org.tr:article/1</identifier>
                    <datestamp>2024-01-01</datestamp>
                </header>
                <metadata>
                    <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                               xmlns:dc="http://purl.org/dc/elements/1.1/">
                        <dc:title>Test</dc:title>
                    </oai_dc:dc>
                </metadata>
            </record>
            <resumptionToken>next_token_abc123</resumptionToken>
        </ListRecords>
    </OAI-PMH>"""

    tokens_received = []

    def fake_fetch(url):
        if "next_token_abc123" in url:
            return b"""<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><ListRecords></ListRecords></OAI-PMH>"""
        return sample_xml

    monkeypatch.setattr(downloader, "_fetch_raw", fake_fetch)

    records = list(downloader.stream_records(on_token_update=lambda t: tokens_received.append(t)))
    assert len(records) == 1
    assert tokens_received == ["next_token_abc123"]


def test_rate_limiter_pacing():
    limiter = ThreadSafeRateLimiter(min_interval=0.05)
    t0 = time.time()
    limiter.wait()
    limiter.wait()
    elapsed = time.time() - t0
    assert elapsed >= 0.04


def test_pdf_extractor_resolve_url(monkeypatch):
    extractor = DergiParkPdfExtractor()
    # 1. Direct PDF URL
    direct = "https://dergipark.org.tr/tr/download/article-file/12345"
    assert extractor.resolve_pdf_url(direct) == direct

    # 2. Landing page resolving via HTML regex
    sample_html = b"""
    <html>
        <body>
            <a class="btn btn-sm btn-outline-secondary" href="/tr/download/article-file/998877">
                <span>PDF</span>
            </a>
        </body>
    </html>
    """

    class FakeResponse:
        def __init__(self, data):
            self.data = data
        def read(self):
            return self.data
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout, context: FakeResponse(sample_html))

    resolved = extractor.resolve_pdf_url("https://dergipark.org.tr/tr/pub/journal/article/100")
    assert resolved == "https://dergipark.org.tr/tr/download/article-file/998877"


def test_pdf_extractor_extract_text():
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    sample_text = (
        "Turkiye Bilimsel ve Teknolojik Arastirma Kurumu ULAKBIM DergiPark "
        "acik erisimli akademik makale veri tabani tam metin katmani. "
        "Yapay Zeka ve Dogal Dil Isleme Sistemleri Arastirmalari."
    )
    page.insert_text((50, 50), sample_text)
    pdf_bytes = doc.tobytes()

    extractor = DergiParkPdfExtractor()
    res = extractor.extract_text(pdf_bytes)

    assert res["status"] == "extracted"
    assert res["page_count"] == 1
    assert "DergiPark" in res["text"]
    assert "ULAKBIM" in res["text"]
    assert res["char_count"] >= 100
    assert res["word_count"] >= 15


    # Invalid bytes
    res_err = extractor.extract_text(b"NOT_A_PDF")
    assert res_err["status"] == "failed"


def test_pdf_extractor_process_article(monkeypatch):
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Makale özeti ve tam metni. " * 15)
    pdf_bytes = doc.tobytes()

    extractor = DergiParkPdfExtractor()
    monkeypatch.setattr(extractor, "resolve_pdf_url", lambda u: "https://dergipark.org.tr/tr/download/article-file/111")
    monkeypatch.setattr(extractor, "fetch_pdf_bytes", lambda u: (pdf_bytes, None))

    art = {
        "id": "dp:777",
        "title": "Bilişim Sistemleri",
        "journal": "Bilişim Dergisi",
        "year": 2024,
        "language": "tr",
        "doi": "10.1234/dp.777",
        "fulltext_url": "https://dergipark.org.tr/tr/pub/bilisim/article/777",
    }
    res = extractor.process_article(art)
    assert res["id"] == "dp:777"
    assert res["status"] == "extracted"
    assert res["pdf_url"] == "https://dergipark.org.tr/tr/download/article-file/111"
    assert res["page_count"] == 1
    assert res["char_count"] > 100


def test_fulltext_sharder_generation(tmp_dir):
    shards_completed = []

    def on_shard(info):
        shards_completed.append(info)

    sharder = DergiParkFulltextSharder(
        output_dir=tmp_dir,
        filename_prefix="test_fulltext",
        max_part_entries=2,
        batch_size=1,
        on_shard_completed=on_shard,
    )

    art1 = {
        "id": "dp:101",
        "doi": "10.1000/101",
        "title": "Makale 1",
        "journal": "Dergi A",
        "year": 2024,
        "language": "tr",
        "pdf_url": "https://dergipark.org.tr/download/101.pdf",
        "page_count": 5,
        "text": "Tam metin icerik 1",
        "char_count": 18,
        "word_count": 4,
        "extracted_at": "2026-10-03T12:00:00",
    }
    art2 = {
        "id": "dp:102",
        "doi": "10.1000/102",
        "title": "Makale 2",
        "journal": "Dergi B",
        "year": 2025,
        "language": "tr",
        "pdf_url": "https://dergipark.org.tr/download/102.pdf",
        "page_count": 10,
        "text": "Tam metin icerik 2",
        "char_count": 18,
        "word_count": 4,
        "extracted_at": "2026-10-03T12:01:00",
    }

    assert sharder.current_shard_name.startswith("test_fulltext_")
    sharder.append_article_fulltext(art1)
    sharder.append_article_fulltext(art2)

    assert len(shards_completed) == 1
    s_info = shards_completed[0]
    assert s_info["record_count"] == 2
    assert s_info["shard_name"].startswith("test_fulltext_")
    assert s_info["byte_size"] > 0
    assert len(s_info["sha256"]) == 64
    assert len(s_info["md5"]) == 32


def test_ledger_pdf_status_and_stats(tmp_dir):
    db_path = os.path.join(tmp_dir, "test_pdf_ledger.sqlite")
    ledger = DergiParkLedger(db_path=db_path)

    a1 = {
        "id": "dp:pdf:1",
        "title": "Makale PDF 1",
        "journal": "Dergi 1",
        "year": 2023,
        "fulltext_url": "https://dergipark.org.tr/article/1",
    }
    a2 = {
        "id": "dp:pdf:2",
        "title": "Makale PDF 2",
        "journal": "Dergi 2",
        "year": 2024,
        "fulltext_url": "https://dergipark.org.tr/article/2",
    }
    ledger.index_article(a1)
    ledger.index_article(a2)

    pending = ledger.get_pending_pdf_articles(limit=10)
    assert len(pending) == 2
    assert pending[0]["id"] == "dp:pdf:2"  # ordered by year DESC

    # Mark a1 as extracted
    ledger.mark_pdf_extracted(
        article_id="dp:pdf:1",
        pdf_url="https://dergipark.org.tr/download/1.pdf",
        page_count=8,
        char_count=15000,
        word_count=2200,
        shard_name="dergipark_fulltext_20261003_p00000.parquet",
    )
    # Mark a2 as failed
    ledger.mark_pdf_failed(
        article_id="dp:pdf:2",
        status="failed",
        pdf_url="https://dergipark.org.tr/download/2.pdf",
    )

    stats = ledger.get_pdf_stats()
    assert stats.get("extracted") == 1
    assert stats.get("failed") == 1
    assert stats.get("pending", 0) == 0

    art1_row = ledger.get_article("dp:pdf:1")
    assert art1_row["pdf_status"] == "extracted"
    assert art1_row["page_count"] == 8
    assert art1_row["char_count"] == 15000
    assert art1_row["pdf_shard_name"] == "dergipark_fulltext_20261003_p00000.parquet"

    # Fulltext part index check
    assert ledger.get_next_fulltext_part_index() == 0


def test_pdf_tar_packer(tmp_dir):
    shards_completed = []

    def on_shard(info):
        shards_completed.append(info)

    sharder = DergiParkPdfTarSharder(
        output_dir=tmp_dir,
        filename_prefix="test_pdf_archive",
        max_part_entries=2,
        on_shard_completed=on_shard,
    )

    pdf1 = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    pdf2 = b"%PDF-1.7\n2 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    sh1 = sharder.append_pdf("article/1001", pdf1)
    assert sh1.startswith("test_pdf_archive_")
    sh2 = sharder.append_pdf("article/1002", pdf2)

    assert len(shards_completed) == 1
    s_info = shards_completed[0]
    assert s_info["record_count"] == 2
    assert s_info["shard_name"].endswith(".tar.gz")
    assert s_info["byte_size"] > 0
    assert len(s_info["sha256"]) == 64
    assert len(s_info["md5"]) == 32

    # Verify tar contents
    import tarfile
    with tarfile.open(s_info["file_path"], "r:gz") as tar:
        names = tar.getnames()
        assert "article_1001.pdf" in names
        assert "article_1002.pdf" in names


def test_ledger_pdf_archive_tracking(tmp_dir):
    db_path = os.path.join(tmp_dir, "test_archive_ledger.sqlite")
    ledger = DergiParkLedger(db_path=db_path)

    ledger.index_article({
        "id": "dp:art:1",
        "title": "Test Title",
        "journal": "Test Journal",
        "fulltext_url": "https://dergipark.org.tr/article/1",
    })

    ledger.mark_pdf_extracted(
        article_id="dp:art:1",
        pdf_url="https://dergipark.org.tr/download/1.pdf",
        page_count=12,
        char_count=20000,
        word_count=3000,
        shard_name="dergipark_fulltext_20261003_p00000.parquet",
        archive_name="dergipark_raw_pdfs_20261003_p00000.tar.gz",
    )

    art = ledger.get_article("dp:art:1")
    assert art["pdf_status"] == "extracted"
    assert art["pdf_archive_name"] == "dergipark_raw_pdfs_20261003_p00000.tar.gz"
    assert art["pdf_shard_name"] == "dergipark_fulltext_20261003_p00000.parquet"
    assert ledger.get_next_pdf_archive_part_index() == 0


def test_pdf_tar_packer_byte_rotation(tmp_dir):
    shards_completed = []

    def on_shard(info):
        shards_completed.append(info)

    # 100 bytes target threshold
    sharder = DergiParkPdfTarSharder(
        output_dir=tmp_dir,
        filename_prefix="test_byte_archive",
        target_bytes=100,
        on_shard_completed=on_shard,
    )

    pdf_chunk = b"%PDF-1.4 " + (b"A" * 60) + b"\n%%EOF"
    sharder.append_pdf("art1", pdf_chunk)
    assert len(shards_completed) == 0  # 70 bytes < 100 bytes

    sharder.append_pdf("art2", pdf_chunk)
    assert len(shards_completed) == 1  # 140 bytes >= 100 bytes -> rotated
    assert shards_completed[0]["record_count"] == 2


def test_pdf_tar_packer_disk_headroom_guard(tmp_dir, monkeypatch):
    shards_completed = []

    def on_shard(info):
        shards_completed.append(info)

    sharder = DergiParkPdfTarSharder(
        output_dir=tmp_dir,
        filename_prefix="test_headroom_archive",
        target_bytes=10000000,  # High target
        min_free_disk_gb=30.0,  # 30 GB threshold
        on_shard_completed=on_shard,
    )

    # Simulate low free disk space (10 GB free < 30 GB threshold)
    import collections
    Usage = collections.namedtuple("Usage", ["total", "used", "free"])
    monkeypatch.setattr("shutil.disk_usage", lambda path: Usage(total=100*(1024**3), used=90*(1024**3), free=10*(1024**3)))

    pdf_chunk = b"%PDF-1.4 test\n%%EOF"
    sharder.append_pdf("art_guard", pdf_chunk)

    # Should rotate immediately due to headroom guard
    assert len(shards_completed) == 1
    assert shards_completed[0]["record_count"] == 1




