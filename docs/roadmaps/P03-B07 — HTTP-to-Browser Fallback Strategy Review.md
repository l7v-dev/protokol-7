# P03-B07 — HTTP-to-Browser Fallback Strategy Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B07  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B06 — kullanıcı onaylı

## 1. Teslim özeti

HTTP-to-browser strategy kararı `BrowserFallbackPolicy` ile deterministic ve policy-controlled hale getirildi. Başlangıçta varsayılan strategy HTTP'dir. Kullanıcı açıkça browser istediğinde ancak target `allowBrowser=true` ise başlangıç task'ı `BROWSER_FETCH` olarak planlanır; aksi halde sistem güvenli biçimde HTTP'de kalır.

HTTP başarısızlığından browser'a geçiş yalnız içerik yetersizliği veya JavaScript gereksinimi gibi güvenli trigger'lar için mümkündür. Authentication barrier, 401/403, rate limit, private target, genel policy violation, credential error ve CAPTCHA browser ile aşılmaya çalışılmaz. Browser fallback ayrıca finite budget gerektirir.

> **Temel kural:** Browser fallback bir anti-bot veya yetki bypass mekanizması değildir; yalnız policy-allowed content acquisition strategy'sidir.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/fallback.ts` | Initial strategy, safe fallback trigger, forbidden bypass ve budget kararı |
| `src/orchestrator/orchestrator.ts` | Job command'tan initial task type ve strategy metadata planlama |
| `test/browser/fallback.test.ts` | Explicit browser, safe trigger, forbidden bypass, disabled policy ve budget testleri |
| `test/orchestrator/orchestrator.test.ts` | Default HTTP task planning regression |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Strategy karar matrisi

| Input/HTTP sonucu | allowBrowser | Budget | Karar | Gerekçe |
|---|---:|---:|---|---|
| Explicit `BROWSER` request | Evet | — | `BROWSER` | `EXPLICIT_BROWSER` |
| Explicit `BROWSER` request | Hayır | — | `HTTP` | Browser policy dışı |
| No explicit strategy | Herhangi | — | `HTTP` | `DEFAULT_HTTP` |
| `HTTP_JAVASCRIPT_REQUIRED` | Evet | >0 | `BROWSER` | `HTTP_CONTENT_INSUFFICIENT` |
| `HTTP_EMPTY_CONTENT` | Evet | >0 | `BROWSER` | `HTTP_CONTENT_INSUFFICIENT` |
| `UNSUPPORTED_CONTENT_TYPE` | Evet | >0 | `BROWSER` | `HTTP_CONTENT_INSUFFICIENT` |
| Content fallback trigger | Hayır | >0 | `STRATEGY_EXHAUSTED` | `HTTP_BROWSER_FALLBACK_NOT_ALLOWED` |
| Content fallback trigger | Evet | 0 | `STRATEGY_EXHAUSTED` | `BROWSER_FALLBACK_BUDGET_EXHAUSTED` |
| 401/403/429/CAPTCHA/policy | Evet | >0 | `STRATEGY_EXHAUSTED` | `HTTP_FAILURE_NOT_SAFE_FOR_FALLBACK` |

## 4. Orchestrator bağlantısı

`job.create` komutu işlendiğinde orchestrator `input.strategy` ve `input.allowBrowser` alanlarını policy üzerinden değerlendirir. Varsayılan task type `HTTP_FETCH` olarak kalır. İzinli explicit browser seçiminde task type `BROWSER_FETCH` olur. Task payload'a strategy ve strategy reason metadata'sı eklenir; bu alanlar audit/diagnostic amaçlıdır ve worker tenant context'ini değiştiremez.

HTTP failure sonrasında browser fallback'ın yeniden task olarak planlanması, `BROWSER_FALLBACK_BUDGET_EXHAUSTED` veya safe trigger kararlarıyla birlikte orchestration retry/replan mekanizmasına bağlanmalıdır. Bu policy katmanı kararı deterministic verir; duplicate task suppression, attempt history ve result commit P03-B08/Phase 9 hardening kapsamında tamamlanacaktır.

## 5. Güvenlik ve uyum

Browser, HTTP 401/403 veya CAPTCHA sonucunu aşmak amacıyla otomatik başlatılmaz. Private/metadata egress, credential error, disallowed target ve policy violation terminaldir. Rate limit sonucu browser'a geçiş yapılmadığı için request policy'nin etrafından dolaşılmaz.

Fallback budget process/job scope'unda finite tutulmalıdır. Strategy event'i tenant/job/task/attempt/correlation/trace alanlarıyla gözlemlenebilir; raw page content, credential, cookie veya token event'e yazılmaz. User-provided content strategy instruction olarak yorumlanmaz.

## 6. Test kanıtı

Bu pakette **4 yeni fallback policy testi** eklendi. Testler default HTTP, explicit browser, browser disabled, safe content insufficiency, fallback budget exhaustion, 401/403/429/CAPTCHA/private/policy/credential bypass rejection ve non-safe server error davranışını doğrular.

Tam backend regression çalışmasında **27 test dosyası / 129 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler policy ve orchestrator karar katmanını doğrular; gerçek BrowserWorker execution P03-B08 browser environment acceptance'ına bırakılmıştır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki kapsam |
|---|---|---|
| BrowserWorker execution | Task type planlama hazır, gerçek browser consumer pending | P03-B08 |
| Fallback replan | Karar policy hazır, full attempt history/replan pending | P03-B08/Phase 9 |
| Browser availability health | Pool contract hazır, runtime probe pending | P03-B08 |
| Distributed budget | Process/job policy boundary | Orchestration hardening |
| HTTP 403/429 semantics | Intentional no-bypass | Reliability/operations |

## 8. Review kararı talebi

P03-B07 HTTP-to-browser fallback strategy ve orchestrator bağlantı paketi review'a sunulmuştur. Onay sonrasında P03-B08 Browser Engine performance, security, failure injection, gerçek/uygun environment doğrulaması ve M3 gate hazırlığı tamamlanacaktır.

## References

[1]: ./phase-3-browser-engine-p03-b06-review.md "P03-B06 browser artifact capture"
[2]: ./phase-3-browser-engine-p03-b05-review.md "P03-B05 browser network/resource policy"
[3]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
