# Belge Cikarimi, OCR Baglayicilari ve Arsiv Yonetimi — Mimari Plan

Hedef Dal (Branch): `feature/document-ocr-archive`  
Guven Kademesi (Trust Tier): `1` (Yeni moduller ve genisletilmis format motoru; asamali plan ve onay gerekli)  

---

## 1. Problem Tanimi ve Mevcut Durum Analizi

### 1.1 PDF Metin Cikarimindaki Sinirliliklar
Protokol-7 icerisinde PDF dosyalari su an `PdfDocumentActor` uzerinden yalnizca `unpdf` kutuphanesiyle saf metin katmani (text stream) taranarak ayristirilmaktadir. Ancak gercek dunya senaryolarinda su engellerle karsilasilmaktadir:
1. **Taranmis (Raster/Image-only) Dokumanlar:** Dokuman fiziki tarayicidan gecirilmis resimlerden olusur; PDF icerisinde metin katmani hic yoktur veya bos karakterlerden ibarettir (`totalCharacters == 0`).
2. **Dusuk Metin Yogunlugu / Hibrit Dokumanlar:** Sayfada sadece logo veya alt bilgi metni vardir, asil icerik resim icindedir.
3. **Sifreli / Parola Korumali PDF'ler:** Parola girilmediginde parser istisna firlatir veya bos doner.
4. **Bozuk XRef Tablolari ve Yapisal Hatalar:** Eksik `%EOF` veya bozulmus bayt dizisi olan PDF'ler sessizce basarisiz olur.
5. **Ozel / Gomulmemis Font Kodlamasi (CID/Glyph Sorunlari):** Standart olmayan fontlar `\uFFFD` (replacement character) veya anlamsiz bayt dizilimi uretir.

### 1.2 Desteklenen Formatlar ve Eksiklikler
Mevcut desteklenen formatlar:
- `HTML` (Cheerio statik DOM, Playwright dinamik headless DOM, Readability GFM markdown).
- `PDF` (unpdf metin akisi).
- `XML` (Sitemap XML, RSS, Atom feed).
- `JSON-LD` ve `HTML Tablolari` (StructuredExtractor).
- `Markdown` (MarkdownReaderActor).

Desteklenmeyen ancak yuksek hacimli veri kaynaklarinda karsilasilan formatlar:
- **Arsiv Dosyalari:** `.zip`, `.tar`, `.tar.gz` / `.tgz`, `.gz`, `.rar` (Sıkıştırılmış paketler icerisindeki verileri dogrudan cikarip isleyememe).
- **Ofis Dokumanlari:** `.docx` (Microsoft Word OpenXML), `.xlsx` (Excel OpenXML tablolari).
- **Yapisal Tablolar ve Duz Metin:** `.csv`, `.tsv`, `.txt`, `.jsonl`, `.ndjson`.

### 1.3 OCR ve Vizyon Modeli Eksikligi
Metin katmani bulunmayan taranmis gorseller ve PDF'ler icin sistemde hicbir OCR alternatifi (bulut veya yerel) bulunmamaktadir.

---

## 2. Mimari Hedefler ve Temel Prensipler

1. **Sifir Pazarlama Terimi & Teknik Isimlendirme:** Tum moduller mekanizma ve veri yapisi uzerinden adlandirilir (`PdfAnomalyDetector`, `PdfRasterizer`, `OcrConnectorRegistry`, `ArchiveExtractor`, `DocumentExtractorActor`).
2. **Guvenlik ve Sinir Korumasi:**
   - **Zip Slip Savunmasi:** Arsiv icindeki goreli (`../`) veya mutlak dosya yollarinin dosya sistemi disina tasma girisimleri engellenir.
   - **Zip Bomb Savunmasi:** Toplam acilmis boyut (ornek: 100 MB), toplam dosya sayisi (ornek: 500 dosya) ve sikistirma orani (ornek: 100:1) limitleriyle bellek/disk tuketimi onlenir.
   - **SSRF Korumasi:** Uzak arsiv ve dokuman indirmelerinde `safeRedirectFetch` ile ozel ag/metadata erisimleri engellenir.
