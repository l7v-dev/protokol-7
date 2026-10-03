# Eski Yapı Tasfiyesi, Veritabanı ve Dizin Konsolidasyon Planı

Bu plan, `protokol-7` projesinde geriye dönük kalan dağınık dosya/yol referanslarını, `scripts/` altındaki heterojen JSON yapılandırmalarını ve veritabanı yollarını tekil, kurumsal ve bakımı kolay bir mimariye kavuşturmayı tanımlar.

---

## 1. Mimari Prensipler ve Değişmezler (Invariants)

1. **Tekil Veritabanı Hiyerarşisi (`data/catalogs/`):**
   - Merkezi sicil defteri: `data/catalog.sqlite`
   - Alan/Korpus defterleri: `data/catalogs/<name>_catalog.sqlite`
   - Instagram ilişkisel veritabanı: `data/catalogs/instagram.sqlite`
   - Wikipedia çok dilli meta veritabanları: `data/catalogs/wikipedia/<lang>_metadata.sqlite`
   - Kök `data/` altında hiçbir dağınık veya yedek SQLite dosyası bulunamaz.

2. **Boru Hattı İzolasyonu ve Kendine Yeten Yapılandırmalar (`pipelines/`):**
   - Wikimedia JSON dil haritaları (`*_dbs.json`) `scripts/` kökünden alınıp `pipelines/dump/wikimedia/configs/` altına yerleştirilir.
   - Tüm orkestratörler doğrudan kendi alt modüllerindeki ve `pipelines/` altındaki dosyaları referans alır.

3. **Kök Dizin Hijyeni:**
   - Kök dizinde log dosyaları (`*.log`) bulunamaz; çalışma kayıtları `logs/` altındadır.
   - Geçici scratch dosyaları `data/scratch/` altında izole edilir ve buluta aktarıldıktan sonra derhal temizlenir.

4. **Yerel Veritabanı Yöneticisi (`dbx`) Senkronizasyonu:**
   - `scripts/sync-dbx-connections.py` tüm güncel veritabanı yollarını otomatik olarak `~/.local/share/com.dbx.app/dbx.db` içine işler ve var olmayan eski yolları ayıklar.

---

## 2. Uygulama Adımları

- [ ] **Adım 1:** Kalan orkestratör ve aktör varsayılan veritabanı yollarını `data/catalogs/`'a güncelleme (`semantic_scholar`, 8 Wikimedia orkestratörü, 2 runner, `instagram-database.ts`, `instagram-actor.ts`, Instagram harvest/download betikleri).
- [ ] **Adım 2:** Wikimedia `*_dbs.json` dosyalarını `scripts/` kökünden `pipelines/dump/wikimedia/configs/` altına taşıma ve orkestratörlerdeki okuma yollarını güncelleme.
- [ ] **Adım 3:** `scripts/sync-dbx-connections.py` betiğini `data/catalogs/` ve `data/catalogs/wikipedia/` yollarına göre güncelleme, geçersiz bağlantıları temizleme ve `npm run dbx:sync` çalıştırma.
- [ ] **Adım 4:** Kök dizin ve `data/` temizliği (`openalex_snapshot.log` -> `logs/`, `data/completed_languages.json` silme, `data/scratch/pubmed/` temizleme, `run_openalex.sh` güncelleme).
- [ ] **Adım 5:** `scripts/harvest_instagram_profile.ts` içindeki Biome lint uyarılarını (any tipleri ve opsiyonel zincirleme) düzeltme.
- [ ] **Adım 6:** Test suitelerini (`npm run test:corpus-pipelines`, `npm test`, `npm run verify`) çalıştırma ve %100 yeşil doğrulama.
