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

