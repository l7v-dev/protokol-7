# Walkthrough: PubMed & PubMed Central (PMC) Boru Hatti ve Cekirdek Aktor Mimarisi

Bu dokuman, Protokol-7 bunyesinde NCBI E-utilities (`esearch`, `esummary`, `efetch`) ve BioC API'yi entegre eden biyomedikal literatur boru hattinin (`pipelines/api_stream/pubmed/`), Google Drive senkronizasyonunun, SQLite iliskisel defterinin (`data/catalogs/pubmed_catalog.sqlite`) ve TypeScript mikroservis aktorunun (`PubmedActor`, `POST /api/v1/pubmed`, `query_pubmed` MCP araci) dogrulama sonuclarini kaydeder.

---

## 1. Gelistirilen Mimari Bilesenler

### 1.1. Python API Akis Boru Hatti (`pipelines/api_stream/pubmed/`)
- `downloader.py`: NCBI E-utilities XML/JSON parser'i. Hiz limiti yonetimi (API anahtarsiz 3 istek/saniye, API anahtariyla 10 istek/saniye) ve exponansiyel geri cekilme (exponential backoff).
- `cleaner.py`: `BaseCleaner` mirasli; yapilandirilmis abstract (Background, Methods, Results, Conclusions), yazarlar, MeSH tanimlayicilari ve GFM Markdown sentezi.
- `packer.py`: `BaseParquetSharder` mirasli; 14 kolonlu Zstd sikistirmali Parquet paketleyici (`pm_YYYYMMDD_p00000.parquet`), SHA-256 ve MD5 saglama kontrolleri.
- `ledger.py`: `BaseLedger` mirasli; SQLite WAL modunda `pubmed_articles` ve `pubmed_mesh_headings` tablolari ile detayli sorgu yetenekleri ve merkezi `data/catalog.sqlite` cift-yonlu senkronizasyonu.
- `drive_sync.py`: `BaseDriveSync` mirasli; Google Drive `PubMed/` klasorune parca parca yukleme, uzaktan MD5 dogrulama ve yerel diskte sifir artik birakma.
- `orchestrator.py`: Parametrik CLI surucusu (`--query`, `--max-records`, `--batch-size`, `--dry-run`, `--no-drive`).
- `test_pubmed_pipeline.py`: XML ayristirma, paratext temizleme, Parquet sema ve SQLite kayitlarini sinayan 6 birim testi.
- `scripts/pubmed_pipeline`: Geriye donuk goreceli sembolik kopru.

### 1.2. TypeScript Cekirdek Aktor ve Mikroservis Entegrasyonu
- `src/api/types.ts`: `PubmedArticleItem`, `PubmedActorTaskOptions`, `PubmedActorResult` tanimlari; `ActorType` birligine ve `ActorTask.options` nesnesine `pubmed` eklenmesi.
- `src/actors/corpus/pubmed-actor.ts`: `IActor<PubmedActorResult>` sozlesmesini uygulayan cekirdek aktor. Dört aksiyon modu (`search`, `summary`, `fetch`, `bioc`), Cheerio ile XML ayristirma, SSRFGuard DNS korumasi ve Markdown sentezi.
- `src/actors/corpus/domains/academic.ts` ve `src/actors/corpus/index.ts`: Akademik domain ve genel korpus barrel re-export'lari.
- `src/actors/actor-registry.ts`: `PubmedActor` kaydedildi (toplam 72 aktor).
- `src/actors/actor-manifests.ts`: `pubmed` manifesti, JSON semalari ve `query_pubmed` MCP araci tanimlandi (toplam 81 MCP araci).
- `src/api/server.ts`: `POST /api/v1/pubmed` ve `POST /pubmed` REST rotalari eklendi.
- `src/mcp/protokol-mcp-server.ts`: `query_pubmed` araci gorev seceneklerine baglandi.
- `docs/actors/pubmed.md` ve `examples/actors/pubmed.json`: Teknik wiki ve ornek girdi dokumantasyonu olusturuldu.
- `tests/pubmed-actor.test.ts`: XML, E-Summary JSON, BioC JSON, ESearch JSON, SSRF guvenligi ve REST router uzerinden calismayi sinayan 6 test.

---

## 2. Dogrulama Sonuclari

### 2.1. Python Birlesik ETL ve PubMed Testleri
```text
> npm run test:pubmed
Ran 6 tests in 0.138s - OK

> npm run test:corpus-pipelines
Ran 99 tests across all pipelines - OK (99/99 passed)
```

### 2.2. TypeScript Aktor ve MCP Testleri
```text
> npx tsx --test tests/pubmed-actor.test.ts
✔ PubmedActor parses PubMed XML with structured abstracts, MeSH, and Markdown
✔ PubmedActor parses NCBI E-Summary JSON correctly
✔ PubmedActor parses BioC JSON format correctly
✔ PubmedActor parses ESearch search results
✔ PubmedActor blocks SSRF requests to cloud metadata
✔ POST /api/v1/pubmed executes correctly via server router
ℹ tests 6, pass 6, fail 0

> npx tsx --test tests/protokol-mcp-server.test.ts
✔ returns all registered extraction tools in tools/list (81 tools verified including query_pubmed)
ℹ tests 30, pass 30, fail 0
```
