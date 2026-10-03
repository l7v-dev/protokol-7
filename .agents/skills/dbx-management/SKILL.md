---
name: dbx-management
description: Projedeki SQLite veritabanı kataloglarını ve dil üstverilerini yerel GUI veritabanı yöneticisi dbx (com.dbx.app) ile senkronize etmek, yeni boru hattı kataloglarını otomatik kaydetmek ve veritabanı haritasını denetlemek için kullanılır.
---

# DBX Management — SQLite Veritabanı ve Arayüz Senkronizasyonu

Bu beceri, `protokol-7` projesindeki tüm SQLite ilişkisel kataloglarının yerel masaüstü veritabanı yöneticisi olan **`dbx` (com.dbx.app)** ile çift yönlü senkronizasyonunu, bağlantı kayıtlarını ve dizin düzenini yönetir.

---

## 1. Hızlı Kullanım

Yeni bir boru hattı eklendiğinde, veri çekimi yapıldığında veya veritabanları güncellendiğinde tüm katalogları tek komutla `dbx` arayüzüne eklemek için:

```bash
npm run dbx:sync
```

Doğrudan Python üzerinden çalıştırma:
```bash
python3 scripts/sync-dbx-connections.py
```

---

## 2. Mimari ve Depolama Kuralları

1. **`dbx` Sistem Veritabanı:**
   - Konum: `~/.local/share/com.dbx.app/dbx.db`
   - Tablo: `connections (id TEXT PRIMARY KEY, config_json TEXT NOT NULL)`
   - Yapılandırma Formatı:
     - `name`: `protokol-<korpus_adi>` (ör. `protokol-biorxiv`, `protokol-pubmed`)
     - `db_type`: `sqlite`
     - `host`: Veritabanının mutlak dosya yolu (`/home/.../data/catalogs/...`)
     - `save_password`: `true`

2. **Deterministik UUID Eşleme:**
   - Her veritabanı bağlantısı `uuid.uuid5(uuid.NAMESPACE_URL, f"dbx://protokol-7/{name}")` formülüyle üretilir.
   - Bu sayede `npm run dbx:sync` defalarca çalıştırılsa bile mükerrer kayıt üretmez (idempotent).

3. **Veritabanı Dizin Standartları:**
   - **Merkezi Master Katalog:** `data/catalog.sqlite` (tüm aktör çalıştırmaları, shard dökümleri ve boru hattı durumları).
   - **Alan Katalogları:** `data/catalogs/` altında toplanır (ör. `biorxiv_catalog.sqlite`, `pubmed_catalog.sqlite`).
   - **Göreceli Yol Yasağı:** Hiçbir boru hattı doğrudan `pipelines/*/data/` altına geçici veritabanı bırakmamalıdır; tüm veritabanı yolları kök `data/` veya `data/catalogs/` dizinini hedeflemelidir.

---

## 3. Kayıtlı Veritabanı Haritası

`npm run dbx:sync` çalıştığında aşağıdaki kategoriler otomatik taranır ve kaydedilir:

1. **Master Katalog:** `protokol-catalog` (`data/catalog.sqlite`)
2. **Biyomedikal & Akademik:**
   - `protokol-biorxiv` (`data/catalogs/biorxiv_catalog.sqlite`)
   - `protokol-pubmed` (`data/catalogs/pubmed_catalog.sqlite`)
   - `protokol-openalex` (`data/catalogs/openalex_catalog.sqlite`)
   - `protokol-openalex-snapshot` (`data/catalogs/openalex_snapshot_catalog.sqlite`)
   - `protokol-semanticscholar` (`data/catalogs/semanticscholar_catalog.sqlite`)
3. **Sosyal Medya & Teknik/Edebiyat:**
   - `protokol-instagram` (`data/catalogs/instagram.sqlite`)
   - `protokol-stackexchange` (`data/catalogs/stackexchange_catalog.sqlite`)
   - `protokol-gutenberg` (`data/catalogs/gutenberg_catalog.sqlite`)
4. **Wikimedia Külliyatı:**
   - `protokol-wikisource`, `protokol-wiktionary`, `protokol-wikiquote`, `protokol-wikibooks`, `protokol-wikinews`, `protokol-wikispecies`, `protokol-wikiversity`, `protokol-wikivoyage` (`data/catalogs/wiki*_catalog.sqlite`)
5. **Wikipedia Dil Üstverileri (40 Dil):**
   - `protokol-wiki-<lang>` (`data/catalogs/wikipedia/<lang>_metadata.sqlite`)
