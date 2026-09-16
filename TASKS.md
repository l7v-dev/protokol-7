# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Şu an aktif bir görev yok — Faz 2 tamamlandı)*

## Bekleyen (Blok var)

- *(Bekleyen görev yok)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Faz 2: İleri Düzey Veri Toplama Yetenekleri (Proxy, Retry, Session Vault, Disk Frontier Crawler)** — `Tier: 2` — `src/network/proxy-manager.ts` (round-robin, random, sticky domain, karantina, undici ProxyAgent önbellekleme), `src/network/retry-handler.ts` (üstel geri çekilme, jitter, geçici soket ve 429/503 durum kodu kurtarma), `src/browser/session-vault.ts` (Playwright storageState kalıcılığı ve çerez/localStorage geri yükleme), `src/network/crawl-frontier.ts` (disk tabanlı FIFO kuyruk, checkpoint/resume, JSONL akışlı sayfa yazıcı) modülleri geliştirildi; `BrowserPool` ve `PlaywrightBrowserActor` proksi ve oturum desteği kazandı; `CrawlerActor` 10.000 sayfa kapasitesine çıkarılarak akışlı kuyruğa bağlandı; `tests/proxy-manager.test.ts`, `tests/retry-handler.test.ts`, `tests/session-vault.test.ts`, `tests/crawl-frontier.test.ts` eklendi; 107/107 test, 6 aşamalı doğrulama hattı ve doctor başarıyla geçti.
- [x] **Faz 1: Mantıksal Hata, SSRF Perimetre Güvenliği ve Veri Toplama Dayanıklılığı** — `Tier: 2` — `src/network/safe-redirect-fetcher.ts` ile SSRF korumalı güvenli 301/302/308 yönlendirme sarmalayıcısı geliştirildi; `BrowserPool` ve aktörlerde DNS rebinding açığı `validateUrlWithDns` ile kapatıldı; `NetworkInterceptorActor` olay yarışı in-flight bariyeriyle çözüldü; `RunRegistry` (MAX_RUNS 200) ve `InteractiveBrowserController` bellek sızıntıları giderildi; `CrawlerActor` robots.txt crawl-delay direktifine bağlandı; `StealthManager` User-Agent/platform başlık uyumsuzluğu düzeltildi; `StructuredExtractor` iç içe tablo ve colspan desteği eklendi; 88/88 test ve 6 aşamalı doğrulama hattı geçti.
- [x] **Actor Store Ekosistemi ve Web MVP Konsolu** — `Tier: 2` — `src/actors/actor-manifests.ts` ile tüm aktörler için Zod/JSON şemaları ve MCP tanımları çıkarıldı; `src/core/run-registry.ts` ile SSE canlı log akışı kuruldu; `src/core/store-router.ts` ile Store API ve sıfır bağımlılıklı Web MVP Dashboard'u (`/`, `/store`, `/runs`, `/quarantine`, `/.well-known/mcp.json`) geliştirildi; `tests/store-api.test.ts` eklendi; 83/83 test ve 6 aşamalı doğrulama hattı başarıyla geçti.
- [x] **Sağlık Bakanlığı E-Kütüphane İki Aşamalı Arşiv Boru Hattı** — `Tier: 2` — `scripts/harvest-ekutuphane.mjs` iki aşamalı sıralı yürütme (önce tüm ham PDF'leri `raw_landing_pool`'a indir, sonra `out` havuzuna damıt ve ham PDF'leri 7 gün TTL'li `trash` havuzuna taşı), standart İngilizce dizin mimarisi (`books`, `journals`, `articles`, `raw_landing_pool`, `trash`, `out`), 4 kapılı Veto Zinciri (Metadata, Magic Bytes, SHA-256, Content) ve PDF'siz mühürlü nihai çıktı (`.md.gz`, `.json.gz`) ile tamamlandı; 76/76 test, doctor ve 6 aşamalı doğrulama hattı geçti.
- [x] **Faz 10: L5 Güvenlik Seviyesi: Atomik Kontrol Noktası ve Geri Alma (ADR-0009)** — `Tier: 2` — `scripts/checkpoint.mjs` L5 seviyesinde atomik Git snapshot ve geri alma yeteneğiyle geliştirildi; `npm run checkpoint` ve `npm run rollback` scriptleri bağlandı; 76/76 test, doctor ve 6 aşamalı doğrulama hattı geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
