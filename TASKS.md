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

- [x] **PubMed & PubMed Central (PMC) Boru Hattı ve Çekirdek Aktör Mimarisi (`pubmed`)** — `Tier: 2` — Biyomedikal tıp literatürü için NCBI E-utilities (`esearch`, `esummary`, `efetch`) ve BioC API akış boru hattı (`pipelines/api_stream/pubmed/`), Google Drive v3 depolama senkronizasyonu (`BaseDriveSync` ile uzaktan MD5 doğrulama ve sıfır yerel disk artığı), SQLite ilişkisel makale ve MeSH defteri (`data/catalogs/pubmed_catalog.sqlite`, merkezi `data/catalog.sqlite` çift yönlü senkronizasyonu) ile TypeScript mikroservis aktörü (`PubmedActor`, `POST /api/v1/pubmed`, `query_pubmed` MCP aracı) geliştirildi. 6 Python birim testi (99/99 korpus ETL testi), 6 TS aktör testi (908/908 toplam test), 30 MCP testi ve `npm run verify` (6/6 doğrulama katmanı) %100 başarıyla onaylandı. Walkthrough: [`docs/walkthroughs/pubmed-pipeline-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/pubmed-pipeline-walkthrough.md).

- [x] **Instagram Profil & Medya Akışı Çekimi (@uzman.psikoloji)** — `Tier: 2` — Uzman Psikoloji (@uzman.psikoloji, 4.825 gönderi, 373.000 takipçi) profili baştan sona tarandı. Toplam 4.824 gönderi ve 4.348 slayt ilişkisel SQLite veritabanına (`data/instagram.sqlite`) kaydedildi. İlgili tüm 9.172 medya nesnesi (4.824 kapak + 4.348 slayt, toplam 1.03 GB) yerel ev dizininde `~/protokol-object-vault/instagram/uzman.psikoloji/` altına indirilip SHA-256 manifestiyle mühürlendi. Eksiksizlik oranı %100.0 olarak doğrulandı.

- [x] **Instagram Profil & Medya Akışı Çekimi ve Object Vault Senkronizasyonu (@pratik.psikoloji)** — `Tier: 2` — Playwright Stealth ve GraphQL response interceptor tabanlı akış harvesteriyle `@pratik.psikoloji` profili baştan sona tarandı. Toplam 8.286 gönderi (3.667 tekil görsel, 2.021 çoklu karusel, 1.764 video/reel) ve 18.582 bağımsız alt slayt görseli ilişkisel SQLite veritabanına (`data/instagram.sqlite`) işlendi. İlgili tüm 26.868 medya nesnesi (8.286 kapak + 18.582 slayt görseli, toplam 1.53 GB) yerel ev dizininde `~/protokol-object-vault/instagram/pratik.psikoloji/` altına indirildi ve SHA-256 manifestiyle mühürlendi. Eksiksizlik oranı %100.0 olarak doğrulandı.

- [x] **Kapsamlı Veri Çekme Yöntemleri ve Kurumsal Modüler Mimari Dönüşümü** — `Tier: 2` — Tüm 7 veri çekme yöntemini birleştiren modüler mimari kuruldu. Faz 1: `pipelines/` hiyerarşisi (`snapshot`, `dump`, `api_stream`, `multimodal`, `shared`), `BaseCleaner`, `BaseParquetSharder`, `BaseDriveSync`, `BaseLedger` taban sınıfları ve `scripts/scaffold/scaffold-pipeline.py` inşa edildi (9 shared birim testi). Faz 2: 12 ETL boru hattı `scripts/` altından `pipelines/` altına taşındı, `scripts/` altında geriye dönük göreceli sembolik köprüler kuruldu, `package.json` güncellendi ve 93 Python testi eksiksiz geçti. Faz 3: `data/catalogs/`, `data/parquets/`, `data/scratch/` dizin izolasyonu sağlandı. Faz 4: 59 korpus aktörü `src/actors/corpus/domains/` altında 5 alana (`academic`, `legal`, `reasoning_code`, `wikimedia`, `philosophy_humanities`) sınıflandırıldı. 902 TS testi ve `npm run verify` 6/6 onaylandı. Walkthrough: [`docs/walkthroughs/kapsamli-veri-cekme-ve-mimari-kategorizasyon-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/kapsamli-veri-cekme-ve-mimari-kategorizasyon-walkthrough.md).

- [x] **Instagram Veri Çıkarma Aktörü ve SQLite Veritabanı Saklama Motoru (`instagram`)** — `Tier: 2` — Instagram kamuya açık profil, gönderi/reel, karusel, kullanıcı yorumları (`InstagramCommentRecord`), etiket ve son medya akışını toplayan ikili motorlu (HTTP API + Playwright Chromium Stealth fallback) aktör mimarisi geliştirildi. Verilerin sıfır kayıpla ilişkisel saklanması için `InstagramDatabase` (`src/storage/instagram-database.ts`) SQLite motoru inşa edildi; 9 normalize tablo (`instagram_profiles`, `instagram_profile_snapshots`, `instagram_posts`, `instagram_post_slides`, `instagram_comments`, `instagram_hashtags`, `instagram_post_hashtags`, `instagram_post_mentions`, `instagram_harvest_runs`) ve geleceğe dönük `raw_json` yedek kolonları kuruldu. `POST /api/v1/instagram` REST rotası (`src/api/server.ts`), `query_instagram` MCP aracı (`src/mcp/protokol-mcp-server.ts`), `docs/actors/instagram.md`, `examples/actors/instagram.json`, `tests/instagram-actor.test.ts` (11 test) ve `tests/instagram-database.test.ts` (5 test) eksiksiz tamamlandı. Canlı `pratik.psikoloji` profili ve 12 gönderisi `data/instagram.sqlite` veritabanına başarıyla yazıldı. `npm run verify` 6/6 onaylandı. Walkthrough: [`docs/walkthroughs/instagram-veritabani-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/instagram-veritabani-walkthrough.md).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
