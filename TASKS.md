# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Aktif görev bulunmuyor — sıradaki platform seçimine hazır)*

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Sağlamlaştırma bekleyen görev bulunmuyor)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **DOAJ (Directory of Open Access Journals) Boru Hattı ve Çekirdek Aktör Mimarisi (`doaj`)** — `Tier: 2` — DOAJ REST API v2 (`search/articles`, `search/journals`, `articles/{id}`) akış boru hattı (`pipelines/api_stream/doaj/`), Google Drive senkronizasyonu, SQLite ilişkisel kataloğu (`data/catalogs/doaj_catalog.sqlite`), dbx GUI yöneticisi entegrasyonu (toplam 57 aktif veritabanı), TypeScript mikroservis aktörü (`DoajActor`, `POST /api/v1/doaj`, `query_doaj` MCP aracı), 8 Python birim testi (115/115 korpus testi), 4 TS aktör testi (919/919 test, 195 suite), 32 MCP testi, Biome lint, ve 6/6 katmanlı `npm run verify` tam başarıyla tamamlandı. Canlı dry-run ile 10 kayıt çekilip Parquet paketlendi. Walkthrough: [`docs/walkthroughs/doaj-pipeline-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/doaj-pipeline-walkthrough.md).

- [x] **Eski Yapı Tasfiyesi, Veritabanı ve Dizin Konsolidasyonu** — `Tier: 1` — Tüm korpus ve boru hattı veritabanları `data/catalogs/` altında toplandı; `scripts/sync-dbx-connections.py` güncellenerek 53 bayat host silinip 56 aktif SQLite kataloğu `dbx` arayüzüne işlendi; Wikimedia JSON dil haritaları `pipelines/dump/wikimedia/configs/` altına taşındı; kök dizindeki log ve geçici scratch dosyaları temizlendi; Biome lint ve TypeScript tip hataları (914/914 TS testi, 117 Python testi, `npm run verify` 6/6 katman) %100 yeşil tamamlandı. Walkthrough: [`docs/walkthroughs/eski-yapi-tasfiyesi-ve-dizin-konsolidasyon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/eski-yapi-tasfiyesi-ve-dizin-konsolidasyon-walkthrough.md).

- [x] **bioRxiv 2026 Canlı Veri Çekimi ve Parquet Paketleme (`biorxiv`)** — `Tier: 1` — Canlı CSHL bioRxiv API akışı üzerinden 50.000 ham kayıt işlendi (6.855s, ~7.3 rec/s); 49.999 temiz makale sürümü kabul edildi (%99,998 başarı oranı). 42.686 benzersiz makale ve 26 biyoloji disiplini ilişkisel SQLite kataloğuna (`data/catalogs/biorxiv_catalog.sqlite`) kaydedildi. 69.06 MB boyutunda Zstandard sıkıştırmalı ve SHA-256 mühürlü Parquet shard'ı (`bx_20261002_p00000.parquet`, 49.999 kayıt) üretildi ve merkezi kataloğa (`data/catalog.sqlite`) işlendi.

- [x] **bioRxiv & medRxiv Biyoloji ve Tıp Ön-Baskı Boru Hattı ve Çekirdek Aktör Mimarisi (`biorxiv`)** — `Tier: 2` — Cold Spring Harbor Laboratory (CSHL) bioRxiv & medRxiv API akış boru hattı (`pipelines/api_stream/biorxiv/`), Google Drive v3 depolama senkronizasyonu (`BaseDriveSync` ile uzaktan MD5 doğrulama ve sıfır yerel disk artığı), SQLite ilişkisel makale ve kategori kataloğu (`data/catalogs/biorxiv_catalog.sqlite`, merkezi `data/catalog.sqlite` çift yönlü senkronizasyonu) ile TypeScript mikroservis aktörü (`BiorxivActor`, `POST /api/v1/biorxiv`, `query_biorxiv` MCP aracı) geliştirildi. 8 Python birim testi (107/107 korpus ETL testi), 5 TS aktör testi (914/914 toplam test), 31 MCP testi ve `npm run verify` (6/6 doğrulama katmanı) %100 başarıyla onaylandı. Canlı 100 ön-baskı çekilip 99 makale ve 21 kategori indekslendi. Walkthrough: [`docs/walkthroughs/biorxiv-pipeline-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/biorxiv-pipeline-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
