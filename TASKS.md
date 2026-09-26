# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Aktif görev yok)*

## Bekleyen (Blok var)

- [ ] **MCP HTTP-SSE Transport** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`; uzak AI agent'ların HTTP üzerinden bağlanabilmesi için POST /mcp adapter katmanı ve Bearer token guard; sıfır yeni bağımlılık; Pipeline Orchestrator'dan önce yapılabilir.
- [ ] **Pipeline Orchestrator (Faz 2: Storage Connectors)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`; S3, Cloudflare R2, Backblaze B2 connector registry ve @aws-sdk/client-s3 entegrasyonu.

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Pipeline Orchestrator (Faz 1: Çekirdek)** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`, `docs/walkthroughs/pipeline-orchestrator-walkthrough.md` tamamlandı; Zod şeması + YAML parser (js-yaml), actor resolver, local executor, output sink, jsonl/passthrough/csv/parquet writer'lar, local storage router, pipeline runner ve CLI entegrasyonu (`npm run pipeline`); 206/206 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Sistem Hataları Giderimi ve Web UI Tasfiyesi** — `Tier: 2` — tamamlandı; 750 satır gomulu HTML/JS SPA kaldirildi, headless JSON service-info endpoint eklendi, network-interceptor manifesti ve MCP araci (intercept_network_api) eklendi, ActorType union tipi duzeltildi, SSRF DNS dogrulama zamanlamas duzeltildi, graceful shutdown eklendi, USER_AGENT sabitleri guncellendi, Biome format hatalari giderildi; 182/182 test ve 6 katmanli dogrulama basariyla gecti.
- [x] **Kurumsal Kütüphane Scraping Aktörleri (Sağlık Bakanlığı & KTB E-Kitap)** — `Tier: 2` — `docs/plans/kurumsal-kutuphane-aktorleri-plani.md`, `docs/walkthroughs/kurumsal-kutuphane-aktorleri-walkthrough.md` tamamlandı; `SaglikEkutuphaneActor` ve `KtbEkitapActor` birinci sınıf mimari aktörleri olarak uygulandı, registry, manifests, 17 MCP aracı, native HTTP router rotaları (`/api/v1/saglik-ekutuphane`, `/api/v1/ktb-ekitap`), OpenAPI 3.1.0 spesifikasyonu ve mimari şeması güncellendi; 175/175 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Sistem Hataları Giderimi ve Downloader Konsolidasyonu** — `Tier: 2` — `docs/plans/sistem-hatalari-giderimi-ve-downloader-konsolidasyonu-plani.md`, `docs/walkthroughs/sistem-hatalari-giderimi-ve-downloader-konsolidasyonu-walkthrough.md` tamamlandı; 10 mimari/algoritmik/mantıksal hata giderildi, `notebooks/wikipedia_drive_downloader.ipynb` kaldırılarak `downloader.py` üzerinde indirme mantığı konsolide edildi; 166/166 Node.js testi, 12/12 Python testi ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **P5: Ek LLM Temiz Veri Aktorleri (Project Gutenberg, Europe PMC, IETF RFC)** — `Tier: 2` — `docs/plans/ek-temiz-veri-aktorleri-plani.md`, `docs/walkthroughs/ek-temiz-veri-aktorleri-walkthrough.md` tamamlandı; `GutenbergActor`, `EuropePmcActor` ve `IetfRfcActor` bileşenleri, kayıt defteri, MCP entegrasyonu (16 araç), OpenAPI 3.1.0 güncellemesi, REST uçbirimleri (`/gutenberg`, `/europe-pmc`, `/ietf-rfc`) ve test paketleri (`tests/gutenberg-actor.test.ts`, `tests/europe-pmc-actor.test.ts`, `tests/ietf-rfc-actor.test.ts`) kuruldu; 161/161 test ve 6 aşamalı doğrulama başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