3. **Kendi Kendine Yeterlilik (Zero-Bloat):**
   - `.docx` ve `.xlsx` dosyalari esasen XML iceren ZIP arsivleridir; agir 3. parti kutuphaneler yerine dahili guvenli ZIP acici ve XML parser ile sifir ekstra yukle ayristirilir.
   - PDF rasterizasyonu (sayfalari gorsel PNG tamponuna donusturme), zaten repoda mevcut olan headless Playwright Chromium havuzu uzerinden yapilir; harici C-tabanli Cairo/Poppler binary bagimliligi olusturulmaz.
4. **Tak-Cikar OCR Baglayici Mimarisi:** Bulut servisleri (Google Cloud Vision, Mistral OCR, Generic HTTP) ve yerel vizyon modelleri (Ollama / Llama.cpp / vLLM uzerinde calisan `llama3.2-vision`, `qwen2.5-vl`, `minicpm-v`) ayni `IOcrConnector` arayuzunu uygular.

---

## 3. Sistem Mimarisi ve Bilesenler

```
                                [ Girdi Verisi ]
                (targetUrl veya Base64: PDF, ZIP, DOCX, CSV, vb.)
                                       |
                                       v
                          +-------------------------+
                          |   MIME & Format Router  |
                          +-------------------------+
                                       |
        +------------------------------+------------------------------+
        |                              |                              |
        v                              v                              v
[ Arsiv Motoru ]              [ Dokuman Motoru ]             [ PDF Motoru ]
(ArchiveExtractor)         (DocumentExtractorActor)       (PdfDocumentActor)
  - ZIP (PKZip)               - DOCX (OpenXML)               - Metin Katmani (unpdf)
  - TAR (ustar)               - XLSX (Spreadsheet)           |
  - GZ / TGZ                  - CSV / TSV                    v
  - RAR (algilama)            - TXT / JSONL         +-------------------------+
        |                              |            |   PdfAnomalyDetector    |
        +------------------------------+            +-------------------------+
        |                                                        |
        v (Gerektiginde Alt Dokumanlara)                         |-- [Normal Metin] --> Sonuc Uret
                                                                 |
                                                                 |-- [Sorunlu / Taranmis PDF]
                                                                 v
                                                    +-------------------------+
                                                    |     Karantina Kaydi     |
                                                    | (Quarantine Registry)   |
                                                    +-------------------------+
                                                                 |
                                                                 v (OCR Fallback Aktifse)
                                                    +-------------------------+
                                                    |      PdfRasterizer      |
                                                    | (Chromium Page Renderer)|
                                                    +-------------------------+
                                                                 |
                                                                 v (PNG Sayfa Tamponlari)
                                                    +-------------------------+
                                                    |  OcrConnectorRegistry   |
                                                    +-------------------------+
                                                                 |
                        +----------------------------------------+----------------------------------------+
                        |                                        |                                        |
                        v                                        v                                        v
          [ LocalLlmVisionConnector ]              [ CloudVisionConnector ]              [ MistralOcrConnector ]
          (Ollama / Llama.cpp / vLLM)             (Google Cloud Vision API)                 (Mistral Document OCR)
          - llama3.2-vision                       - DOCUMENT_TEXT_DETECTION               - /v1/ocr
          - qwen2.5-vl
          - minicpm-v
```

---

## 4. Bilesen Detaylari

