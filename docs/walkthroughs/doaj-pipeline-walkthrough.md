# Walkthrough: DOAJ Boru Hattı ve Çekirdek Aktör Mimarisi

Bu doküman, Protokol-7 bünyesinde Directory of Open Access Journals (DOAJ) REST API v2 entegrasyonunu gerçekleştiren çok disiplinli hakemli açık erişim boru hattının (`pipelines/api_stream/doaj/`), Google Drive senkronizasyonunun, SQLite ilişkisel kataloğunun (`data/catalogs/doaj_catalog.sqlite`), dbx GUI yöneticisi entegrasyonunun ve TypeScript mikroservis aktörünün (`DoajActor`, `POST /api/v1/doaj`, `query_doaj` MCP aracı) mimarisini ve doğrulama sonuçlarını belgeler.

---

## 1. Geliştirilen Mimari Bileşenler

### 1.1. Python API Akış Boru Hattı (`pipelines/api_stream/doaj/`)
- `downloader.py`: DOAJ REST API v2 istemcisi. Hız limiti yönetimi (min 0.25s aralık), SSL sertifika doğrulama (`certifi`), sayfalama (`page`, `pageSize` maks 100), üstel geri çekilme (exponential backoff) ve jeneratör tabanlı kesintisiz akış (`stream_articles`).
- `cleaner.py`: `BaseCleaner` miraslı; paratext filtreleme, DOI ve ISSN ayrıştırma, çok dilli üstveri normalizasyonu, yazar kurumları, anahtar kelimeler ve LCC/DDC konu sınıflaması ayıklayıcısı.
- `packer.py`: `BaseParquetSharder` miraslı; 16 alanlı PyArrow şeması (`id`, `doi`, `title`, `abstract`, `journal`, `publisher`, `issn`, `language`, `year`, `authors`, `affiliations`, `keywords`, `subjects`, `fulltext_url`, `char_count`, `word_count`), Zstandard sıkıştırma, SHA-256 ve MD5 sağlama kontrolleri.
- `ledger.py`: `BaseLedger` miraslı; SQLite WAL modunda `doaj_articles` ve `doaj_subjects` tabloları, konu terimleri sayaçları ve merkezi `data/catalog.sqlite` (`dataset_shards`) çift-yönlü ACID senkronizasyonu.
- `drive_sync.py`: `BaseDriveSync` miraslı; Google Drive `DOAJ/` klasörüne parça yükleme, uzaktan MD5 doğrulama ve yerel diskte sıfır artık bırakma.
- `orchestrator.py`: Parametrik CLI sürücüsü (`--query`, `--max-records`, `--batch-size`, `--shard-size-mb`, `--output-dir`, `--db-path`, `--dry-run`, `--no-drive`, `--sync-shards`).
- `test_doaj_pipeline.py`: Temizleyici, paketleyici, defter, indirme ve senkronizasyon bileşenlerini sınayan 8 birim testi.

### 1.2. TypeScript Çekirdek Aktör ve Mikroservis Entegrasyonu
- `src/api/types.ts`: `DoajArticleItem`, `DoajActorTaskOptions`, `DoajActorResult` tanımları; `ActorType` birliğine ve `ActorTask.options` nesnesine `doaj` eklenmesi.
- `src/actors/corpus/doaj-actor.ts`: `IActor<DoajActorResult>` sözleşmesini uygulayan çekirdek aktör. `search_articles`, `search_journals`, `get_article` eylemleri, SSRFGuard DNS koruması, GFM Markdown tablo ve özet sentezi.
- `src/actors/corpus/domains/academic.ts` ve `src/actors/corpus/index.ts`: Akademik domain ve korpus barrel re-export'ları.
- `src/actors/actor-registry.ts`: `DoajActor` kaydedildi (toplam 74 aktör).
- `src/actors/actor-manifests.ts`: `doaj` manifesti, JSON şemaları ve `query_doaj` MCP aracı tanımlandı (toplam 83 MCP aracı).
- `src/api/server.ts`: `POST /api/v1/doaj` ve `POST /doaj` REST rotaları eklendi.
- `src/mcp/protokol-mcp-server.ts`: `query_doaj` aracı görev seçeneklerine bağlandı.
- `docs/actors/doaj.md` ve `examples/actors/doaj.json`: Teknik wiki ve örnek girdi dokümantasyonu oluşturuldu.
- `tests/doaj-actor.test.ts`: Makale arama, doğrudan ID sorgusu, HTTP 500 hata yönetimi ve REST router üzerinden çalışmayı sınayan 4 birim ve entegrasyon testi.
- `scripts/sync-dbx-connections.py`: `protokol-doaj` veritabanı bağlantısı dbx kayıtlarına eklendi (toplam 57 aktif veritabanı).

---

## 2. Doğrulama Sonuçları

### 2.1. Python Birleşik ETL ve DOAJ Testleri
```text
> npm run test:doaj
Ran 8 tests in 0.100s - OK (8/8 passed)

> npm run test:corpus-pipelines
Ran 115 tests across all pipelines - OK (115/115 passed)
```

### 2.2. TypeScript Aktör ve MCP Testleri
```text
> npx tsx --test tests/doaj-actor.test.ts
✔ DoajActor searches articles with query and pageSize (35.7ms)
✔ DoajActor retrieves single article by ID (11.4ms)
✔ DoajActor handles upstream 500 error gracefully (8.3ms)
✔ Server REST endpoint POST /api/v1/doaj and /doaj return 200 with structured data (35.0ms)
ℹ tests 4, pass 4, fail 0

> npx tsx --test tests/protokol-mcp-server.test.ts
✔ returns all registered extraction tools in tools/list (83 tools verified including query_doaj)
✔ dispatches query_doaj tool call to DoajActor with structured options
ℹ tests 32, pass 32, fail 0
```

### 2.3. Genel Test ve 6-Katmanlı Doğrulama
```text
> npm test
ℹ tests 919, pass 919, fail 0, suites 195

> npm run verify
[1/6] Mimari Dosya Butunlugu Denetleniyor... [OK]
[2/6] Isimlendirme ve Dokumantasyon Disiplini... [OK]
[3/6] Loglama Disiplini (Sıfır Emoji)... [OK]
[4/6] Gizli Anahtar Taramasi... [OK]
[5/6] Bagimlilik ve Paket Halusinasyonu (SCA)... [PASS]
[6/6] Kod Stili ve Statik Analiz (Biome Lint)... [OK]
[PASS] DOGRULAMA BASARILI: Kod tabani tum dogrulama katmanlarindan gecti (6698ms).
```

### 2.4. Canlı Çekim Doğrulaması
```text
[DOAJ] Starting DOAJ Open Access Article Ingestion Pipeline
[DOAJ] Query: quantum computing | Max Records: 10
[DOAJ] SQLite Database: data/catalogs/doaj_catalog.sqlite
[SHARDER] Opened new shard: doaj_20261003_p00000.parquet
[SHARDER] Shard completed: doaj_20261003_p00000.parquet (10 records, 0.03 MB, sha256=099d7ac2b0c5...)
[DRIVE-DRY] Would upload doaj_20261003_p00000.parquet (0.03 MB)
[DRIVE-DRY] Purged local file: data/parquets/doaj/doaj_20261003_p00000.parquet
[LEDGER] Synchronized 1 shards to central catalog: data/catalog.sqlite
[DOAJ] Ingestion Complete in 0.8s (10 raw items processed, 10 clean records accepted, 0 rejected)
```
