# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Aktif görev yok)*

## Bekleyen (Blok var)

- [ ] **MCP HTTP-SSE Transport** — `Tier: 1` — `docs/plans/mcp-http-transport-plani.md`; uzak AI agent'ların HTTP üzerinden bağlanabilmesi için POST /mcp adapter katmanı ve Bearer token guard; sıfır yeni bağımlılık; Pipeline Orchestrator'dan önce yapılabilir.
- [ ] **Pipeline Orchestrator** — `Tier: 1` — `docs/plans/pipeline-orchestrator-plani.md`; actor → schedule → execution target → output processor → storage router tam pipeline orkestrasyon katmanı; Faz 1 önce local+JSONL+local-storage.

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Sistem Hataları Giderimi ve Web UI Tasfiyesi** — `Tier: 2` — tamamlandı; 750 satır gomulu HTML/JS SPA kaldirildi, headless JSON service-info endpoint eklendi, network-interceptor manifesti ve MCP araci (intercept_network_api) eklendi, ActorType union tipi duzeltildi, SSRF DNS dogrulama zamanlamas duzeltildi, graceful shutdown eklendi, USER_AGENT sabitleri guncellendi, Biome format hatalari giderildi; 182/182 test ve 6 katmanli dogrulama basariyla gecti.
- [x] **Kurumsal Kütüphane Scraping Aktörleri (Sağlık Bakanlığı & KTB E-Kitap)** — `Tier: 2` — `docs/plans/kurumsal-kutuphane-aktorleri-plani.md`, `docs/walkthroughs/kurumsal-kutuphane-aktorleri-walkthrough.md` tamamlandı; `SaglikEkutuphaneActor` ve `KtbEkitapActor` birinci sınıf mimari aktörleri olarak uygulandı, registry, manifests, 17 MCP aracı, native HTTP router rotaları (`/api/v1/saglik-ekutuphane`, `/api/v1/ktb-ekitap`), OpenAPI 3.1.0 spesifikasyonu ve mimari şeması güncellendi; 175/175 test ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **Sistem Hataları Giderimi ve Downloader Konsolidasyonu** — `Tier: 2` — `docs/plans/sistem-hatalari-giderimi-ve-downloader-konsolidasyonu-plani.md`, `docs/walkthroughs/sistem-hatalari-giderimi-ve-downloader-konsolidasyonu-walkthrough.md` tamamlandı; 10 mimari/algoritmik/mantıksal hata giderildi, `notebooks/wikipedia_drive_downloader.ipynb` kaldırılarak `downloader.py` üzerinde indirme mantığı konsolide edildi; 166/166 Node.js testi, 12/12 Python testi ve 6 katmanlı doğrulama (`npm run verify`) başarıyla geçti.
- [x] **P5: Ek LLM Temiz Veri Aktorleri (Project Gutenberg, Europe PMC, IETF RFC)** — `Tier: 2` — `docs/plans/ek-temiz-veri-aktorleri-plani.md`, `docs/walkthroughs/ek-temiz-veri-aktorleri-walkthrough.md` tamamlandı; `GutenbergActor`, `EuropePmcActor` ve `IetfRfcActor` bileşenleri, kayıt defteri, MCP entegrasyonu (16 araç), OpenAPI 3.1.0 güncellemesi, REST uçbirimleri (`/gutenberg`, `/europe-pmc`, `/ietf-rfc`) ve test paketleri (`tests/gutenberg-actor.test.ts`, `tests/europe-pmc-actor.test.ts`, `tests/ietf-rfc-actor.test.ts`) kuruldu; 161/161 test ve 6 aşamalı doğrulama başarıyla geçti.
- [x] **P4: LLM'ler Icin Temiz Manipule Edilmemis Veri Cekme Aktorleri (Wikimedia, OpenAlex, Stack Exchange)** — `Tier: 2` — `docs/plans/llm-temiz-veri-aktorleri-plani.md`, `docs/walkthroughs/llm-temiz-veri-aktorleri-walkthrough.md` tamamlandı; resmi REST API'leri uzerinden calisan `WikimediaActor`, `OpenAlexActor` ve `StackExchangeActor` bilesenleri, kayit defteri ve MCP entegrasyonu (13 arac), REST ucbirimleri (`/wikimedia`, `/openalex`, `/stack-exchange`) ve kapsamli test paketleri (`tests/wikimedia-actor.test.ts`, `tests/openalex-actor.test.ts`, `tests/stack-exchange-actor.test.ts`) kuruldu; 147/147 test ve 6 asamali dogrulama hatti basariyla gecti.
- [x] **P3: Akışlı Sıfır-Ham Veri İndirme/İşleme & AI Bağlam Koruması ve Onarılabilir Hata Sözleşmeleri** — `Tier: 2` — `docs/plans/p3-in-flight-streaming-ve-ai-guard-plani.md`, `docs/walkthroughs/p3-in-flight-streaming-ve-ai-guard-walkthrough.md` tamamlandı; `downloader.py` ve `cleaner.py` içerisine zero-raw in-flight HTTP bz2 decompressor + SAX + Parquet akış zinciri (`stream_remote_articles`) ve `find_fastest_wikimedia_mirror()` eklendi; `src/core/context-guard.ts` ile jeton bütçeleme ve `src/core/server.ts` ile `SelfHealingError` sözleşmeleri kuruldu; 134/134 Node.js testi, 11/11 Python pipeline testi ve 6 aşamalı doğrulama başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
