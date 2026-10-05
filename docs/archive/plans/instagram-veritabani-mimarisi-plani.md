# Instagram Kapsamlı Veritabanı (SQLite) Mimari Planı

Bu doküman, **protokol-7** projesinde Instagram aktörü tarafından toplanan tüm profil, gönderi, karusel medya, kullanıcı yorumları, etiket, bahsetme ve zaman serisi büyüme verilerinin sıfır veri kaybı ile ilişkisel olarak saklanması için tasarlanan SQLite veritabanı mimarisini tanımlar.

---

## 1. Mimari Hedefler ve Temel İlkeler

1. **Tam Normalizasyon ve İlişkisel Bütünlük:**
   - 1-N hiyerarşi (`Profil` -> `Gönderi` -> `Karusel Slaytı` / `Yorum` / `Etiket`) yabancı anahtarlar (`FOREIGN KEY`) ve kademeli silme (`ON DELETE CASCADE`) ile korunur.
2. **"Önceden Neden Eklemedik" Garantisi (Geleceğe Hazırlık):**
   - Her ana tabloda (`instagram_profiles`, `instagram_posts`, `instagram_comments`) bir `raw_json TEXT` kolonu bulunur. Instagram yarın yeni bir alan eklese bile ham yanıt daima saklanır, şema kırılmaz.
3. **Zaman Serisi Büyüme Takibi (`instagram_profile_snapshots`):**
   - Takipçi, takip edilen ve gönderi sayılarının zamana bağlı değişimini analiz edebilmek için her taramada anlık metrik görüntüsü kaydedilir.
4. **Hiyerarşik Yorum Zinciri (`parent_comment_id`):**
   - Yorumlara gelen yanıtlar (sub-comments / threads) `parent_comment_id` ile modellenir.
5. **Mükerrer Kayıt Engelleme ve İdempotency (Upsert):**
   - Tekrarlanan taramalarda `INSERT OR REPLACE` / `UPSERT` mekanizmasıyla var olan kayıtların etkileşim metrikleri (beğeni, yorum sayısı) güncellenir, mükerrer kopyalar oluşmaz.
6. **Sıfır Dış Bağımlılık (Node.js Native):**
   - Node.js yerel `node:sqlite` (`DatabaseSync`) motoru kullanılır. Derleme gerektirmez, ACID uyumludur ve ultra hızlıdır.

---

## 2. İlişkisel Veritabanı Şeması (ERD)

```mermaid
erDiagram
    INSTAGRAM_PROFILES ||--o{ INSTAGRAM_PROFILE_SNAPSHOTS : "has history"
    INSTAGRAM_PROFILES ||--o{ INSTAGRAM_POSTS : "publishes"
    INSTAGRAM_POSTS ||--o{ INSTAGRAM_POST_SLIDES : "contains"
    INSTAGRAM_POSTS ||--o{ INSTAGRAM_COMMENTS : "receives"
    INSTAGRAM_COMMENTS ||--o{ INSTAGRAM_COMMENTS : "replies to"
    INSTAGRAM_POSTS ||--o{ INSTAGRAM_POST_HASHTAGS : "tagged with"
    INSTAGRAM_POSTS ||--o{ INSTAGRAM_POST_MENTIONS : "mentions"
    INSTAGRAM_HARVEST_RUNS ||--o{ INSTAGRAM_POSTS : "harvests"

    INSTAGRAM_PROFILES {
        string id PK
        string username UK
        string full_name
        string biography
        string external_url
        string profile_pic_url
        string profile_pic_url_hd
        int is_verified
        int is_private
        int is_business_account
        string category_name
        int follower_count
        int following_count
        int media_count
        string raw_json
        int first_scraped_at
        int last_scraped_at
    }

    INSTAGRAM_PROFILE_SNAPSHOTS {
        int id PK
        string profile_id FK
        int follower_count
        int following_count
        int media_count
        int captured_at
    }

    INSTAGRAM_POSTS {
        string id PK
        string shortcode UK
        string owner_id FK
        string owner_username
        string media_type
        string product_type
        string caption
        int taken_at
        string display_url
        string video_url
        real video_duration
        int video_view_count
        int video_play_count
        int like_count
        int comment_count
        string location_id
        string location_name
        string location_slug
        string music_artist
        string music_title
        int is_pinned
        int is_paid_partnership
        string raw_json
        int first_scraped_at
        int last_scraped_at
    }

    INSTAGRAM_POST_SLIDES {
        string id PK
        string post_shortcode FK
        int slide_order
        string media_type
        string display_url
        string video_url
        int width
        int height
        string raw_json
    }

    INSTAGRAM_COMMENTS {
        string id PK
        string post_shortcode FK
        string parent_comment_id FK
        string author_id
        string author_username
        string author_full_name
        string author_profile_pic_url
        int author_is_verified
        string text
        int like_count
        int reply_count
        int created_at
        string raw_json
        int scraped_at
    }

    INSTAGRAM_POST_HASHTAGS {
        string post_shortcode PK,FK
        string hashtag PK
    }

    INSTAGRAM_POST_MENTIONS {
        string post_shortcode PK,FK
        string mentioned_username PK
    }

    INSTAGRAM_HARVEST_RUNS {
        string run_id PK
        string target_type
        string target_query
        string engine_used
        string status
        int items_harvested
        int comments_harvested
        int duration_ms
        string error_message
        int created_at
    }
```

---

## 3. Modül ve Dosya Hiyerarşisi

| Dosya | Görev |
|---|---|
| `src/storage/instagram-database.ts` | `node:sqlite` tabanlı saklama sınıfı (`InstagramDatabase`), tablo başlatma, indexler, upsert metodları, toplu işlem (transaction) ve sorgu fonksiyonları. |
| `src/actors/corpus/instagram-actor.ts` | DB otomatik kayıt (`persistToDatabase: true`, `dbPath: 'data/instagram.sqlite'`) entegrasyonu. |
| `src/api/types.ts` | DB konfigürasyon seçeneklerinin ve istatistik tiplerinin eklenmesi. |
| `tests/instagram-database.test.ts` | Bellek içi (`:memory:`) SQLite birim ve entegrasyon test paketi. |
| `docs/actors/instagram.md` | Teknik dokümantasyon ve SQL şema rehberi. |
| `context/architecture-schema.md` | Mimari katalog senkronizasyonu. |
