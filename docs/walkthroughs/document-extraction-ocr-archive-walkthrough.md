# Belge Cikarimi, OCR Baglayicilari ve Arsiv Yonetimi — Walkthrough

Hedef Dal (Branch): `feature/document-ocr-archive`  
Guven Kademesi (Trust Tier): `1`  

---

## Faz 1: Sorunlu PDF Teshis Motoru ve Format Genisletme (DOCX, XLSX, CSV)

### 1. Yapilan Degisiklikler ve Eklenen Bilesenler

1. **`src/core/types.ts`**:
   - `PdfAnomalyStatus`: `"EXTRACTABLE" | "SCANNED_IMAGE_ONLY" | "EMPTY_TEXT_LAYER" | "PASSWORD_PROTECTED" | "CORRUPT_PAYLOAD" | "ENCODING_ERROR"` tipleri tanimlandi.
   - `PdfDocumentAnomalyInfo`: Anomali durumu, OCR tavsiyesi (`ocrRecommended`), ortalama sayfa karakter yogunlugu ve gorsel sayisi iceren sozlesme eklendi.
   - `DocumentExtractorTaskOptions` & `DocumentExtractorResult`: DOCX, XLSX, CSV, TSV formatlari icin girdi/cikti sozlesmeleri eklendi.
   - `ActorType` birligine `"document-extractor"` eklendi.

2. **`src/extractors/pdf-anomaly-detector.ts` (`PdfAnomalyDetector`)**:
   - `%PDF-` baslik imzasi ve bayt butunlugu kontrolu.
   - Sifreli ve parola korumali PDF'leri yakalama (`PASSWORD_PROTECTED`).
   - Taranmis (raster resimlerden olusan) dokumanlari tespit etme (`SCANNED_IMAGE_ONLY`, ortalama karakter/sayfa < 15 ve `/Subtype /Image` varligi).
   - Metin katmani bulunmayan dokumanlari teshis etme (`EMPTY_TEXT_LAYER`).
   - Yuksek oranda (%30+) bozuk veya Unicode yerine gecen (`\uFFFD`) karakterleri tespit etme (`ENCODING_ERROR`).

3. **`src/actors/pdf-document-actor.ts`**:
   - `PdfAnomalyDetector` entegre edildi.
   - Basarili ayristirmalarda sonuca `anomaly` ve `quarantined` bilgisi eklendi.
   - Ayrıştırıcı hatalarinda (sifreli/bozuk), HTTP 500 yerine anlamli durum kodlari (ornek: `423 Locked` veya `422 Unprocessable Entity`) ve teknik anomali nedeni donduruldu.

4. **`src/extractors/tabular-extractor.ts` (`TabularExtractor`)**:
   - RFC 4180 uyumlu CSV ve TSV ayristirici.
   - Cift tirnak icinde virgul, ozel karakter ve cok satirli hucreleri destekleme.
   - Ayirici karakter (delimiter) otomatik tespiti (virgul, tab, noktali virgul, pipe).
   - Yapisal JSON kayitlari (`Record<string, string>[]`) ve GFM Markdown tablolari uretimi.

5. **`src/extractors/office-extractor.ts` (`OfficeExtractor`)**:
   - **Sifir ek bagimlilik** ile calisan dahili ZIP acici (`readZipEntries`).
   - **Microsoft Word (.docx)**: `word/document.xml` uzerinden paragraflar (`<w:p>`), metinler (`<w:t>`), tablolar (`<w:tbl>`) ve `docProps/core.xml` uzerinden metadata cikarimi.
   - **Microsoft Excel (.xlsx)**: `xl/sharedStrings.xml` string tablosu, `xl/workbook.xml` sayfa isimleri ve `xl/worksheets/sheet*.xml` hucre degerleri uzerinden 2D grid ve GFM Markdown tablosu cikarimi.

6. **`src/actors/document-extractor-actor.ts` (`DocumentExtractorActor`)**:
   - DOCX, XLSX, CSV, TSV, TXT, JSON, YAML belgelerini tek merkezden isleyen aktor.
   - `safeRedirectFetch` ile SSRF korumasi ve 50MB yuk siniri.
   - Otomatik format tespiti (dosya uzantisi, PKZip sihirli baytlari ve metin analizi).

7. **Sistem Entegrasyonu**:
   - `src/actors/actor-manifests.ts`: `document-extractor` Store ve MCP manifestosu eklendi.
   - `src/actors/actor-registry.ts`: `DocumentExtractorActor` merkezi aktör kaydına eklendi.
   - `src/index.ts`: Yeni aktor ve ayristiricilar disa aktarildi.
   - `context/architecture-schema.md`: Yeni bilesenler mimari semaya islendi.

---

### 2. Dogrulama Sonuclari

- **Birim ve Entegrasyon Testleri (`npm test`):**
  - Toplam 37 test paketi, 271/271 test basariyla gecti (0 fail, 0 skip).
  - `tests/pdf-anomaly-detector.test.ts`: 7/7 passed.
  - `tests/tabular-extractor.test.ts`: 6/6 passed.
  - `tests/office-extractor.test.ts`: 3/3 passed.
  - `tests/document-extractor-actor.test.ts`: 6/6 passed.
  - `tests/protokol-mcp-server.test.ts`: 10/10 passed (19 kayitli MCP araci dogrulandi).
