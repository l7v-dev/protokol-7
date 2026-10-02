# Plan: bioRxiv & medRxiv Biyoloji ve Tıp Ön-Baskı Boru Hattı ve Çekirdek Aktör Mimarisi

Bu plan, Cold Spring Harbor Laboratory (CSHL) tarafından barındırılan **bioRxiv** ve **medRxiv** açık erişimli yaşam bilimleri ve klinik tıp ön-baskı (preprint) platformları için birleşik bir veri çekme boru hattı (`pipelines/api_stream/biorxiv/`), ilişkisel SQLite kataloğu (`data/catalogs/biorxiv_catalog.sqlite`), Google Drive senkronizasyonu ve TypeScript mikroservis aktörü (`BiorxivActor`, `POST /api/v1/biorxiv`, `query_biorxiv` MCP aracı) mimarisini tanımlar.

---

## 1. Mimari Kapsam ve Gerekçe

- **Önemi**: arXiv'in fizik/matematik/bilgisayar bilimi için sağladığı ön-baskı liderliğinin biyoloji ve tıp dünyasındaki karşılığıdır. Hakemli dergilere girmeden aylar önce en yeni bilimsel bulgular, aşı/ilaç deneyleri, genomik dizileme ve biyoinformatik araştırmaları burada yayımlanır.
- **İkili Sunucu**:
  - `biorxiv`: Biyoloji, nörobilim, genetik, biyokimya, immünoloji, biyoinformatik, mikrobiyoloji, sentetik biyoloji (40+ kategori).
  - `medrxiv`: Klinik tıp, epidemiyoloji, onkoloji, kardiyoloji, bulaşıcı hastalıklar, halk sağlığı, psikiyatri (30+ kategori).
- **Resmi API**: CSHL Details REST API (`https://api.biorxiv.org/details/{server}/{interval}/{cursor}/json`).
  - Sayfalama: 100'lük imleç (`cursor`) adımları.
  - Hız sınırı: Nezaket sınırlaması (1 istek/saniye), API anahtarı gerekmez.
- **İlişkisel Veritabanı ve Güvenlik**:
  - Her ön-baskı `data/catalogs/biorxiv_catalog.sqlite` veritabanına kaydedilir.
  - Zstandard Parquet shard'ları `data/parquets/biorxiv/` altında oluşturulur.
  - `BaseDriveSync` ile Google Drive `bioRxiv/` klasörüne MD5 doğrulamasıyla aktarılır.

---

## 2. Fazlar ve İş Paketleri

### Faz 1: Python Birleşik Akış Boru Hattı (`pipelines/api_stream/biorxiv/`)
1. `downloader.py`:
   - `BiorxivDownloader`: `details` ve `pub` uç noktaları, SSL CA doğrulaması (certifi), hata yönetimi ve sayfalama imleci (`cursor`).
2. `cleaner.py`:
   - `BiorxivCleaner` (`BaseCleaner` miraslı): HTML/XML etiketlerini temizleme, başlık/özet normalizasyonu, kategori ve yazar kurumu etiketleme, GFM Markdown sentezi.
3. `packer.py`:
   - `BiorxivSharder` (`BaseParquetSharder` miraslı): 14 kolonlu Zstandard Parquet paketleme (`bx_YYYYMMDD_p00000.parquet`), SHA-256 ve MD5 sağlama kontrolleri.
4. `ledger.py`:
   - `BiorxivLedger` (`BaseLedger` miraslı): `biorxiv_articles` ve `biorxiv_categories` tabloları, WAL modu, `data/catalog.sqlite` merkezi senkronizasyonu.
5. `drive_sync.py`:
   - `BiorxivDriveSync` (`BaseDriveSync` miraslı): Drive `bioRxiv/` klasörüne yükleme, uzaktan MD5 doğrulama, yerel artık bırakmama.
6. `orchestrator.py`:
   - CLI sürücüsü (`--server biorxiv|medrxiv`, `--interval YYYY-MM-DD/YYYY-MM-DD`, `--max-records`, `--batch-size`, `--no-drive`).
7. `test_biorxiv_pipeline.py`:
   - 6 birim testi (Downloader mock, Cleaner Markdown, Parquet sharding, SQLite ledger ACID).
8. `package.json` & Sembolik Köprü:
   - `npm run biorxiv:pipeline`, `npm run test:biorxiv`, `scripts/biorxiv_pipeline`.

### Faz 2: TypeScript Çekirdek Aktör ve Mikroservis Entegrasyonu
1. `src/api/types.ts`:
   - `ActorType` union'a `"biorxiv"` eklenmesi.
   - `BiorxivArticleItem`, `BiorxivActorTaskOptions`, `BiorxivActorResult` tanımı.
   - `ActorTask.options` içine `biorxivOptions` eklenmesi.
2. `src/actors/corpus/biorxiv-actor.ts`:
   - `BiorxivActor` implementasyonu (`IActor<BiorxivActorResult>`).
   - Aksiyonlar: `interval`, `recent`, `doi`, `search`.
   - `SSRFGuard.validateUrlWithDns` DNS-pinning güvenlik denetimi.
3. Aktör Kayıt ve Dışa Aktarımları:
   - `src/actors/corpus/domains/academic.ts` ve `src/actors/corpus/index.ts`.
   - `src/actors/actor-registry.ts` (72 -> 73 aktör).
   - `src/actors/actor-manifests.ts` (`query_biorxiv` MCP aracı, 81 -> 82 araç).
4. REST API ve MCP Entegrasyonu:
   - `src/api/server.ts`: `POST /api/v1/biorxiv` ve `POST /biorxiv` rotası.
   - `src/mcp/protokol-mcp-server.ts`: `query_biorxiv` parametre eşleme.
5. Belgeler ve Örnekler:
   - `docs/actors/biorxiv.md`
   - `examples/actors/biorxiv.json`
6. Testler ve Doğrulama:
   - `tests/biorxiv-actor.test.ts` (JSON ayrıştırma, SSRF engeli, REST route, options).
   - `tests/protokol-mcp-server.test.ts` güncellemesi (82 araç kontrolü).
   - `npm test` ve `npm run verify` (6/6 yeşil onay).
