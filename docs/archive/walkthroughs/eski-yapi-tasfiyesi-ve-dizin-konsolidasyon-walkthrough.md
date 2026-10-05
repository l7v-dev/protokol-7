# Walkthrough: Eski Yapı Tasfiyesi, Veritabanı ve Dizin Konsolidasyonu

Bu doküman; `protokol-7` bünyesinde eski dağınık dizin yapılarının, geçici log/script kalıntılarının ve parçalanmış SQLite veritabanı yollarının kurumsal, bakımı kolay ve modüler bir mimariye kavuşturulmasını ve doğrulama sonuçlarını belgeler.

---

## 1. Mimari Değişiklikler ve Konsolidasyon Özeti

### 1.1 Veritabanı Katmanı Konsolidasyonu (`data/catalogs/`)
- Tüm bağımsız korpus ve boru hattı SQLite veritabanları tekil kurumsal dizin olan `data/catalogs/` altında toplandı.
- Merkezi sicil defteri (`data/catalog.sqlite`) master veritabanı olarak kök `data/` altında bırakıldı.
- Instagram ilişkisel veritabanı (`src/storage/instagram-database.ts`, `src/actors/corpus/instagram-actor.ts`, harvest/download betikleri) varsayılan olarak `data/catalogs/instagram.sqlite` yoluna bağlandı.
- Semantic Scholar, Gutenberg, StackExchange, OpenAlex ve 8 Wikimedia kardeş projesinin orkestratörleri doğrudan `data/catalogs/<corpus>_catalog.sqlite` yolunu kullanacak şekilde senkronize edildi.

### 1.2 Masaüstü Veritabanı Yöneticisi (`dbx`) Entegrasyonu
- `scripts/sync-dbx-connections.py` betiği güncellendi:
  - Eski ve geçersiz yolları (`data/<lang>wiki_parquet/...`, `data/*.sqlite`) otomatik tespit edip `~/.local/share/com.dbx.app/dbx.db` içinden ayıkladı (53 bayat bağlantı temizlendi).
  - 16 çekirdek veritabanı + 40 Wikipedia dili olmak üzere toplam **56 aktif bağlantı** deterministik UUID5 anahtarlarıyla `dbx` arayüzüne kaydedildi.
  - `.agents/skills/dbx-management/SKILL.md` güncel `data/catalogs/` yollarıyla senkronize edildi.

### 1.3 Boru Hattı Konfigürasyonlarının İzolasyonu (`pipelines/dump/wikimedia/configs/`)
- `scripts/` kökünde serbest halde duran 6 Wikimedia dil haritası JSON dosyası (`wikibooks_dbs.json`, `wikinews_dbs.json`, `wikiquote_dbs.json`, `wikiversity_dbs.json`, `wikivoyage_dbs.json`, `wiktionary_dbs.json`) `pipelines/dump/wikimedia/configs/` altına taşındı.
- İlgili 8 orkestratör ve runner'ın dosya çözümleyicileri bu modüler konfigürasyon dizinini öncelikli okuyacak şekilde güncellendi.
- `scripts/run_openalex.sh` betiği dinamik kök dizin tespiti ve güncel `pipelines/` yoluyla yapılandırıldı; kök dizindeki sahipsiz kopyası kaldırıldı.

### 1.4 Kök Dizin ve Geçici Artık Temizliği
- Kök dizindeki `openalex_snapshot.log` (739 KB) `logs/openalex_snapshot.log` altına taşındı.
- `data/completed_languages.json` scratch dosyası ve `data/scratch/pubmed/` test artıkları tasfiye edildi.
- Kök dizindeki `result` Nix symlink'i kaldırıldı.

### 1.5 Tip Güvenliği ve Biome Linter Uyumluluğu
- `scripts/harvest_instagram_profile.ts` içerisindeki 11 adet `any` tipi ve gevşek kontrol, `RawFeedPayload`, `RawSlideCandidate`, `RawEdgeSlide` strongly-typed arayüzleri ve opsiyonel zincirleme (`?.`) ile refactor edildi.
- `src/actors/actor-manifests.ts` içinde `pubmed` ve `biorxiv` manifestlerinin `inputSchema.properties` ve `outputSchema.fields` sözleşmeleri düzeltildi.
- `src/api/server.ts` içerisindeki `biorxiv` `sendError` çağrısı tip sözleşmesine uygun hale getirildi.

---

## 2. Doğrulama ve Test Sonuçları

| Test / Doğrulama Katmanı | Kapsam / Komut | Sonuç |
|---|---|---|
| **TypeScript Birim & Entegrasyon Testleri** | `npm test` (195 test paketi, 70 aktör, güvenlik bariyerleri) | **914 / 914 PASS** (%100 Başarı) |
| **Wikimedia Boru Hattı Testleri** | `npm run test:wikimedia && npm run test:news-species` | **35 / 35 PASS** (%100 Başarı) |
| **Korpus Boru Hatları Test Paketi** | `npm run test:corpus-pipelines` (Gutenberg, SE, OA, S2, Shared, PubMed, bioRxiv) | **82 / 82 PASS** (%100 Başarı) |
| **Statik Tip Güvenliği** | `npm run typecheck` (`tsc --noEmit`) | **0 Hata** (Temiz) |
| **Deterministik Doğrulama Hattı** | `npm run verify` (Dosya bütünlüğü, Naming, Sıfır Emoji, Secret Detection, SCA, Biome) | **6 / 6 KATMAN PASS** (Yeşil) |
| **dbx Veritabanı Senkronizasyonu** | `npm run dbx:sync` | **56 Aktif Veritabanı** (53 bayat silindi, 53 yeni eklendi) |
