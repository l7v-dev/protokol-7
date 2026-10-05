# P3: Akışlı Sıfır-Ham Veri İndirme/İşleme & AI Bağlam Koruması ve Onarılabilir Hata Sözleşmeleri Planı

## 1. Amaç ve Kapsam
Bu plan, protokol-7 platformu için P3 fazı hedeflerini hayata geçirir:
1. **İndirici Performansı (P3 Downloader)**:
   - **Akışlı Sıfır-Ham Veri İşleme (Zero-Raw In-Flight Processing)**: Wikimedia XML `.bz2` arşivini diske ham olarak hiç kaydetmeden; HTTP ağ akışını doğrudan bellekte decompressor -> SAX XML parser -> Parquet Sharder hattına bağlayarak disk I/O darboğazını ortadan kaldırmak ve disk tüketimini %80 azaltmak.
   - **Eşzamanlı In-Flight MD5**: HTTP akışı çözülürken aynı anda ham baytlar üzerinden MD5 hash hesaplanması ve akış bitiminde otomatik doğrulanması.
   - **Dinamik Wikimedia Ayna (Mirror) Seçicisi**: Çoklu resmi Wikimedia aynaları arasında eşzamanlı gecikme (latency) ve hız testi yaparak en hızlı aynanın seçilmesi.
2. **AI Ajanı Entegrasyonu (P3 AI)**:
   - **Context Window Guard (Bağlam Penceresi Koruması)**: LLM ajanlarının jeton limitlerini aşmaması için `ContextGuard` motoru; `maxTokens` / `maxOutputLength` bütçelemesi, içindekiler tablosu (TOC) korumalı akıllı kesme ve yapılandırılmış özet uyarıları.
   - **Self-Healing Machine-Readable Error Contracts**: AI ajanlarının hataları programatik olarak teşhis edip otonom düzeltebilmesi için yapısal hata sözleşmesi (`code`, `retryable: boolean`, `remedy: string`, `timestamp`).

---

## 2. Değişiklik Yapılacak ve Yeni Eklenecek Dosyalar

### 2.1 İndirici ve Veri Hattı Katmanı (`scripts/wikipedia_pipeline/`)
- `scripts/wikipedia_pipeline/downloader.py`:
  - `find_fastest_wikimedia_mirror()`: Resmi Wikimedia ayna sunucularını tarayıp en düşük gecikmeli aynayı seçme fonksiyonu.
  - `stream_decompress_and_hash()`: HTTP yanıt akışını in-flight MD5 hesaplayıcı ile decompressor'a aktaran akış sarmalayıcısı.
- `scripts/wikipedia_pipeline/cleaner.py`:
  - `stream_remote_articles()`: Uzak HTTP URL'sinden doğrudan akışlı (in-flight) XML iterparse ile makale temizleyip yield eden fonksiyon.
- `scripts/wikipedia_pipeline/run_pipeline.py`:
  - `--in-flight` bayrağı ile diske ham `.xml.bz2` yazmadan doğrudan `stream_remote_articles` -> `StreamingParquetSharder` hattını çalıştırma seçeneği.
- `scripts/wikipedia_pipeline/test_pipeline.py`:
  - Akışlı (in-flight) indirme, dekompresyon, MD5 doğrulama ve Parquet yazım testleri.

### 2.2 Çekirdek ve AI Katmanı (`src/core/` & `src/actors/`)
- `src/core/types.ts`:
  - `SelfHealingError` ve `SelfHealingErrorResponse` sözleşmeleri.
  - `MarkdownReaderTaskOptions` içine `maxTokens` ve `maxOutputLength`.
  - `MarkdownReaderResult` içine `isTruncated` ve `retainedTokenCount`.
- `src/core/context-guard.ts` (Yeni):
  - Metin ve markdown çıktıları için jeton tahmini, hiyerarşik sınır kesimi ve teşhis başlıkları üreten koruyucu sınıf (`ContextGuard`).
- `src/actors/markdown-reader-actor.ts`:
  - `ContextGuard` entegrasyonu ile `maxTokens` bütçesine göre akıllı kesme ve TOC koruması.
- `src/core/server.ts`:
  - Standart 4xx/5xx hata yanıtlarına geriye dönük uyumlu `code`, `retryable`, `remedy` ve `timestamp` alanlarının eklenmesi.
- `src/mcp/protokol-mcp-server.ts`:
  - MCP `tools/call` hata yanıtlarında `SelfHealingError` standardının uygulanması.
- `tests/context-guard.test.ts` (Yeni):
  - ContextGuard jeton bütçeleme, kesme ve TOC koruma testleri.
- `tests/server.test.ts`:
  - Self-healing hata formatı doğrulamaları.
- `context/architecture-schema.md`:
  - `src/core/context-guard.ts` envantere eklenmesi.

---

## 3. Doğrulama ve Kabul Kriterleri
1. `scripts/wikipedia_pipeline/.venv/bin/pytest scripts/wikipedia_pipeline/`: 100% PASS.
2. `npm run typecheck`: 0 hata.
3. `npm run test`: Tüm Node.js testleri 100% PASS.
4. `npm run verify`: 6 aşamalı deterministik doğrulama hattı 100% PASS.
5. `npm run doctor`: Depo ve ortam sağlık denetimi PASS.
6. `npm run connectome`: Sistem çizgesinin güncellenmesi.
