# Kitap, Dergi ve Sureli Yayin Cikarim Motoru Mimarisi ve Uygulama Plani

Bu dokuman, Protokol-7 mikroservisine e-kitap (EPUB), cok sutunlu dergi ve periyodik yayinlarin (periodicals) ayristirilmasi, okuma sirasi duzeltimi ve acik erisimli sureli yayin aktorlerinin entegrasyonu icin teknik mimari plani tanimlar.

---

## 1. Problem Tanimi ve Gereksinimler

1. **E-Kitap (EPUB 2 / EPUB 3) Destegi:**
   - Standart PKZip container icindeki `mimetype`, `META-INF/container.xml`, `content.opf`, `toc.ncx` ve `nav.xhtml` dosyalarinin sifir ek bagimlilikla ayristirilmasi.
   - `manifest` ve `spine` siralama mekanizmasi ile bolumlerin dogru kronolojik sirada temiz GFM Markdown'a donusturulmesi.
   - Hiyerarsik icindekiler agacinin (`TableOfContentsItem`) uretilmesi.

2. **Cok Sutunlu Dergi ve Makale Okuma Sirasi (Multi-Column Layout Resolution):**
   - Dergi ve akademik dizgilerde yer alan 2 ve 3 sutunlu mizanpajlarda, standart yatay satir okumanin sutun metinlerini birbirine karistirmasini engellemek.
   - Bounding-box koordinatlari (`x, y, width, height`) uzerinden sutun oluklarinin (column gutters) tespiti ve sutun bazli dikey okuma sirasinin (top-to-bottom per column) uygulanmasi.

3. **Tekrarlayan Sayfa Ustbilgi / Altbilgi Temizligi (Header & Footer Stripping):**
   - Her sayfada yinelenen dergi adi, sayi, cilt, tarih ve sayfa numaralarinin metin kirliligi olusturmadan ayiklanmasi.

4. **Acik Erisimli Sureli Yayin ve Kitap Kaynak Aktorleri:**
   - **`DergiParkActor`**: Turkiye merkezli akademik hakemli dergiler icin OAI-PMH (Dublin Core XML) metadata ve PDF tam metin erisimi.
   - **`InternetArchiveActor`**: `archive.org` uzerindeki kamuya acik kitap ve dergi koleksiyonlarina BookReader JSON API ve dosya erisimi.

---

## 2. Temel Veri Modelleri ve Tipler (`src/core/types.ts`)

```typescript
export interface PublicationIssueMetadata {
  publicationTitle: string;
  issn?: string;
  isbn?: string;
  volume?: string;
  issue?: string;
  publicationDate?: string;
  publisher?: string;
  language?: string;
  doi?: string;
  authors?: string[];
}

export interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
  href?: string;
  pageNumber?: number;
  children?: TableOfContentsItem[];
}

export interface EpubChapterItem {
  id: string;
  title: string;
  href: string;
  markdownContent: string;
  wordCount: number;
  characterCount: number;
}

export interface EpubExtractorTaskOptions {
  epubBase64?: string;
  includeTableOfContents?: boolean;
  maxChapters?: number;
  timeoutMs?: number;
}

export interface EpubExtractorResult {
  url?: string;
  metadata: PublicationIssueMetadata;
  tableOfContents: TableOfContentsItem[];
  chapters: EpubChapterItem[];
  fullText: string;
  totalChapters: number;
  totalWords: number;
  totalCharacters: number;
}

export interface MultiColumnLayoutOptions {
  enabled?: boolean;
  minColumnGap?: number;
  expectedColumns?: number;
}
```

---

## 3. Uygulama Fazlari

