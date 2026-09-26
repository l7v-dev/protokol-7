# Kitap, Dergi ve Sureli Yayin Cikarim Motoru — Walkthrough

Hedef Dal (Branch): `feature/book-periodical-extractor`  
Guven Kademesi (Trust Tier): `1`  

---

## Faz 1: EPUB Cikarim Motoru (`EpubExtractor` & `EpubExtractorActor`)

### 1. Eklenen Bilesenler ve Mekanizmalar

- **`src/core/types.ts`**:
  - `ActorType` birligine `"epub-extractor"` eklendi.
  - `PublicationIssueMetadata`, `TableOfContentsItem`, `EpubChapterItem`, `EpubExtractorTaskOptions`, `EpubExtractorResult`, `MultiColumnLayoutOptions` arayuzleri tanimlandi.
  - `ActorTask.options` altina `epubOptions?: EpubExtractorTaskOptions` alani eklendi.

- **`src/extractors/epub-extractor.ts` (`EpubExtractor`)**:
  - Sifir ucuncu parti kutuphane politikasina uygun olarak `ZipParser` ve Node.js yerel `zlib` ile container acilimi.
  - `ArchiveGuard.validatePath` ile Zip Slip dizin asimi ve Zip Bomb hacimsel saldiri bariyerleri.
  - `META-INF/container.xml` taranarak OPF rootfile yolunun cozumlenmesi.
  - OPF icinden Dublin Core metadatalarinin (`dc:title`, `dc:creator`, `dc:identifier`, `dc:language`, `dc:publisher`, `dc:date`, `dc:description`, `isbn`, `doi`) ayiklanmasi.
  - `manifest` ve `spine` elemanlari uzerinden dogrusal okuma sirasinin kurulmasi.
  - Hiyerarsik icindekiler tablosu (TOC) agaci: Hem EPUB 3 HTML5 Navigation Document (`nav.xhtml` / `properties="nav"`), hem de EPUB 2 NCX Document (`toc.ncx` / `application/x-dtbncx+xml`) destegi.
  - XHTML bolumlerinin TurndownService ve `StructuredExtractor.extractTables` ile temiz GFM Markdown'a donusturulmesi; `<script>`, `<iframe>` ve `on*` etiketlerinin soyulmasi.
  - Kelime ve karakter metriklerinin hesaplanmasi, `fullText` birlestirmesi.

- **`src/actors/epub-extractor-actor.ts` (`EpubExtractorActor`)**:
  - `safeRedirectFetch` ile SSRF korumali uzaktan indirme (50 MB limit, timeout, proxy ve retry destegi).
  - Dogrudan base64 EPUB ikili girdi destegi (`epubOptions.epubBase64`).
  - Guvenlik bariyeri ihlallerinde 403, gecersiz isteklerde 400, asiri boyutlarda 413, basarili cikarimlarda 200 durum kodlari.

- **Manifest & MCP Entegrasyonu**:
  - `src/actors/actor-manifests.ts` icine `epub-extractor` manifestosu ve 21. MCP araci olan `extract_epub` kaydi eklendi.
  - `src/actors/actor-registry.ts` icine `EpubExtractorActor` kaydedildi.
  - `src/mcp/protokol-mcp-server.ts` icine `epubOptions` eslemesi yapildi.
  - `context/architecture-schema.md` guncellendi.

### 2. Dogrulama Sonuclari

- **Birim Testleri (`tests/epub-extractor.test.ts`, `tests/epub-extractor-actor.test.ts`)**:
  - Toplam 16 yeni test basariyla gecti.
  - Depo genelinde toplam test sayisi **322'den 338'e** cikti; 57 test paketinin tamami basarili.
- **MCP Sunucu Testi (`tests/protokol-mcp-server.test.ts`)**:
  - 21 MCP araci listesi ve `extract_epub` varligi dogrulandi.
- **Deterministik Dogrulama Hatti (`npm run verify`)**:
  - 6/6 katman eksiksiz gecti (Mimari Butunluk, Isimlendirme Disiplini, Sifir Emoji, Secret Detection, Canli SCA Paket Dogrulamasi, Biome Lint).
- **Depo Saglik Denetimi (`npm run doctor`)**:
  - 7/7 kontrol basariyla tamamlandi.

---

## Faz 2: Cok Sutunlu Mizanpaj ve Baslik/Altbilgi Cozucu (`MultiColumnLayoutResolver` & `HeaderFooterStripper`)

### 1. Eklenen Bilesenler ve Mekanizmalar

