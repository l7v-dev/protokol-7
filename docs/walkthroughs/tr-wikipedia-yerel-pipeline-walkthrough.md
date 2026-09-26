# Türkçe Wikipedia Yerel LLM Veri Hattı ve Sıralı Drive Senkronizasyonu Walkthrough

## 1. Genel Bakış

Bu çalışma, Colab bellek kısıtlamalarına ve ağ kopmalarına takılmadan, doğrudan yerel bilgisayarda çalışan, resmi Wikimedia dökümünden (`trwiki-latest-pages-articles.xml.bz2`) saf LLM ön-eğitim metni çıkaran, 10 GB tavan limitli akışlı Parquet (ZSTD-6) parçalaması yapan ve Google Drive API v3 üzerinden sıralı (sequential, tek tek) yükleme, MD5 hash doğrulaması ve yerel dosya temizliği gerçekleştiren veri hattını kurmuştur.

---

## 2. Geliştirilen Bileşenler ve Mimari

1. **`scripts/wikipedia_pipeline/downloader.py`**:
   - `trwiki-latest-pages-articles.xml.bz2` dökümünü ve resmi `trwiki-latest-md5sums.txt` dosyasını akışlı olarak indirir.
   - İndirme öncesi/sonrası MD5 bütünlüğünü doğrular.

2. **`scripts/wikipedia_pipeline/cleaner.py`**:
   - 10 GB açılmış XML yerine `bz2.open` üzerinden bellek tüketimini sabit (< 200 MB) tutan akışlı SAX parser (`xml.etree.ElementTree.iterparse`).
   - Yalnızca `ns == 0` ansiklopedi ana maddelerini filtreler.
   - `#REDIRECT` ve `#YÖNLENDİRME` sayfalarını ayıklar.
   - Şablonlar (`{{...}}`), bilgi kutuları, kaynakçalar (`<ref>`), HTML etiketleri, wikitabloları ve kategori/dosya bağlantılarını temizler.

3. **`scripts/wikipedia_pipeline/packer.py` (`StreamingParquetSharder`)**:
   - PyArrow `ParquetWriter` ile row group akışı sağlar (RAM taşması yaşanmaz).
   - Kullanıcı talebi doğrultusunda **10 GB part limiti** (`--max-part-gb 10.0`) entegre edilmiştir.
   - Zstandard (`compression="zstd"`, `compression_level=6`) sıkıştırması uygulanır.
   - Türkçe Wikipedia'nın tamamı sıkıştırıldığında yaklaşık 1.2 GB tuttuğu için tüm veri tek bir 1.2 GB part halinde mühürlenir (10 GB tavan limitini aşmaz). İleride daha büyük dökümlerde otomatik olarak 10 GB sınırında yeni part açar.

4. **`scripts/wikipedia_pipeline/drive_queue.py` (`GoogleDriveSequentialSyncQueue`)**:
   - **Kesinlikle sıralı (concurrency = 1, FIFO):** Paralel yükleme yapılmaz, her part tek tek sırayla gönderilir.
   - **Hash Doğrulama:** Gönderim öncesi yerel dosyanın MD5 hash'i hesaplanır.
   - **Google Drive API v3:** Resumable upload ile aktarılır ve Drive sunucusunun döndürdüğü `md5Checksum` ile yerel hash karşılaştırılır.
   - **Onaylı Disk Temizliği:** Yalnızca `local_md5 == drive_md5` eşleşmesi sağlandığında `os.remove(local_filepath)` ile yerel dosya diskten güvenle silinir. Uyuşmazsa dosya korunur ve hata verilir.
   - Hem OAuth 2.0 (`credentials.json` + `token.json`) hem de Service Account (`service_account.json`) destekler.

5. **`scripts/wikipedia_pipeline/metadata_db.py` & `schema.sql` (`MetadataDB`)**:
   - İlişkisel SQLite veritabanı ile tüm veri yaşam döngüsünü, şifreleme sağlama toplamı defterini (`local_md5`, `drive_md5`) ve makale kaynak dizinini (`article_provenance_index`) kaydeder.
   - Her çalıştırma sonunda (`run_id`) veri seti karnesini ve denetim izini içeren `manifest.json` dosyasını otomatik üretir.

6. **`scripts/wikipedia_pipeline/run_pipeline.py` & `package.json`**:
   - Tüm hattı tek komutla çalıştıran CLI orkestratörü: `npm run trwiki:pipeline -- [argümanlar]`.

---

## 3. Doğrulama ve Test Sonuçları

- **Python Birim Testleri:** `scripts/wikipedia_pipeline/`
  - `test_metadata_db_lifecycle`: PASSED
  - `test_clean_wikitext_removes_markup_and_preserves_text`: PASSED
  - `test_stream_articles_filters_namespace_and_redirects`: PASSED
  - `test_streaming_parquet_sharder`: PASSED
  - `test_drive_queue_dry_run_hash_verification_and_cleanup`: PASSED
  - Sonuç: **5/5 passed (0.46s)**

- **Sistem Testleri:** `npm test`
  - Sonuç: **111/111 passed (0 fail)**

---

## 4. Kullanım Talimatı

### Kuru Çalışma (Dry-run) Testi:
```bash
npm run trwiki:pipeline -- --dry-run --limit 1000
```

### Tam Üretim Çalışması:
```bash
npm run trwiki:pipeline -- --credentials /path/to/credentials.json --folder-id YOUR_DRIVE_FOLDER_ID
```
