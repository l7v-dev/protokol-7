# Walkthrough: bioRxiv & medRxiv Boru Hattı ve Çekirdek Aktör Mimarisi

Bu doküman, Protokol-7 bünyesinde Cold Spring Harbor Laboratory (CSHL) bioRxiv ve medRxiv API'lerini entegre eden biyoloji ve tıp ön-baskı boru hattının (`pipelines/api_stream/biorxiv/`), Google Drive senkronizasyonunun, SQLite ilişkisel kataloğunun (`data/catalogs/biorxiv_catalog.sqlite`) ve TypeScript mikroservis aktörünün (`BiorxivActor`, `POST /api/v1/biorxiv`, `query_biorxiv` MCP aracı) mimarisini ve doğrulama sonuçlarını belgeler.

---

## 1. Geliştirilen Mimari Bileşenler

### 1.1. Python API Akış Boru Hattı (`pipelines/api_stream/biorxiv/`)
- `downloader.py`: CSHL Details REST API istemcisi. Hız limiti yönetimi (min 0.6s aralık), SSL sertifika doğrulama (`certifi`), imleç tabanlı sayfalama (cursor pagination) ve üstel geri çekilme (exponential backoff).
- `cleaner.py`: `BaseCleaner` miraslı; başlık paratext temizliği, özet sınır doğrulama, kategori normalizasyonu, yazar kurum bilgisi ve LLM eğitimi için yapılandırılmış GFM Markdown sentezi.
- `packer.py`: `BaseParquetSharder` miraslı; 16 kolonlu Zstandard sıkıştırmalı Parquet paketleyici (`bx_YYYYMMDD_p00000.parquet`), SHA-256 ve MD5 sağlama kontrolleri.
- `ledger.py`: `BaseLedger` miraslı; SQLite WAL modunda `biorxiv_articles` ve `biorxiv_categories` tabloları, kategori sayaçları ve merkezi `data/catalog.sqlite` (`dataset_shards`) çift-yönlü dinamik şema senkronizasyonu.
- `drive_sync.py`: `BaseDriveSync` miraslı; Google Drive `bioRxiv/` klasörüne parça yükleme, uzaktan MD5 doğrulama ve yerel diskte sıfır artık bırakma.
- `orchestrator.py`: Parametrik CLI sürücüsü (`--server`, `--interval`, `--category`, `--max-records`, `--batch-size`, `--dry-run`, `--no-drive`).
- `test_biorxiv_pipeline.py`: Temizleyici, paketleyici, defter, indirme ve senkronizasyon bileşenlerini sınayan 8 birim testi.
- `scripts/biorxiv_pipeline`: Geriye dönük göreceli sembolik köprü.

### 1.2. TypeScript Çekirdek Aktör ve Mikroservis Entegrasyonu
- `src/api/types.ts`: `BiorxivArticleItem`, `BiorxivActorTaskOptions`, `BiorxivActorResult` tanımları; `ActorType` birliğine ve `ActorTask.options` nesnesine `biorxiv` eklenmesi.
- `src/actors/corpus/biorxiv-actor.ts`: `IActor<BiorxivActorResult>` sözleşmesini uygulayan çekirdek aktör. Doğrudan DOI sorgusu, tarih aralığı, kategori filtresi ve istemci tarafı anahtar kelime eşleştirme (full-text title & abstract matching), SSRFGuard DNS koruması ve Markdown sentezi.
- `src/actors/corpus/domains/academic.ts` ve `src/actors/corpus/index.ts`: Akademik domain ve genel korpus barrel re-export'ları.
- `src/actors/actor-registry.ts`: `BiorxivActor` kaydedildi (toplam 73 aktör).
- `src/actors/actor-manifests.ts`: `biorxiv` manifesti, JSON şemaları ve `query_biorxiv` MCP aracı tanımlandı (toplam 82 MCP aracı).
- `src/api/server.ts`: `POST /api/v1/biorxiv` ve `POST /biorxiv` REST rotaları eklendi.
- `src/mcp/protokol-mcp-server.ts`: `query_biorxiv` aracı görev seçeneklerine bağlandı.
- `docs/actors/biorxiv.md` ve `examples/actors/biorxiv.json`: Teknik wiki ve örnek girdi dokümantasyonu oluşturuldu.
- `tests/biorxiv-actor.test.ts`: bioRxiv aralık/kategori sorgusu, medRxiv DOI sorgusu, istemci tarafı metin arama filtresi, HTTP 500 hata yönetimi ve REST router üzerinden çalışmayı sınayan 5 test.

---

## 2. Doğrulama Sonuçları

### 2.1. Python Birleşik ETL ve bioRxiv Testleri
```text
> npm run test:biorxiv
Ran 8 tests in 0.087s - OK (8/8 passed)

> npm run test:corpus-pipelines
Ran 107 tests across all pipelines - OK (107/107 passed)
```

### 2.2. TypeScript Aktör ve MCP Testleri
```text
> npx tsx --test tests/biorxiv-actor.test.ts
✔ BiorxivActor queries bioRxiv with interval and category
✔ BiorxivActor queries medRxiv preprint by direct DOI
✔ BiorxivActor filters preprints using client-side query matching
✔ BiorxivActor handles upstream HTTP 500 error gracefully
✔ Server REST endpoint POST /api/v1/biorxiv and /biorxiv return 200 with structured data
ℹ tests 5, pass 5, fail 0

> npx tsx --test tests/protokol-mcp-server.test.ts
✔ returns all registered extraction tools in tools/list (82 tools verified including query_biorxiv)
✔ dispatches query_biorxiv tool call to BiorxivActor with structured options
ℹ tests 31, pass 31, fail 0
```

### 2.3. Genel Test ve 6-Katmanlı Doğrulama
```text
> npm test
ℹ tests 914, pass 914, fail 0, suites 195

> npm run verify
[PASS] Tüm bağımlılıklar resmi kayıt defterinde doğrulandı.
[OK] Biome kod stili ve statik analiz başarılı.
[PASS] DOĞRULAMA BAŞARILI: Kod tabanı tüm doğrulama katmanlarından geçti (8742ms).
```

### 2.4. Canlı Çekim Testi
```text
[BIORXIV] Starting BIORXIV Preprint Ingestion Pipeline
[BIORXIV] Server: biorxiv | Interval: 2026-01-01/2026-01-02
[BIORXIV] Processed 100 raw (100 clean, 0 rejected) | 8.9 rec/s
[SHARDER] Shard completed: bx_20261002_p00000.parquet (100 records, 0.16 MB, sha256=3d91a20d3609...)
[LEDGER] Synchronized 1 shards to central catalog: data/catalog.sqlite
[BIORXIV] Ingestion Complete in 11.3s | Total articles in SQLite catalog: 99
```
Kategori Dağılımı: Neuroscience (16), Immunology (11), Cell Biology (10), Microbiology (10), Plant Biology (8), Evolutionary Biology (7), Bioinformatics (6), Cancer Biology (5), Genomics (5), Biophysics (4), Ecology (3), Molecular Biology (3), Bioengineering (2), Pathology (2) ve diğerleri.
