# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **Belge Cikarimi, OCR Baglayicilari ve Arsiv Yonetimi (Faz 3: OCR Baglayicilari ve Yerel LLM Vizyon Entegrasyonu)** — `Tier: 1` — `docs/plans/document-extraction-ocr-archive-plani.md`, Faz 1 ve Faz 2 tamamlandi.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Guvenli Arsiv Cikarim Motoru (Faz 2: ZIP, TAR, GZ, TGZ, RAR)** — `Tier: 1` — `docs/plans/document-extraction-ocr-archive-plani.md`, `docs/walkthroughs/document-extraction-ocr-archive-walkthrough.md` tamamlandı; `ArchiveGuard` (Zip Slip yol temizligi ve Zip Bomb esik korumasi), `TarParser`, `ZipParser` (sifir bagimlilikli zlib cozumleme), `ArchiveExtractor`, `ArchiveExtractorActor` ve 20. MCP araci (`extract_archive`); 291/291 test ve 6 katmanli dogrulama basariyla gecti.
- [x] **Belge Cikarimi ve Sorunlu PDF Teshisi (Faz 1: Teshis + DOCX/XLSX/CSV)** — `Tier: 1` — `docs/plans/document-extraction-ocr-archive-plani.md`, `docs/walkthroughs/document-extraction-ocr-archive-walkthrough.md` tamamlandı; `PdfAnomalyDetector` (taranmis PDF, sifreli dosya, dusuk metin yogunlugu ve kodlama hatasi tespiti), `OfficeExtractor` (sifir bagimlilikli Word .docx ve Excel .xlsx cikarimi), `TabularExtractor` (RFC 4180 CSV/TSV), `DocumentExtractorActor` ve 19. MCP araci kaydi; 271/271 test ve 6 katmanli dogrulama basariyla gecti.
- [x] **MCP HTTP-SSE Transport (Faz 2: SSE Events + Resources)** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`, `docs/walkthroughs/mcp-http-transport-walkthrough.md` tamamlandı; `resources/list`, `resources/read` (`quarantine://` ve `run://` şemaları), SSE filtreli (`?runId`) olay ve log akışı, 249/249 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **MCP HTTP-SSE Transport (Faz 1: HTTP Transport Çekirdeği)** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`, `docs/walkthroughs/mcp-http-transport-walkthrough.md` tamamlandı; `auth-guard.ts` (constant-time timingSafeEqual Bearer guard), `http-transport.ts` (JSON-RPC 2.0 adapter, 10MB payload guard), `server.ts` rotaları (`POST /mcp`, `GET /mcp/events`), `.env.example`; 243/243 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Pipeline Orchestrator (Faz 3: Scheduler + Remote Execution)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`, `docs/walkthroughs/pipeline-orchestrator-walkthrough.md` tamamlandı; 5 alanlı cron ayrıştırma ve `ScheduleBroker` motoru, `RemoteHttpExecutor`, `PipedreamExecutor`, `GoogleDriveStorage` sürücüsü, CLI `--schedule` daemon modu; 230/230 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
