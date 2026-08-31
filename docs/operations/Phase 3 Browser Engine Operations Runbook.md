# Phase 3 Browser Engine Operations Runbook

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Kapsam:** Backend-only  
**Durum:** Review hazırlığı  
**Owner:** SRE/Platform Lead

## 1. Amaç ve çalışma sınırı

Bu runbook, policy-allowed hedeflerde Browser Engine worker'ın Playwright/Chromium runtime, BrowserPool, ephemeral context/session, declarative action, network policy ve artifact capture davranışını işletmek için kullanılır. Browser Engine yalnız HTTP Engine'ın yetersiz kaldığı ve target policy tarafından açıkça izin verilen durumlarda kullanılabilir.

Serbest JavaScript/eval, shell veya CDP komutları, CAPTCHA/anti-bot bypass, authentication barrier aşma, private network erişimi, shared cookie/session state, raw secret loglama ve sınırsız retry yasaktır.

## 2. Ön koşullar

| Gereksinim | Local fixture | Staging/production |
|---|---|---|
| Node.js | `>=22` | `>=22` |
| Playwright | Proje dev dependency | Immutable worker image |
| Chromium | `/usr/bin/chromium` veya pinned image | Pinned compatible browser image |
| PostgreSQL/Redis | Full queue E2E için gerekir | Zorunlu |
| Storage | InMemory/filesystem test | Private S3-compatible adapter |
| Auth/session | Fake resolver/test context | Tenant-scoped secret/session provider |
| Proxy | Direct fixture veya fake lease | Provider adapter/lease policy |

Chromium browser binary'si mevcut değilse browser integration suite explicit skip olabilir; bu durum Browser Engine acceptance pass olarak raporlanmamalıdır. Gerçek acceptance için binary ve OS dependencies pinned image içinde bulunmalıdır.

## 3. Kalite komutları

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:browser
pnpm test --run
pnpm build
```

`pnpm test:browser`, browser pool, session, declarative actions, network policy, artifact, fallback ve Playwright/Chromium integration suite'lerini çalıştırır. Full Vitest run aynı suite'leri regression olarak içerir.

## 4. Browser runtime başlatma

`PlaywrightBrowserRuntime`, Playwright Chromium launch adapter'ıdır. Deployment ortamı `executablePath`, headless mode ve güvenli process args değerlerini immutable config ile sağlamalıdır. BrowserPool `maxBrowsers`, `maxContextsPerBrowser` ve `maxPagesPerContext` değerleri pozitif ve bounded olmalıdır.

Başlangıçta browser version, launch latency, pool capacity, active context/page ve readiness metric'i kaydedilir. Browser launch failure retryable dependency failure olarak sınıflandırılabilir; browser policy veya target policy hataları retryable değildir.

## 5. Request execution akışı

Worker task envelope'ı parse edildikten sonra browser pool'dan attempt-scoped lease alınır. Yeni BrowserContext tenant/project/job/task/attempt bilgileriyle açılır. Session reference varsa tenant scope ve cookie/header policy'den geçirilir. Page lease'i açıldıktan sonra yalnız declarative action DSL yürütülür.

Navigation ve her subresource request'i browser network policy'den geçirilir. Host/port/private IP/resource type/redirect/content type/response bytes kontrol edilir. Capture sonrası screenshot, DOM, PDF veya sanitized network artifact private tenant-scoped storage'a yazılır. Result queue'ya raw body yerine artifact reference ve safe metadata gider.

## 6. Capacity ve cleanup

| Durum | Aksiyon |
|---|---|
| Browser process kapasitesi dolu | `BROWSER_CAPACITY_EXHAUSTED`; bounded retry/queue backpressure |
| Context kapasitesi dolu | Uygun process aranır; yeni process veya capacity error |
| Page kapasitesi dolu | `BROWSER_PAGE_LIMIT`; yeni page açılmaz |
| Action/navigation timeout | Page operation abort; context cleanup |
| Session apply failure | Lease release; result terminal/policy sınıfı |
| Browser crash | Active leases invalid; `BROWSER_RUNTIME_LOST`/`WORKER_LOST` recovery |
| Artifact write failure | Reference yayınlanmaz; storage recovery/controlled retry |
| Worker cancellation | Action signal abort; page/context/lease close |

Cleanup her success, exception, timeout, cancellation ve worker shutdown yolunda idempotent olmalıdır. Context close page state'i, cookie jar'ı ve ephemeral storage'ı yok eder. Persistent user-data directory kullanılacaksa attempt-scoped path ve cleanup doğrulaması zorunludur.

## 7. Security incident checklist

Olayda önce `requestId`, `correlationId`, `jobId`, `taskId`, `attemptId` ve worker identity ile düşük cardinality log/metric araması yapılır. Raw cookie, authorization, password, proxy credential, page body veya form value loglanmaz ve incident kanalına kopyalanmaz.

Private resource, disallowed redirect, forbidden action, 401/403 veya CAPTCHA görülürse browser fallback ile bypass denenmez; task terminal policy sonucu olarak bırakılır. Cross-tenant session material, context reuse veya artifact key mismatch görülürse browser worker rollout durdurulur ve aktif leases kapatılır.

## 8. Rollback ve recovery

Browser worker release'i sorunluysa immutable önceki image/tag'e dönülür. Action DSL, network policy veya artifact result contract'ı geriye uyumlu tutulur. Pending task'lar kontrollü drain edilir; duplicate result commit'i task/attempt idempotency ile önlenir.

Chromium crash rate, memory pressure veya page leak yükselirse worker concurrency ve pool kapasitesi düşürülür; browser process recycle edilir. Restart sonrası orphan lease'ler worker-lost reconciliation ile işlenir. S3 veya secret provider hatasında raw secret fallback'i yapılmaz.

## 9. Gözlemlenecek metrikler

Browser version, launch failure, active browsers, contexts/pages, capacity rejection, action duration/result, navigation duration/result, blocked resource count, redirects, response bytes, artifact bytes, cleanup failure, browser crash, worker lost, session policy denial ve fallback decision ölçülür. URL, query, body, selector value, cookie ve secret metrik label'ı yapılmaz.

## 10. Production readiness notları

P03-B08 gerçek Chromium local integration ile launch, page action, screenshot, DOM ve PDF capture'ı doğrular. Buna rağmen gerçek PostgreSQL/Redis full queue E2E, production proxy provider, DNS post-resolution socket pinning, distributed browser capacity, S3 adapter ve artifact DLP scanner ayrı deployment/hardening koşullarıdır.

## References

[1]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[2]: ./phase-3-browser-engine-p03-b07-review.md "P03-B07 HTTP-to-browser fallback strategy"
[3]: ./phase-2-http-engine-operations.md "Phase 2 HTTP Engine operations baseline"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/09-deployment-operations.md "Deployment ve operasyon baseline"
[6]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
