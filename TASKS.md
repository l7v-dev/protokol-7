# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **Belge Cikarimi, OCR Baglayicilari ve Arsiv Yonetimi** — `Tier: 1` — `docs/plans/document-extraction-ocr-archive-plani.md` hazirlandi; kullanici onayi bekleniyor.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **MCP HTTP-SSE Transport (Faz 2: SSE Events + Resources)** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`, `docs/walkthroughs/mcp-http-transport-walkthrough.md` tamamlandı; `resources/list`, `resources/read` (`quarantine://` ve `run://` şemaları), SSE filtreli (`?runId`) olay ve log akışı, 249/249 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **MCP HTTP-SSE Transport (Faz 1: HTTP Transport Çekirdeği)** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`, `docs/walkthroughs/mcp-http-transport-walkthrough.md` tamamlandı; `auth-guard.ts` (constant-time timingSafeEqual Bearer guard), `http-transport.ts` (JSON-RPC 2.0 adapter, 10MB payload guard), `server.ts` rotaları (`POST /mcp`, `GET /mcp/events`), `.env.example`; 243/243 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Pipeline Orchestrator (Faz 3: Scheduler + Remote Execution)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`, `docs/walkthroughs/pipeline-orchestrator-walkthrough.md` tamamlandı; 5 alanlı cron ayrıştırma ve `ScheduleBroker` motoru, `RemoteHttpExecutor`, `PipedreamExecutor`, `GoogleDriveStorage` sürücüsü, CLI `--schedule` daemon modu; 230/230 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Pipeline Orchestrator (Faz 2: Storage Connectors)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`, `docs/walkthroughs/pipeline-orchestrator-walkthrough.md` tamamlandı; AWS S3, Cloudflare R2, Backblaze B2 depolama sürücüleri, ortam değişkeni çözümleyici (`env-resolver`), `ConnectorRegistry` ve `@aws-sdk/client-s3` entegrasyonu; 219/219 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Pipeline Orchestrator (Faz 1: Çekirdek)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`, `docs/walkthroughs/pipeline-orchestrator-walkthrough.md` tamamlandı; Zod şeması + YAML parser (js-yaml), actor resolver, local executor, output sink, jsonl/passthrough/csv/parquet writer'lar, local storage router, pipeline runner ve CLI entegrasyonu (`npm run pipeline`); 206/206 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
