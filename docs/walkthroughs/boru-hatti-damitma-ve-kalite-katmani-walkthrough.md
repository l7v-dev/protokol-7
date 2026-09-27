# LLM Veri Fabrikası Boru Hattı Damıtma, Kalite Kapısı ve Tekilleştirme Walkthrough

## 1. Genel Bakış

Bu fazda, `media_1790517372501.md` mimari şartnamesinin NORMALIZE (13), DEDUP (15), STATISTICAL & QUALITY (16) ve QUALITY GATES (17) aşamaları protokol-7 bildirimsel YAML boru hattı (`src/pipeline/`) motoruna saf Node.js ve TypeScript ile entegre edilmiştir.

---

## 2. Gerçekleştirilen Teknik Değişiklikler

### 2.1 Metin Normalizasyonu (`src/pipeline/processors/text-normalizer.ts`)
* **Unicode NFKC Standartlaştırması:** `String.prototype.normalize("NFKC")` ile tipografik ligatürler ve geniş karakterler kanonize edilir.
* **Görünmez ve Sıfır Genişlikli Karakterlerin Temizlenmesi:** Zero-width space (`\u200B`), soft hyphen, BOM karakterleri ayıklanır.
* **Kontrol Karakterleri Güvenliği:** Tab (`\t`), newline (`\n`) ve satır başı (`\r`) hariç ASCII kontrol karakterleri charCode döngüsüyle temizlenir (Biome kurallarına %100 uyumlu).
* **Soykütüğü (Provenance) Kriptografik İzlenebilirliği:** `raw_sha256` ve `normalized_sha256` alanları dokümana otomatik eklenir.

### 2.2 Kalite Filtresi ve Heuristik Kapısı (`src/pipeline/processors/quality-filter.ts`)
* FineWeb ve Gopher heuristik metrikleri:
  * `wordCount`: Kelime sayısı hesabı.
  * `charCount` ve `estimatedTokens`: Karakter ve yaklaşık token sayısı.
  * `symbolRatio`: Sembol ve özel karakter yoğunluğu (kod dökümleri, matematik spam'ı ve bozuk karakter filtreleme).
  * `alphaRatio`: Alfabetik karakter oranı.
  * `duplicateLineFraction`: Tekrarlayan satır oranı (navigasyon ve döngüsel metin vetosu).
  * `ellipsisLineFraction`: Üç nokta ile biten yarım satır oranı.
* `drop` ve `flag` eylemleri ile yapılandırılabilir eşik değerleri.

### 2.3 Tekilleştirme Motoru (`src/pipeline/processors/dedup-filter.ts`)
* **Birebir Tekilleştirme (Exact Dedup):** SHA-256 parmak izi havuzu ile tekrarlayan içerikleri anında filtreler.
* **Yakın Benzerlik Tespiti (Near-Duplicate SimHash):** 64-bit SimHash parmak izi ve Hamming mesafesi ile yeniden yazılmış veya ufak değişiklikler içeren makaleleri tespit eder.

### 2.4 Boru Hattı Şeması ve Çalıştırıcı Entegrasyonu (`schema.ts` ve `pipeline-runner.ts`)
* `PipelineConfigSchema` içerisine `normalization`, `quality_gate` ve `dedup` blokları eklendi.
* `PipelineRunner.runConfig` akışına aktör çıktısı -> normalizasyon -> kalite kapısı -> tekilleştirme -> çıktı paketleyici sırası entegre edildi.
* Yazılan şardlar için `RegistryDatabase.recordVerificationAudit` ve `recordDatasetShard` kayıtları otomatik oluşturulur.

---

## 3. Doğrulama ve Test Sonuçları

1. **Birim ve Entegrasyon Testleri (`tests/pipeline-quality-and-dedup.test.ts`):**
   * 11 yeni test eklendi ve tamamı başarıyla geçti.
2. **Genel Test Paketi (`npm test`):**
   * 449 test, 72 suite, 0 hata, %100 başarı.
3. **Deterministik Doğrulama Hattı (`npm run verify`):**
   * [1/6] Mimari Dosya Bütünlüğü: [OK]
   * [2/6] İsimlendirme ve Dokümantasyon Disiplini: [OK]
   * [3/6] Loglama Disiplini (Sıfır Emoji): [OK]
   * [4/6] Gizli Anahtar Taraması: [OK]
   * [5/6] Bağımlılık ve Paket Halüsinasyonu (SCA): [OK]
   * [6/6] Kod Stili ve Statik Analiz (Biome): [OK] (211 dosya tertemiz)
