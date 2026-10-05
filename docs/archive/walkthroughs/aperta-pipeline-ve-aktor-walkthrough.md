# TUBITAK ULAKBIM Aperta Boru Hatti, PDF Arsivleme ve Cekirdek Aktor Walkthrough

## 1. Genel Bakis ve Kapsam

TUBITAK ULAKBIM Aperta (Turkiye Acik Arsivi - InvenioRDM tabanli acik bilim ve arastirma veri deposu) kayitlarini ve ekli veri ikililerini (arastirma veri setleri, tezler, makaleler, raporlar, sunumlar ve PDF'ler) protokole dahil etmek amaciyla:
1. Resumption-token tabanli OAI-PMH 2.0 streaming akisi ve Invenio REST API arama/detay istemcisi (`pipelines/api_stream/aperta/downloader.py`),
2. Cift dilli (Turkce ve Ingilizce) bilim dallarini, yazarlari, dosya baglantilarini ve metin metriklerini derleyen normalizator (`pipelines/api_stream/aperta/cleaner.py`),
3. ACID iliskisel SQLite katalog defteri (`data/catalogs/aperta_catalog.sqlite`), `aperta_records`, `aperta_files` ve `aperta_resumption` tablolari (`pipelines/api_stream/aperta/ledger.py`),
4. Zstandard seviye 6 sikistirmali PyArrow Parquet sharder (`pipelines/api_stream/aperta/packer.py`),
5. Ham PDF ve veri ikililerini silinmeden koruyan, WebDataset/Cold Vault uyumlu coklu-GB (10-50 GB, maks 51 GB) TAR.GZ arsiv paketleyicisi (`pipelines/api_stream/aperta/pdf_tar_packer.py`),
6. Asenkron PDF ve veri dosyasi indirme & arsivleme iscisi (`pipelines/api_stream/aperta/pdf_downloader.py`),
7. Google Drive senkronizasyonu (`pipelines/api_stream/aperta/drive_sync.py`),
8. CLI orkestratoru (`pipelines/api_stream/aperta/orchestrator.py`),
9. TypeScript mikroservis aktoru (`src/actors/corpus/aperta-actor.ts`, `POST /api/v1/aperta`, `query_aperta` MCP araci),
10. Sozlesmeler (`contracts/source-descriptors/aperta.json`, `contracts/field-mappings/aperta.json`), dbx senkronizasyonu ve test paketleri gelistirildi.

---

## 2. Yapilan Mimari Bilesenler

### A. Sozlesmeler ve Semalar
- `contracts/source-descriptors/aperta.json`: `source_id: aperta`, `method: oai_pmh`, `pagination: resumption_token`, `budget: 200000 req, 100 GB`, `rights_status: approved`.
- `contracts/field-mappings/aperta.json`: Invenio metaveri alanlarinin (baslik, yazarlar, aciklama, yayin tarihi, bilim dallari, dosya manifestosu) protokol-7 semasina donusum haritasi.

### B. Python Akis Boru Hatti (`pipelines/api_stream/aperta/`)
- **`downloader.py` (`ApertaDownloader`)**:
  - `fetch_oai_page`: XML ayrismasi, namespaces, `resumptionToken`, `cursor` ve `completeListSize` takibi.
  - `stream_oai_records`: Kesintisiz akis iteratoru.
  - `search_rest` & `get_record_detail`: Invenio REST API arama ve tekil kayit sorgulari.
  - Hız sinirlamasi: 1.0s nezaket araligi, Invenio `x-ratelimit-limit: 10` uyumu, HTTP 429/500/502/503/504 durumlarinda ussel geri cekilme.
- **`cleaner.py` (`ApertaCleaner`)**:
  - OAI Dublin Core ve Invenio REST payload'larini ayni semaya donusturur.
  - Cift dilli bilim dallarini (`aperta:science_branches`) Turkce ve Ingilizce olarak ayristirir.
  - Dosya manifestosunu (`files_json`, `file_count`, `total_file_size`) uretir.
- **`ledger.py` (`ApertaLedger`)**:
  - `data/catalogs/aperta_catalog.sqlite`: WAL modu, ACID transaksiyonlar.
  - `aperta_records`, `aperta_files`, `aperta_resumption`, `shards` tablolari.
  - `save_resumption_token` / `get_resumption_token` ile kalici checkpoint destegi.
- **`packer.py` (`ApertaParquetSharder`)**:
  - Zstandard seviye 6 sikistirmali PyArrow Parquet tablolari.
  - 50.000 kayit veya 512 MB rotasyon esigi.
- **`pdf_tar_packer.py` (`ApertaPdfTarSharder`)**:
  - Ham PDF ve dosya ikililerini silinmeden 10-50 GB'lik WebDataset/Cold Vault TAR.GZ paketlerine yazar.
  - Dinamik disk headroom guvenlik kalkanı (`min_free_disk_gb=25.0 GB`).
- **`pdf_downloader.py` (`ApertaPdfDownloader`)**:
  - `aperta_files` tablosundaki `pending` kuyrugundan dosyalari indirir, TAR.GZ shard'ina ekler ve Drive'a aktarir.
  - Dosyalarin silinmeme garantisi: Drive MD5 dogrulamasi tamamlanmadan gecici tampon temizlenmez.
- **`drive_sync.py` (`ApertaDriveSync`)**:
  - Parquet ve TAR.GZ arsivlerini Google Drive `Aperta/` (ve `Aperta/Raw_Archives/`) klasorune yukler, MD5 dogrular ve yerel diski sifirlar.
- **`orchestrator.py` (`ApertaOrchestrator`)**:
  - CLI parametreleri: `--all`, `--method oai|rest`, `--query`, `--max-records`, `--batch-size`, `--shard-size-mb`, `--max-shard-records`, `--status`, `--flush-unsharded`.

### C. TypeScript Mikroservis Aktoru ve MCP
- `src/actors/corpus/aperta-actor.ts`: `ApertaActor`
  - SSRF guard ve safe redirect fetch denetimleri.
  - `search_records`, `get_record`, `list_files` aksiyonlari.
  - LLM egitimi icin GFM Markdown formatlama.
- `src/actors/corpus/domains/academic.ts`: ApertaActor ihraci.
- `src/actors/actor-manifests.ts`: `aperta` manifesti ve `query_aperta` MCP araci.
- `src/actors/actor-registry.ts`: Default registry'e kayit.
- `src/api/server.ts`: `POST /api/v1/aperta` ve `POST /aperta` REST rotalari.
- `src/mcp/protokol-mcp-server.ts`: MCP dispatcher yonlendirmesi.

### D. Yonetim ve Veritabani
- `package.json`: `"aperta:pipeline"`, `"aperta:pdf:pipeline"`, `"test:aperta"`.
- `scripts/sync-dbx-connections.py`: `protokol-aperta` SQLite katalog kaydi.
- `context/architecture-schema.md`: Tum yeni bilesenler semaya islendi.

---

## 3. Dogrulama ve Test Sonuclari

- **Python Boru Hatti Testleri:** `pipelines/api_stream/aperta/test_aperta_pipeline.py` (11/11 gecti).
  - Downloader OAI XML ayrismasi, resumptionToken, REST arama.
  - Cleaner Dublin Core ve Invenio REST formatlama, paratext filtreleme.
  - Ledger ACID upsert, resumptionToken checkpointing, sharding durum gecisleri.
  - Parquet sharder Zstd sikistirma ve Arrow sema uyumu.
  - PDF TAR.GZ archiver olusturma, SHA-256 ve MD5 saglama toplamalari.
- **TypeScript Aktor Testleri:** `tests/aperta-actor.test.ts` (4/4 gecti).
  - `ApertaActor` search_records ve GFM markdown tablosu.
  - `ApertaActor` get_record ve attached files tablosu.
  - HTTP 404 / 500 hata yakalama.
  - HTTP Server `POST /api/v1/aperta` uctan uca entegrasyonu.
- **Sozlesme Testleri:** `tests/contracts.test.ts` (10/10 gecti).
- **Canli Pilot Calismasi:** Aperta OAI-PMH servisi uzerinden ilk 100 gercek kayit canli olarak cekildi, SQLite'a ACID indekslendi ve Zstd Parquet shard'ina basildi.
