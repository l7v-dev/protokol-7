# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Aktif bir görev bulunmuyor)*

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Kitap, Dergi ve Sureli Yayin Cikarim Motoru (Faz 4: REST API, OpenAPI 3.1.0 ve Uc-Uca Dogrulama)** — `Tier: 1` — `docs/plans/book-periodical-extractor-plani.md`, `docs/walkthroughs/book-periodical-extractor-walkthrough.md` tamamlandı; `POST /api/v1/epub`, `POST /api/v1/dergipark`, `POST /api/v1/internet-archive` REST rotalari, OpenAPI 3.1.0 sema tanimlari ve interaktif Swagger dokumantasyonu; 381/381 test ve 6 katmanli deterministik dogrulama basariyla gecti.
- [x] **Kitap, Dergi ve Sureli Yayin Cikarim Motoru (Faz 3: DergiParkActor ve InternetArchiveActor)** — `Tier: 1` — tamamlandı; `DergiParkActor` (OAI-PMH 2.0 Dublin Core metadata, makale/PDF cikarimi, arama ve set listeleme, 22. MCP araci `query_dergipark`), `InternetArchiveActor` (archive.org metadata JSON, gelismis arama API'si, DjVuTXT ve Abbyy GZ OCR metin ayiklama, 23. MCP araci `query_internet_archive`); birim testleri ve MCP entegrasyonu basariyla gecti.
- [x] **Kitap, Dergi ve Sureli Yayin Cikarim Motoru (Faz 2: Cok Sutunlu Mizanpaj ve Baslik/Altbilgi Cozucu)** — `Tier: 1` — tamamlandı; `MultiColumnLayoutResolver` (unpdf `extractTextItems` koordinat tabanli x-ekseni histogram-gutter tespiti, 2-3 sutun yeniden siralama), `HeaderFooterStripper` (koordinat tabanli ve metin-tabanli mod, frekans esigi), `PdfDocumentActor` `multiColumnOptions` entegrasyonu; 356/356 test, 60 suite, 0 hata.
- [x] **Kitap, Dergi ve Sureli Yayin Cikarim Motoru (Faz 1: EPUB Cikarici - EpubExtractor & EpubExtractorActor)** — `Tier: 1` — `docs/plans/book-periodical-extractor-plani.md`, `docs/walkthroughs/book-periodical-extractor-walkthrough.md` tamamlandı; `EpubExtractor` (sifir bagimlilikli container, OPF Dublin Core metadata, spine okuma sirasi, EPUB 2/3 hiyerarsik TOC, GFM Markdown donusumu), `EpubExtractorActor` (SSRF guard, base64 payload, byte limiti) ve 21. MCP araci (`extract_epub`); 338/338 test ve 6 katmanli dogrulama basariyla gecti.
- [x] **Belge Cikarimi, OCR Baglayicilari ve Arsiv Yonetimi (Faz 4: REST API, OpenAPI 3.1.0 ve Uc-Uca Dogrulama)** — `Tier: 1` — `docs/plans/document-extraction-ocr-archive-plani.md`, `docs/walkthroughs/document-extraction-ocr-archive-walkthrough.md` tamamlandı; `POST /api/v1/documents`, `POST /api/v1/archives`, `POST /api/v1/ocr` REST endpoint'leri, OpenAPI 3.1.0 semasi ve interaktif dokumantasyon; 322/322 test ve 6 katmanli dogrulama basariyla gecti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
