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
