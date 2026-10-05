# Instagram Kapsamlı Veritabanı (SQLite) Doğrulama Raporu (Walkthrough)

Bu doküman, Instagram aktörü için geliştirilen ilişkisel SQLite veritabanı saklama motorunun (`InstagramDatabase`) geliştirme ve doğrulama süreçlerini belgeler.

---

## 1. Gerçekleştirilen Bileşenler

1. **`src/storage/instagram-database.ts`:**
   - Node.js yerel `node:sqlite` (`DatabaseSync`) motoruyla sıfır dış bağımlılıkla geliştirildi.
   - 9 adet normalize tablo (`instagram_profiles`, `instagram_profile_snapshots`, `instagram_posts`, `instagram_post_slides`, `instagram_comments`, `instagram_hashtags`, `instagram_post_hashtags`, `instagram_post_mentions`, `instagram_harvest_runs`) tanımlandı.
   - Her ana tabloya `raw_json TEXT` kolonu eklenerek Instagram veri yapısındaki gelecekteki değişikliklere karşı tam koruma sağlandı.
   - `saveActorResult` metoduyla tek bir hasat işlemi ACID işlem (`BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`) güvencesiyle diske yazıldı.
   - Zaman serisi büyüme analizi için her profil taramasında `instagram_profile_snapshots` tablosuna anlık metrikler kaydedildi.

2. **Aktör Entegrasyonu (`src/actors/corpus/instagram-actor.ts`):**
   - `InstagramActor` sınıfına opsiyonel `db?: InstagramDatabase` bağımlılık enjeksiyonu eklendi.
   - `persistToDatabase` (varsayılan: `true`) ve `dbPath` (varsayılan: `data/instagram.sqlite`) seçenekleri aktörün `run` döngüsüne bağlandı.
   - Çekilen veriler otomatik olarak SQLite veritabanına aktarılırken, kullanıcıya özet durum ve kaydedilen nesne sayıları (`databaseSaved`) döndürüldü.

3. **Veri Sözleşmeleri (`src/api/types.ts`):**
   - `InstagramCommentRecord` eklendi.
   - `InstagramMediaRecord.comments` alanı eklendi.
   - `InstagramActorTaskOptions.persistToDatabase` ve `InstagramActorTaskOptions.dbPath` eklendi.
   - `InstagramActorResult.databaseSaved` alanı eklendi.

---

## 2. Doğrulama ve Test Sonuçları

- **Veritabanı Birim Testleri (`tests/instagram-database.test.ts`):**
  - Bellek içi (`:memory:`) 5/5 test başarıyla geçti (profil oluşturma, büyüme snapshot'ları, çoklu slayt/yorum/etiket/bahsetme ilişkileri, atomik işlem bütünlüğü ve hasat denetim kayıtları).
- **Aktör Birim Testleri (`tests/instagram-actor.test.ts`):**
  - 11/11 birim ve entegrasyon testi sıfır hatayla geçti.
- **Canlı Sistem Doğrulaması:**
  - `https://www.instagram.com/pratik.psikoloji?stkn=aGl4emV1MzlhOGtr` hedefi üzerinde canlı veri çekme ve `data/instagram.sqlite` dosyasına yazma testi icra edildi.
  - Veritabanından doğrudan yapılan sorgulamada:
    - Profil kaydı ve 12 adet son gönderi başarıyla okundu.
    - Takipçi ve gönderi sayıları `instagram_profile_snapshots` tablosuna işlendi.
    - Hasat günlüğü `instagram_harvest_runs` tablosuna kaydedildi.
- **Deterministik Doğrulama Hattı (`npm run verify`):**
  - 6/6 doğrulama aşaması (Mimari bütünlük, isimlendirme disiplini, sıfır emoji, gizli anahtar taraması, canlı paket SCA ve Biome linter) başarıyla yeşil geçti.