- **Deterministik Dogrulama Hattı (`npm run verify`):**
  - 6/6 katman basariyla gecti.
- **Depo ve Ortam Saglik Denetimi (`npm run doctor`):**
  - 7/7 kontrol basariyla gecti.

---

## Faz 2: Guvenli Arsiv Cikarim Motoru (ZIP, TAR, GZ, TGZ, RAR)

### 1. Yapilan Degisiklikler ve Eklenen Bilesenler

1. **`src/core/types.ts`**:
   - `ArchiveFormat`: `"zip" | "tar" | "tar.gz" | "gz" | "rar" | "unknown"` tipleri tanimlandi.
   - `ArchiveEntryResult`: Isim, bayt boyutu, dosya turu (file/dir), SHA-256 ozeti, guvenlik uyarisi ve metin onizleme alanlari eklendi.
   - `ArchiveExtractorTaskOptions` & `ArchiveExtractorResult`: Arsiv cikarim gorevi ve cikti sozlesmesi tanimlandi.
   - `ActorType` birligine `"archive-extractor"` eklendi.

2. **`src/archive/archive-guard.ts` (`ArchiveGuard`)**:
   - **Zip Slip Savunmasi**: Null bayt (`\0`), surucu harfleri (`C:`), baslangic egik cizgileri (`/`, `\`) ve goreli yol atlatmalari (`..`) temizlenir; cikarim kokunun disina tasmalar engellenir.
   - **Zip Bomb Savunmasi**: Maksimum dosya boyutu (100 MB), maksimum dosya sayisi (500) ve acilma orani (maksimum 100:1) sinirlari bayt bazinda dinamik takip edilir; asildiginda guvenlik istisnasi firlatilir.

3. **`src/archive/tar-parser.ts` (`TarParser`)**:
   - POSIX ustar standardina dayali sifir bagimlilikli TAR arsiv ayristiricisi.
   - 512 baytlik bloklar uzerinde dosya adi, boyutu, tur bayragi ve checksum dogrulamasi.

4. **`src/archive/zip-parser.ts` (`ZipParser`)**:
   - Standart PKZip formatini End of Central Directory (EOCD) ve Local File Header basliklariyla ayristirir.
   - Sikistirilmamis (Store - 0) ve DEFLATE (8) yontemlerini yerel `node:zlib.inflateRawSync` ile acar.

5. **`src/archive/archive-extractor.ts` (`ArchiveExtractor`)**:
   - ZIP, TAR, TAR.GZ/TGZ, tekli GZ ve RAR (teshis ve baslik analizi) formatlarini destekler.
   - Magic bytes uzerinden format tespiti (`PK\x03\x04`, `\x1f\x8b`, `Rar!\x1a\x07\x00` veya `ustar`).
   - Her dosya icin SHA-256 ozeti hesaplar ve metin dosyalarinda `ContextGuard` ile guvenli metin onizlemesi cikarir.

6. **`src/actors/archive-extractor-actor.ts` (`ArchiveExtractorActor`)**:
   - URL veya Base64 bayt girdisi kabul eder.
   - `safeRedirectFetch` ile SSRF korumasi ve 100 MB maksimum indirme boyutu uygular.
   - Istege bagli dosya yolu deseni (`pattern`) ve onizleme karakter limiti (`previewMaxChars`) destekler.

7. **Sistem Entegrasyonu**:
   - `src/actors/actor-manifests.ts`: `archive-extractor` Store ve MCP araci (`extract_archive`) manifestosu eklendi (toplam 20 MCP araci).
   - `src/actors/actor-registry.ts`: `ArchiveExtractorActor` merkezi aktör kaydına eklendi.
   - `src/index.ts`: Arsiv modulleri (`ArchiveGuard`, `ArchiveExtractor`, `TarParser`, `ZipParser`, `ArchiveExtractorActor`) disa aktarildi.
   - `context/architecture-schema.md`: Arsiv modulu mimari semaya islendi.

---

### 2. Dogrulama Sonuclari

- **Birim ve Entegrasyon Testleri (`npm test`):**
  - Toplam 42 test paketi, 291/291 test basariyla gecti (0 fail, 0 skip).
  - `tests/archive-guard.test.ts`: 15/15 passed.
  - `tests/archive-extractor.test.ts`: 7/7 passed.
  - `tests/archive-extractor-actor.test.ts`: 5/5 passed.
  - `tests/protokol-mcp-server.test.ts`: 10/10 passed (20 kayitli MCP araci dogrulandi).
- **Deterministik Dogrulama Hattı (`npm run verify`):**
  - 6/6 katman basariyla gecti (Mimari dosya butunlugu, isimlendirme, sifir emoji, secret detection, canli SCA paket dogrulama, Biome linter).
- **Depo ve Ortam Saglik Denetimi (`npm run doctor`):**
  - 7/7 kontrol basariyla gecti.

---

## Faz 3: OCR Baglayicilari ve Yerel LLM Vizyon Entegrasyonu

### 1. Yapilan Degisiklikler ve Eklenen Bilesenler

1. **`src/ocr/types.ts`**:
   - `OcrRequest`: `imageBuffer`, `imageBase64`, `mimeType`, `language`, `prompt` ve ek secenekler.
   - `OcrPageResult`: Sayfa numarasi, taninan metin, guven orani ve tespit edilen dil.
   - `OcrResult`: Baglayici adi, toplam metin, sayfa dokumu, toplam karakter ve kelime sayisi.
   - `IOcrConnector`: `name`, `isAvailable(): Promise<boolean>`, `extract(request): Promise<OcrResult>`.

2. **`src/ocr/pdf-rasterizer.ts` (`PdfRasterizer`)**:
   - **Playwright Chromium + HTML Canvas**: PDF sayfalarini harici Cairo/C++ yerel kutuphanelerine ihtiyac duymadan yuksek cozunurluklu (olceklenebilir) PNG tamponuna donusturur.
   - **Gömülü Resim Cikarimi**: Taranmis PDF'lerde sayfaya gomulu raster resimleri dogrudan `unpdf.extractImages` ile hizlica ayiklar.
   - Cikarilan sayfalar ve tarayici oturumlari bellek sizintisi olmadan `BrowserPool.acquireSession` uzerinden guvenle yonetilir.

3. **`src/ocr/connectors/local-llm-vision-connector.ts` (`LocalLlmVisionOcrConnector`)**:
   - Yerel calisan cok modlu vizyon modelleri (Ollama, llama.cpp, vLLM, LocalAI) icin baglayici.
   - `llama3.2-vision`, `qwen2.5-vl`, `minicpm-v` modelleriyle tam uyumlu.
   - Ollama `/api/chat` ve OpenAI uyumlu `/v1/chat/completions` API bicimlerini otomatik algilar.
   - Goruntuleri base64 formatinda aktarir, hiyerarsik Markdown metni olarak cikarir.

4. **`src/ocr/connectors/cloud-vision-connector.ts` (`CloudVisionOcrConnector`)**:
   - Google Cloud Vision REST API (`DOCUMENT_TEXT_DETECTION`) baglayicisi.
   - API anahtari veya servis hesabi ile kimlik dogrulama.

5. **`src/ocr/connectors/mistral-ocr-connector.ts` (`MistralOcrConnector`)**:
   - Mistral AI Document OCR API (`/v1/ocr`) entegrasyonu.
   - Cok sayfali dokumanlarda yapisal Markdown cikarimi.

6. **`src/ocr/connectors/local-tesseract-connector.ts` (`LocalTesseractOcrConnector`)**:
   - Sunucuda `tesseract` binary mevcut oldugunda `child_process` uzerinden yerel OCR gerceklestirir.
   - Binary yoksa guvenle `isAvailable() === false` dondurur.

7. **`src/ocr/connectors/generic-http-connector.ts` (`GenericHttpOcrConnector`)**:
   - Kurumsal ozel OCR mikroservisleri icin yapilandirilabilir HTTP POST entegrasyonu (nokta notasyonu JSON cikti cozumleme).

8. **`src/ocr/ocr-connector-registry.ts` (`OcrConnectorRegistry`, `globalOcrRegistry`)**:
   - Varsayilan baglayicilari kaydeder ve sirali yedekleme (fallback order: `local-llm` -> `cloud-vision` -> `mistral` -> `tesseract` -> `generic-http`) sunar.
   - Cok sayfali dokumanlar icin `executeMultiPageOcr` yurutucusunu saglar.

9. **`src/actors/pdf-document-actor.ts` Entegrasyonu**:
   - `enableOcrFallback: true` verildiginde ve taranmis resim PDF'i tespit edildiginde (`anomaly.ocrRecommended === true`), PDF rasterize edilip OCR motoruna aktarilir.
   - OCR basarili oldugunda dokuman karantinadan cikarilir (`quarantined: false`), durumu `EXTRACTABLE` olarak guncellenir ve sonuca `ocrApplied: true`, `ocrConnectorUsed` alanlari eklenir.

10. **Mimari ve Tip Entegrasyonu**:
    - `src/core/types.ts`: `PdfDocumentResult` genisletildi (`ocrApplied`, `ocrConnectorUsed`).
    - `src/index.ts`: OCR alt sistemi disa aktarildi.
    - `context/architecture-schema.md`: 1.7 OCR Subsystem mimari semaya islendi.

---

### 2. Dogrulama Sonuclari

- **Birim ve Entegrasyon Testleri (`npm test`):**
  - Toplam 51 test paketi, 316/316 test basariyla gecti (0 fail, 0 skip).
  - `tests/ocr-connectors.test.ts`: 20/20 passed.
  - `tests/pdf-rasterizer.test.ts`: 3/3 passed.
  - `tests/pdf-ocr-pipeline.test.ts`: 2/2 passed.
- **Deterministik Dogrulama Hattı (`npm run verify`):**
  - 6/6 katman basariyla gecti.
- **Depo ve Ortam Saglik Denetimi (`npm run doctor`):**
  - 7/7 kontrol basariyla gecti.