### 4.1 Bilesen 1: `PdfAnomalyDetector` (Sorunlu PDF Teshis Motoru)
- **Gorev:** PDF'in saglik ve cikarilabilirlik durumunu inceler.
- **Teshis Siniflari (`PdfAnomalyStatus`):**
  - `EXTRACTABLE`: Metin katmani zengin ve tutarli (ortalama karakter/sayfa >= 40).
  - `SCANNED_IMAGE_ONLY`: Toplam karakter sayisi sifir veya ihmal edilebilir duzeyde (< 15 karakter/sayfa), sayfa icerisinde raster gorsel nesneleri mevcut.
  - `EMPTY_TEXT_LAYER`: Sayfa sayisi pozitif ancak metin akisi bosluk harici karakter icermiyor.
  - `PASSWORD_PROTECTED`: Dokuman sifreli veya erisim izni kisitli.
  - `CORRUPT_PAYLOAD`: Eksik XRef, gecersiz bayt dizilimi veya bozuk PDF akisi.
  - `ENCODING_ERROR`: Cikarilan karakterlerin %30'undan fazlasi `\uFFFD` veya okunamaz glif kodu.
- **Cikti:** `PdfDocumentAnomalyInfo` nesnesi (durum, OCR onerisi, ortalama karakter orani, anomali nedeni).
- **Yonetim:** Sorunlu PDF'ler otomatik olarak Store API karantina sistemine (`quarantine://`) etiketlenerek kaydedilebilir.

### 4.2 Bilesen 2: `PdfRasterizer` (Sifir Ek Bagimlilikli Sayfa Gorseli Donusturucu)
- **Gorev:** Taranmis PDF sayfalarini OCR motoruna iletilmek uzere yuksek cozunurluklu PNG tamponuna (Buffer) donusturur.
- **Mekanizma:** Protokol-7'nin mevcut `BrowserPool` (Playwright Chromium) altyapisini kullanir.
  - PDF yerel veya veri URL'si (`data:application/pdf;base64,...`) olarak Chromium baglaminda acilir.
  - Sayfa boyutlari olceklenerek her sayfanin ekran goruntusu (screenshot) PNG bayt dizisi olarak alinir.
  - Islem bittikten sonra sayfa baglami bellek sizintisi olmadan kapatilir.

### 4.3 Bilesen 3: OCR Baglayici Mimarisi (`src/ocr/`)
Ortak sozlesme (`IOcrConnector`):
```typescript
export interface OcrRequest {
  imageBuffer?: Buffer;
  imageBase64?: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
  options?: Record<string, unknown>;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence?: number;
  detectedLanguage?: string;
}

export interface OcrResult {
  connectorName: string;
  text: string;
  pages: OcrPageResult[];
  totalCharacters: number;
  totalWords: number;
  metadata?: Record<string, unknown>;
}

export interface IOcrConnector {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  extract(request: OcrRequest): Promise<OcrResult>;
}
```

Baglayici Cesitleri:
1. **`LocalLlmVisionOcrConnector` (Yerel Vizyon Modeli):**
   - Baglanti Noktasi: Ollama API (`/api/chat` / `/api/generate`) veya yerel OpenAI uyumlu endpoint (`http://127.0.0.1:11434/v1/chat/completions`, `http://127.0.0.1:8080/v1/chat/completions`).
   - Desteklenen Modeller: `llama3.2-vision`, `qwen2.5-vl`, `minicpm-v`, `llava`.
   - Calisma Prensibi: Sayfa gorselini base64 formatinda yerel modele iletir. Sistem istemi ile metin hiyerarsisini, basliklari ve tablolari duzgun bicimde cikararak dondurur.
2. **`CloudVisionOcrConnector` (Google Cloud Vision):**
   - Repodaki mevcut `googleapis` bagimliligi uzerinden `DOCUMENT_TEXT_DETECTION` servisini cagirir.
3. **`MistralOcrConnector` (Mistral AI Document OCR):**
   - Mistral API (`/v1/ocr`) uzerinden dokuman ve sayfa bazli yapisal metin cikarimi yapar.
4. **`LocalTesseractOcrConnector` (Sistem Tesseract CLI):**
   - Sunucuda `tesseract` binary mevcut ise child process uzerinden yerel OCR gerceklestirir.
