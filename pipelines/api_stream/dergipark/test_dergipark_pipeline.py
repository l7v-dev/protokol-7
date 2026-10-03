#!/usr/bin/env python3
"""
Unit and Integration Tests for DergiPark Ingestion Pipeline -- protokol-7
"""

import os
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import DergiParkCleaner
from downloader import DergiParkDownloader
from drive_sync import DergiParkDriveSync
from ledger import DergiParkLedger
from packer import DergiParkParquetSharder


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
