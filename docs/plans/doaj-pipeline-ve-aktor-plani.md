# DOAJ (Directory of Open Access Journals) Boru Hattı ve Çekirdek Aktör Mimarisi Planı

Bu plan; Directory of Open Access Journals (DOAJ) REST API v2 mimarisini entegre eden yüksek verimli, sıfır yerel disk artıklı veri akış boru hattının (`pipelines/api_stream/doaj/`), Google Drive senkronizasyonunun, ilişkisel SQLite katalog defterinin (`data/catalogs/doaj_catalog.sqlite`), TypeScript mikroservis aktörünün (`DoajActor`, `POST /api/v1/doaj`, `query_doaj` MCP aracı), birim testlerinin ve tam sistem doğrulamasının geliştirilmesini tanımlar.

---

## 1. Mimari Prensipler ve Değişmezler (Invariants)

1. **Katman İzolasyonu:**
   - Python Boru Hattı (`pipelines/api_stream/doaj/`): Toplu tarama, sayfalama, Zstandard sıkıştırmalı Parquet parçalama, Google Drive senkronizasyonu ve ilişkisel katalog yönetimi.
   - TypeScript Aktörü (`src/actors/corpus/doaj-actor.ts`): Canlı REST ve MCP sorguları, anlık arama, JSON ve LLM-ready GFM markdown sentezi.
   - Tekil Kontrol Düzlemi Defteri: Tüm operasyonel kayıtlar `data/catalogs/doaj_catalog.sqlite` ve `data/catalog.sqlite` üzerinde dual-sync olarak işlenir.

2. **Sıfır Yerel Disk Artığı (Zero Disk Residue):**
   - Üretilen Parquet shard'ları Google Drive `DOAJ/` klasörüne yüklendikten ve MD5 bütünlüğü doğrulandıktan sonra yerel diskten derhal silinir.

3. **Veri ve Şema Standartları:**
   - Parquet şeması: `id`, `doi`, `title`, `abstract`, `journal_title`, `publisher`, `issn`, `language`, `year`, `authors`, `keywords`, `subjects`, `fulltext_url`, `char_count`, `word_count`.

---

## 2. Uygulama Adımları

- [ ] **Faz 1: Boru Hattı İskeleti (`pipelines/api_stream/doaj/`)**
  - `downloader.py`: DOAJ API v2 (`search/articles`, `search/journals`, `articles/{id}`) sayfalamalı akış indiricisi.
  - `cleaner.py`: Çok dilli başlık, özet ve yazar temizliği, metrik hesaplama.
  - `packer.py`: `DoajParquetSharder` (Zstandard compression, SHA-256 + MD5).
  - `drive_sync.py`: `DoajDriveSync` (Google Drive `DOAJ/` hedefi).
  - `ledger.py`: `DoajLedger` (`data/catalogs/doaj_catalog.sqlite`, dual-sync).
  - `orchestrator.py`: CLI orkestratörü (`--query`, `--all`, `--limit`, `--dry-run`, `--status`).
  - `test_doaj_pipeline.py`: Python birim test paketi.

- [ ] **Faz 2: TypeScript Mikroservis Aktörü ve Entegrasyonları**
  - `src/actors/corpus/doaj-actor.ts`: `DoajActor` (search, article, journal aksiyonları, GFM markdown).
  - `src/actors/corpus/domains/academic.ts`: DoajActor dışa aktarımı.
  - `src/actors/actor-manifests.ts`: `doaj` manifesti ve `query_doaj` MCP araç tanımı.
  - `src/actors/actor-registry.ts`: `DoajActor` kaydı.
  - `src/api/server.ts`: `POST /api/v1/doaj` ve `POST /doaj` HTTP rotası.
  - `src/mcp/protokol-mcp-server.ts`: `query_doaj` MCP aracı kaydı.
  - `tests/doaj-actor.test.ts`: TypeScript birim ve entegrasyon testleri.

- [ ] **Faz 3: Yapılandırma, Tooling ve dbx Senkronizasyonu**
  - `package.json`: `"doaj:pipeline"`, `"test:doaj"`, `"test:corpus-pipelines"` güncellemeleri.
  - `scripts/sync-dbx-connections.py`: `protokol-doaj` veritabanı kaydı.
  - `context/architecture-schema.md`: DOAJ bileşenlerinin haritaya eklenmesi.

- [ ] **Faz 4: Doğrulama ve Canlı Test**
  - `npm run test:corpus-pipelines` ve `npm test` çalıştırma.
  - `npm run verify` ile 6 katmanlı tam doğrulama.
  - Test amaçlı 100 makalelik canlı çekim ve shard doğrulaması.