5. **`GenericHttpOcrConnector` (Genel HTTP OCR Servisi):**
   - Ozel kurumsal OCR mikroservisleri icin yapilandirilabilir HTTP POST entegrasyonu.

### 4.4 Bilesen 4: `ArchiveExtractor` (Guvenli Sikistirilmis Format Yoneticisi)
- **Desteklenen Formatlar:**
  - `.zip`: PKZip basliklari (`0x04034b50`), Local File Header ve Central Directory taramasi; `node:zlib.inflateRawSync` ile acma (sifir dis bagimlilik).
  - `.tar`: POSIX ustar standardi 512-bayt blok yapisi ile cikarim.
  - `.tar.gz` / `.tgz` / `.gz`: `node:zlib.gunzipSync` + TAR ayristirici.
  - `.rar`: RAR baslik imzasi tespiti ve guvenli meta analizi / unrar koprusu.
- **Guvenlik Bariyerleri:**
  - `ZipSlipGuard`: `entry.name` icinde `..`, kok dizin `/`, veya Windows surucu yollari (`C:`) kontrol edilir; ihlal durumunda `ArchiveSecurityError` firlatilir.
  - `ZipBombGuard`:
    - Maksimum acilmis toplam boyut: 100 MB (yapilandirilabilir).
    - Maksimum dosya adedi: 500 dosya.
    - Sikistirma orani kontrolu: Acilmis boyut / Sikistirilmis boyut > 100 ise islem derhal durdurulur.

### 4.5 Bilesen 5: Genisletilmis Dokuman Formati Ayrıştırıcıları (`DocumentExtractorActor`)
- **Word Dokumanlari (`.docx`):** ZIP yapisi icindeki `word/document.xml` okunarak paragraf (`<w:p>`), calisma (`<w:t>`) ve tablo (`<w:tbl>`) bloklari temiz GFM metnine donusturulur.
- **Excel Tablolari (`.xlsx`):** ZIP yapisi icindeki `xl/sharedStrings.xml` ve `xl/worksheets/sheet*.xml` okunarak 2D tablo yapisi ve GFM tablo ciktisi uretilir.
- **CSV & TSV:** RFC 4180 uyumlu ayirici (delimiter) tespitli, tirnak ve kacis karakteri destekli tabular cikarici.
- **Duz Metin Dosyalari:** `.txt`, `.json`, `.jsonl`, `.ndjson`, `.xml`, `.yaml` icin UTF-8 / ASCII metin normalizasyonu.

---

## 5. Uygulama ve Fazlandirma Plani

### Faz 1: Sorunlu PDF Teshis Motoru ve Format Genisletme (DOCX, XLSX, CSV)
1. `src/core/types.ts`: `PdfAnomalyStatus`, `PdfDocumentAnomalyInfo`, `DocumentExtractorResult` tiplerini tanimla.
2. `src/extractors/pdf-anomaly-detector.ts`: Taranmis resim, sifreli dokuman, dusuk yogunluk ve bozuk bayt kontrol mantigini yaz.
3. `src/actors/pdf-document-actor.ts`: `PdfAnomalyDetector` entegrasyonu sagla; anomali durumunda ciktida `anomaly` nesnesi don.
4. `src/extractors/office-extractor.ts`: Sifir ek bagimlilikla DOCX ve XLSX metin/tablo cikaricisini yaz.
5. `src/extractors/tabular-extractor.ts`: CSV / TSV ayristiricisini olustur.
6. `src/actors/document-extractor-actor.ts`: DOCX, XLSX, CSV, TXT dosyalarini tek merkezden isleyen aktor olustur.
7. Birim testler: `tests/pdf-anomaly-detector.test.ts`, `tests/document-extractor-actor.test.ts`.

