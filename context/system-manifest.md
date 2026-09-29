# Sistem Manifestosu (System Manifest)

Bu dosya `protokol-7` mikroservisinin uretim (production) ve calisma zamani can damarlarini tek sayfada ozetleyen deterministik referans haritasidir.

---

## 1. Veritabani Katmani (ACID Persistence)

- **Motor:** Native Node.js `node:sqlite` (Sifir harici bagimlilik, WAL modu).
- **Dosya Yolu:** `data/catalog.sqlite` (Secenekli ortam degiskeni: `PROTOKOL_DB_PATH`).
- **Tablolar (`context/schema.sql`):**
  - `pipeline_runs` — Boru hatti calisma durumlari, konfig ve sonuclar.
  - `scheduled_jobs` — 5-alanli cron gorevleri ve zamanlayici takibi.
  - `dataset_snapshots` — Muhurlenmis egitim veri kumesi anlik goruntuleri.
  - `dataset_shards` — Parquet sardlari, SHA-256 saglama toplamlari ve token tahminleri.
  - `storage_replicas` — Uzak/yerel depolama replikalari (`LOCAL`, `R2`, `GDRIVE`, `COLD_VAULT`).
  - `verification_audits` — Veri kalite, filtreleme ve tekillesme denetim izleri.
  - `actor_runs` — Bireysel aktor calisma kayitlari ve metrikler.

---

## 2. HTTP REST Rotalari (`src/api/routers/` & `src/api/server.ts`)

| Router | Dosya | Uç Noktalar |
|---|---|---|
| **StoreRouter** | `src/api/routers/store-router.ts` | `GET /api/v1/actors`, `POST /api/v1/<actor-type>`, `GET /api/v1/runs/:id/logs` (SSE) |
| **PipelineRouter** | `src/api/routers/pipeline-router.ts` | `POST /api/v1/pipelines/run`, `GET /api/v1/pipelines/runs`, `GET /api/v1/pipelines/runs/:id`, `GET /api/v1/pipelines/templates` |
| **DatasetRouter** | `src/api/routers/dataset-router.ts` | `POST /api/v1/datasets/publish`, `GET /api/v1/datasets`, `GET /api/v1/datasets/:name`, `GET /api/v1/datasets/:name/manifest` |
| **JobRouter** | `src/api/routers/job-router.ts` | `POST /api/v1/jobs/schedule`, `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `DELETE /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/stop` |
| **VaultRouter** | `src/api/routers/vault-router.ts` | `POST /api/v1/vault/export`, `POST /api/v1/vault/verify`, `GET /api/v1/vault/inspect` |
| **Core** | `src/api/server.ts` | `GET /healthz`, `GET /api/v1/health`, `GET /docs` (OpenAPI 3.1.0 JSON) |

---

## 3. Depolama Baglayicilari (Storage Engines)

- **Yerel Onbellek:** `cache/` (Gecici ham dökümler ve donusturme ara dosyalari).
- **Google Drive:** `1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL` (Zstd Parquet sardlari, OAuth2 token dogrulamali yukleme).
- **Cloudflare R2 / AWS S3:** `@aws-sdk/client-s3` (S3 uyumlu nesne depolama).
- **Cold Vault:** `vault/` (Btrfs streaming SHA-256 saglama toplamli fiziksel soguk depolama).
- **Defter (Ledger):** `ledger/` (`index.jsonl` ve gzip sikistirmali `sessions/*.md.gz`).

---

## 4. Kayitli Aktor Envanteri (32 Aktor — `src/actors/actor-registry.ts`)

- **Kulliyat (Corpus):** `wikipedia`, `wikisource`, `wiktionary`, `youtube-transcripts`, `arxiv`, `gutenberg`, `stack-exchange`, `openstax`, `mit-ocw`, `eur-lex`, `software-heritage`.
- **Dokuman (Documents):** `document-extractor`, `archive-extractor`, `epub-reader`, `dergipark`, `internet-archive`.
- **Tarayici (Browser):** `browser-crawler`, `session-manager`, `stealth-injector`, `dom-indexer`.
- **Ag & Arama (Network):** `network-interceptor`, `serp-search`, `sitemap-xml`, `markdown-reader`.
- **Kurumsal & Akademik:** `sec-edgar`, `court-listener`, `clinical-trials`, `open-fda`, `crossref`, `semantic-scholar`, `core-ac-uk`, `pubmed-central`, `wikidata`, `un-digital-library`, `world-bank`.

---

## 5. Uretim Ortam Degiskenleri (Environment Variables)

```bash
PORT=3000                                 # HTTP sunucu portu
PROTOKOL_DB_PATH=data/catalog.sqlite      # SQLite veritabani yolu
AUTH_TOKEN=                               # API Bearer token guvenligi
GOOGLE_DRIVE_REFRESH_TOKEN=               # Google Drive OAuth2 erisimi
GOOGLE_DRIVE_CLIENT_ID=                   # Google Cloud OAuth istemci no
GOOGLE_DRIVE_CLIENT_SECRET=               # Google Cloud OAuth istemci sirri
R2_ACCESS_KEY_ID=                         # Cloudflare R2 anahtari
R2_SECRET_ACCESS_KEY=                     # Cloudflare R2 sirri
R2_BUCKET_NAME=                           # R2 kova adi
R2_ENDPOINT=                              # R2 S3 API endpoint URL
COLD_VAULT_PATH=vault/                    # Fiziksel Btrfs mount yolu
```

---

## 6. Operasyonel CLI Komutlari

- `npm run pulse`: Anlik sistem nabzini, aktif gorevi, DB ve depolama durumunu terminale basar.
- `npm run logs`: Log fihristini ve sistem anomali radarini terminale basar.
- `npm run dev`: Canli gelistirme sunucusu (`tsx watch src/server.ts`).
- `npm run verify`: 6 katmanli deterministik dogrulama kapisi.
- `npm run doctor`: 7 asamali depo ve ortam saglik denetimi.
- `npm run memory "<kavram>"`: BM25 semantik bellek aramasi.
- `npm run make:actor`: Yeni aktor iskeleti uretici (scaffolding).
- `npm run consolidate`: Calisan bellek gorevlerini `ledger/`'a muhurler.