- **`src/extractors/multi-column-layout-resolver.ts`**:
  - `MultiColumnLayoutResolver`: `unpdf` kutuphanesinin `extractTextItems()` API'sinden gelen `StructuredTextItem[][]` dizisini koordinat tabanli (`x`, `y`, `width`, `height`) histogram analiziyle ayristirir.
  - X ekseni histogramindaki belirgin bosluklardan (gutters >= 20pt) 2 veya 3 sutunlu mizanpaj tespiti yapar, metin ogelerini ilgili sutunlara boler, sutun icinde yukaridan asagiya (y azalan sira) dizer ve sutunlari soldan saga dogru birlestirir.
  - `HeaderFooterStripper`: Sayfanin ust %8 ve alt %8 dilimindeki yineleyen satirlari frekans analiziyle (sayfalarin >= %50'sinde gecme sarti) tespit edip ayiklar. Pozisyon verisi bulunmayan durumlar icin ilk 2 / son 2 satir uzerinde metin-tabanli fallback mekanizmasi sunar.
- **`src/actors/pdf-document-actor.ts`**:
  - `multiColumnOptions.enabled=true` oldugunda `extractText` yerine `extractTextItems` kullanan ayrik koordinat hatti devreye girer. `HeaderFooterStripper.stripFromItems` ve `MultiColumnLayoutResolver.resolvePages` isleminden gecirilen metin bloklari standart `PdfPageEntry` akisina donusturulur.
- **`src/core/types.ts` & Manifestolar**:
  - `PdfDocumentTaskOptions` arayuzune `multiColumnOptions?: MultiColumnLayoutOptions` eklendi.
  - `pdf-document` manifestosu `v1.2.0` surumune yukseltildi ve `multiColumnOptions` girdi semasina eklendi.

### 2. Dogrulama Sonuclari

- **Birim Testleri (`tests/multi-column-layout-resolver.test.ts`)**:
  - 18 yeni test; sutun algilama, sutun ici dikey siralama, soldan saga birlestirme, ust/altbilgi frekans esigi ve hata toleransi dogrulandi.
  - Depo genelinde test sayisi **338'den 356'ya** yukseldi (60 suite).

---

## Faz 3: Sureli Yayin Aktorleri (`DergiParkActor` & `InternetArchiveActor`)

### 1. Eklenen Bilesenler ve Mekanizmalar

- **`src/actors/dergipark-actor.ts` (`DergiParkActor`)**:
  - Turkiye akademik hakemli dergilerine OAI-PMH 2.0 protokolu (`https://dergipark.org.tr/api/public/oai`) uzerinden Dublin Core standardinda erisim saglar.
  - Eylemler:
    - `search`: `ListRecords` ile toplu makale metadata hasadi; baslik ve ozet uzerinde istemci tarafli anahtar kelime (`keyword`) filtresi; `resumptionToken` ile imlec bazli sayfalama.
    - `record`: `GetRecord` ile tekil makale metadatasi (yazarlar, baslik, ozet, dergi/yayinci, ISSN, DOI, PDF baglantisi).
    - `list-sets`: `ListSets` ile kayitli dergi setlerinin listelenmesi.
  - Sifir harici XML kutuphanesi bagimliligi: `cheerio`'nun yerel XML modunu kullanir.
- **`src/actors/internet-archive-actor.ts` (`InternetArchiveActor`)**:
  - `archive.org` kamuya acik koleksiyonlarina erisir.
  - Eylemler:
    - `metadata`: `https://archive.org/metadata/{identifier}` JSON API'si uzerinden kitap/dergi metadatalarini ve dosya listesini dondurur.
    - `search`: `advancedsearch.php` Scraping API'si ile tam metin arama ve filtreleme.
    - `text`: DjVuTXT veya Abbyy GZ formatindaki OCR tam metin akislarini indirir. Node.js yerel `zlib.gunzip` ile sikistirilmis Abbyy GZ dosyalarini cozer ve `maxTextChars` ile boyut sinirlamasini uygular.
- **Manifestolar & MCP Entegrasyonu**:
  - `src/actors/actor-manifests.ts` icine `dergipark` (22. MCP araci: `query_dergipark`) ve `internet-archive` (23. MCP araci: `query_internet_archive`) eklendi.
  - `src/actors/actor-registry.ts` icine her iki aktor kaydedildi.
  - `src/mcp/protokol-mcp-server.ts` icinde secenek yonlendirmeleri (`dergiParkOptions`, `internetArchiveOptions`) yapildi.
  - `tests/protokol-mcp-server.test.ts` icinde toplam arac sayisi 21'den 23'e cikarilarak dogrulandi.
  - `context/architecture-schema.md` guncellendi.

### 2. Dogrulama Sonuclari

- **Birim Testleri (`tests/dergipark-actor.test.ts`, `tests/internet-archive-actor.test.ts`)**:
  - DergiPark: 11/11 test basarili.
  - Internet Archive: 11/11 test basarili.
  - Depo genelinde test sayisi **356'dan 378'e** cikti; 62 test paketinin tamami hatasiz gecti.