### Faz 2: Guvenli Arsiv Cikarim Motoru (ZIP, TAR, GZ, RAR)
1. `src/archive/zip-parser.ts`: Pure Node.js + zlib ZIP ayristirici.
2. `src/archive/tar-parser.ts`: Zero-dependency TAR blok ayristirici.
3. `src/archive/archive-guard.ts`: Zip Slip ve Zip Bomb guvenlik filtreleri.
4. `src/actors/archive-extractor-actor.ts`: Arsivleri acan, icindeki belgeleri tespit edip gerektiginde alt aktorlere yonlendiren aktor.
5. Birim testler: `tests/archive-extractor.test.ts`, `tests/archive-security-guard.test.ts`.

### Faz 3: OCR Baglayici Mimarisi ve Yerel LLM Vizyon Entegrasyonu
1. `src/ocr/types.ts`: `IOcrConnector`, `OcrRequest`, `OcrResult` sozlesmeleri.
2. `src/ocr/pdf-rasterizer.ts`: Playwright Chromium tabanli PDF -> PNG sayfa donusturucu.
3. `src/ocr/connectors/local-llm-vision-connector.ts`: Ollama / yerel LLM vizyon API istemcisi.
4. `src/ocr/connectors/cloud-vision-connector.ts`: Google Cloud Vision API istemcisi.
5. `src/ocr/connectors/mistral-ocr-connector.ts`: Mistral OCR API istemcisi.
6. `src/ocr/connectors/generic-http-connector.ts`: Generic HTTP OCR servisi.
7. `src/ocr/ocr-connector-registry.ts`: Baglayici havuzu ve otomatik fallback orkestrasyonu.
8. `src/actors/pdf-document-actor.ts`: `enableOcrFallback: true` secenegi ile sorunlu PDF'lerde otomatik OCR calistirma.
9. Birim testler: `tests/ocr-connectors.test.ts`, `tests/pdf-ocr-pipeline.test.ts`.

### Faz 4: REST API, Manifestolar, MCP Araclari ve Sistem Entegrasyonu
1. `src/actors/actor-manifests.ts`: Yeni aktorler (`document-extractor`, `archive-extractor`) ve yeni secenekler icin Zod semalari.
2. `src/actors/actor-registry.ts`: Yeni aktorlerin merkezi kaydi.
3. `src/core/server.ts`: `/api/v1/documents`, `/api/v1/archives`, `/api/v1/ocr` endpoint'leri.
4. `src/mcp/protokol-mcp-server.ts`: MCP tool'larina yeni yeteneklerin eklenmesi.
5. Dokumantasyon ve Semalar: `context/architecture-schema.md`, `TASKS.md` guncellemeleri.
6. Dogrulama: `npm run verify`, `npm run doctor`, `npm test`.

---

## 6. Riskler ve Kacinma Stratejileri

| Risk | Olasilik | Etki | Onlem / Cozum |
|---|---|---|---|
| Zip Bomb ile sunucu diskinin veya RAM'in dolmasi | Orta | Kritik | Katı bayt (100MB), dosya adedi (500) ve sikistirma orani (100:1) limitleri getirilmesi. |
| Zip Slip ile sistem dosyalarinin ezilmesi | Orta | Kritik | Arsiv dosyasi yollarinin `path.normalize` ve guvenli kok dizin disina cikma denetiminden gecirilmesi. |
| Chromium bellek sizintisi (PDF rasterizasyonu sirasinda) | Dusuk | Yuksek | Sayfa ekran goruntusu alindiktan hemen sonra `page.close()` cagrilmasi ve zaman asimi korumasi. |
| Yerel LLM vizyon modelinin cevapsiz kalmasi veya cokmesi | Orta | Dusuk | Zaman asimi korumasi (30s) ve hata durumunda zarifce hata dondurme (graceful failure). |
| Ucuncu parti agir kutuphane bagimliligi ve SCA zaafiyeti | Dusuk | Orta | DOCX/XLSX ve ZIP ayristirmasinda harici agir kutuphaneler yerine yerel zlib ve DOM parser kullanilmasi. |