### Faz 1: EPUB Cikarim Motoru (`EpubExtractor` & `EpubExtractorActor`)
- **Dosya:** `src/extractors/epub-extractor.ts` & `src/actors/epub-extractor-actor.ts`
- **Mekanizma:**
  - Mevcut `ZipParser` ve Node.js yerel `zlib` kullanilarak EPUB arsivi hafizada acilir (sifir ucuncu parti kutuphane).
  - `container.xml` icindeki OPF konumu tespit edilir.
  - `content.opf` XML'inden metadata (Dublin Core: dc:title, dc:creator, dc:identifier, dc:language), manifest dosyalar ve `spine` okuma sirasi ayiklanir.
  - `toc.ncx` (EPUB 2) ve `nav.xhtml` (EPUB 3) taranarak hiyerarsik `TableOfContentsItem[]` agaci olusturulur.
  - XHTML bolumleri DOM parser / Turndown uzerinden temiz Markdown'a donusturulur.
  - `EpubExtractorActor` manifestosu hazirlanir ve MCP kataloguna 21. arac (`extract_epub`) olarak kaydedilir.
  - Birim testleri: `tests/epub-extractor.test.ts`.

### Faz 2: Cok Sutunlu Mizanpaj ve Baslik/Altbilgi Cozucu (`MultiColumnLayoutResolver`)
- **Dosya:** `src/extractors/multi-column-layout-resolver.ts`
- **Mekanizma:**
  - Sayfa ici metin parcalarinin `x` ve `y` koordinatlari toplanir.
  - Yatay eksende belirgin bosluk alanlari (gutters) k-means veya histogram frekansi ile tespit edilerek sutun sayisi (1, 2 veya 3) belirlenir.
  - Metin bloklari sutunlara atanir ve sutun icinde yukaridan asagiya dogru dizilir.
  - `HeaderFooterStripper`: Sayfanin ust %8 ve alt %8 diliminde yer alan tekrarlayan kaliplar (sayfa numaralari, dergi basligi) frekans tespiti ile temizlenir.
  - `PdfDocumentActor` icine `multiColumnOptions` destegi entegre edilir.
  - Birim testleri: `tests/multi-column-layout-resolver.test.ts`.

### Faz 3: Sureli Yayin Aktorleri (`DergiParkActor` & `InternetArchiveActor`)
- **Dosya:** `src/actors/dergipark-actor.ts` & `src/actors/internet-archive-actor.ts`
- **Mekanizma:**
  - **`DergiParkActor`:**
    - DergiPark OAI-PMH servisi (`https://dergipark.org.tr/api/public/oai`) uzerinden `ListRecords` ve `GetRecord` XML istekleri.
    - Makale basligi, yazar, ozet, anahtar kelimeler, DOI ve PDF indirme linklerinin cikarilmasi.
  - **`InternetArchiveActor`:**
    - `https://archive.org/metadata/{identifier}` JSON API ve dosya listesi sorgusu.
    - Kitap/dergi metadatalari, DJVU TXT veya ABBYY OCR metin akislarinin cekimi.
  - Birim testleri: `tests/dergipark-actor.test.ts`, `tests/internet-archive-actor.test.ts`.

### Faz 4: REST API, OpenAPI 3.1.0 ve Uc-Uca Dogrulama
- **Dosya:** `src/core/server.ts`, `src/core/openapi-spec.ts`
- **Mekanizma:**
  - `POST /api/v1/epub` rotasi.
  - `POST /api/v1/dergipark` rotasi.
  - `POST /api/v1/internet-archive` rotasi.
  - OpenAPI 3.1.0 semalarinin guncellenmesi.
  - `npm run verify`, `npm run doctor` ve deterministik test hattinin gecirilmesi.

---

## 4. Guvenlik ve Performans Kontrolleri

| Risk | Olasilik | Etki | Onlem |
|---|---|---|---|
| EPUB icinde gomulu zararli baglantilar ve scriptler | Orta | Yuksek | XHTML icerigindeki `<script>`, `<iframe>` ve `onclick` etiketlerinin `ContextGuard` ile soyulmasi. |
| Dev boyutta taranmis dergi PDF'lerinde bellek tukenmesi | Orta | Yuksek | Sayfa bazli streaming ve `maxPages` kisitlamasi. |
| OAI-PMH veya Archive.org isteklerinde asiri yuk / IP engeli | Dusuk | Orta | `PolitenessLimiter` ile origin bazli kuyruklama. |
