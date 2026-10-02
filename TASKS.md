# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif


- *(Aktif görev bulunmuyor)*

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Sağlamlaştırma bekleyen görev bulunmuyor)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **PubMed & PMC Canlı Veri Çekimi ve Parquet Paketleme (`pubmed`)** — `Tier: 1` — Canlı NCBI E-utilities API akışı üzerinden 9.667 hakemli biyomedikal makale (The Lancet, Nature, DEN Open vb.) başarıyla çekildi; yapılandırılmış özetler ve 100.756 MeSH konu başlığı ilişkisel SQLite kataloğuna (`data/catalogs/pubmed_catalog.sqlite`, 13 MB) kaydedildi. 17.11 MB boyutunda Zstandard sıkıştırmalı ve SHA-256 mühürlü Parquet shard'ı (`pm_20261002_p00000.parquet`) üretildi. İşlem 404 saniyede %100 başarıyla tamamlandı.

- [x] **PubMed & PubMed Central (PMC) Boru Hattı ve Çekirdek Aktör Mimarisi (`pubmed`)** — `Tier: 2` — Biyomedikal tıp literatürü için NCBI E-utilities (`esearch`, `esummary`, `efetch`) ve BioC API akış boru hattı (`pipelines/api_stream/pubmed/`), Google Drive v3 depolama senkronizasyonu (`BaseDriveSync` ile uzaktan MD5 doğrulama ve sıfır yerel disk artığı), SQLite ilişkisel makale ve MeSH defteri (`data/catalogs/pubmed_catalog.sqlite`, merkezi `data/catalog.sqlite` çift yönlü senkronizasyonu) ile TypeScript mikroservis aktörü (`PubmedActor`, `POST /api/v1/pubmed`, `query_pubmed` MCP aracı) geliştirildi. 6 Python birim testi (99/99 korpus ETL testi), 6 TS aktör testi (908/908 toplam test), 30 MCP testi ve `npm run verify` (6/6 doğrulama katmanı) %100 başarıyla onaylandı. Walkthrough: [`docs/walkthroughs/pubmed-pipeline-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/pubmed-pipeline-walkthrough.md).

- [x] **Instagram Profil & Medya Akışı Çekimi (@uzman.psikoloji)** — `Tier: 2` — Uzman Psikoloji (@uzman.psikoloji, 4.825 gönderi, 373.000 takipçi) profili baştan sona tarandı. Toplam 4.824 gönderi ve 4.348 slayt ilişkisel SQLite veritabanına (`data/instagram.sqlite`) kaydedildi. İlgili tüm 9.172 medya nesnesi (4.824 kapak + 4.348 slayt, toplam 1.03 GB) yerel ev dizininde `~/protokol-object-vault/instagram/uzman.psikoloji/` altına indirilip SHA-256 manifestiyle mühürlendi. Eksiksizlik oranı %100.0 olarak doğrulandı.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
