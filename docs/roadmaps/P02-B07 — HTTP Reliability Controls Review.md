# P02-B06/P02-B07 — HTTP Reliability Controls Review

**Program:** Scraping Platform  
**Milestone:** M2 — HTTP Engine Accepted  
**Task:** P02-B06, P02-B07  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P02-B04/P02-B05 — kullanıcı onaylı

## 1. Teslim özeti

HTTP Worker artık request execution'ı `HttpReliabilityController` üzerinden yürütür. Controller target/tenant scope anahtarıyla concurrency semaphore, dakika bazlı rate window, yalnız GET için açıkça etkinleştirilen in-memory cache ve finite retry budget sağlar. Cache yalnız başarılı GET response'larını saklar; POST, hata response'ları ve cache kapalı planlar cache'e girmez.

`HttpErrorClassifier`, HTTP response ve transport/policy error'larını ortak taxonomy altında toplar. `429` için numeric veya HTTP-date `Retry-After` değeri bounded biçimde milisaniyeye çevrilir; `5xx` ve timeout sınıfları retryable, `4xx` ve policy sınıfları terminal kabul edilir. Worker planında retry budget varsa retryable sonuçlar consume edilir; bütçe bittiğinde `RETRY_BUDGET_EXCEEDED` terminal sonucu üretilir.

> **Uyum sınırı:** Reliability katmanı retry'ı yalnız teknik olarak tekrar denenebilir sınıflar için ve finite budget dahilinde kullanır. Policy violation, credential error, unsupported content ve CAPTCHA benzeri erişim sonuçları bypass veya sınırsız retry üretmez.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/reliability.ts` | Error classifier, Retry-After parser, retry budget, concurrency governor, rate limiter ve cache |
| `src/http/http-client.ts` | Request planında `rateLimit`, `retryBudget` ve `cache` alanları |
| `src/workers/http-worker.ts` | Reliability controller execution, status/error classification ve retry budget result mapping |
| `test/http/reliability.test.ts` | Taxonomy, Retry-After, retry budget, cache ve concurrency testleri |
| `test/http/http-worker.test.ts` | Worker reliability result ve terminal proxy failure testleri |

## 3. Reliability sözleşmesi

| Kontrol | Anahtar/sınır | Davranış |
|---|---|---|
| Concurrency | `rateLimit.key` veya tenant/target | Semaphore ile aynı scope'ta eşzamanlı operation sayısı sınırlanır |
| Rate limit | `maxRequestsPerMinute` | Scope başına dakika penceresi; limit dolunca güvenli bekleme uygulanır |
| Cache | GET + `cache.enabled` + TTL | Başarılı response cache'lenir; hit operation çağırmaz |
| Retry budget | `retryBudget.key`, `maxRetries` | Her retryable result bir token tüketir; token yoksa terminal olur |
| Retry-After | 429 response header | Saniye veya HTTP-date bounded delay metadata'sına çevrilir |
| 4xx | Status classifier | Default terminal `HTTP_CLIENT_ERROR` |
| 429 | Rate classifier | `HTTP_RATE_LIMITED`, retryable, bounded Retry-After |
| 5xx | Server classifier | `HTTP_SERVER_ERROR`, retryable |
| Timeout/dependency | Error classifier | Retryability error contract'ten alınır |
| Policy | Egress/auth/unsupported | Terminal, retry yok |

## 4. Worker result davranışı

Worker başarılı 2xx response için parser/artifact success sonucu üretir. 4xx, 429 veya 5xx response için raw body publish etmeden sınıflandırılmış `task.failed` result üretir. Retryable sınıf için plan retry budget'ı tanımlıysa token consume edilir; son token tüketildikten sonraki failure `RETRY_BUDGET_EXCEEDED` ile terminale çevrilir.

Proxy acquire veya direct access policy hataları HTTP operation başlamadan önce sonuçlanır. Proxy provider acquisition failure retryable olabilir, proxy zorunluluğunun karşılanamaması terminaldir. Lease release; success, HTTP status failure veya execution exception sonrasında çağrılır.

## 5. Cache ve veri güvenliği

Cache Phase 2'de in-memory adapter'dır ve process lifecycle ile sınırlıdır. Cache key plan tarafından verilmezse method ve URL üzerinden türetilir; production'da URL query secret içerebileceği için üst katmanın safe canonical key üretmesi zorunludur. Cache response header'ları kopyalanır; sensitive response header'ları zaten HTTP client tarafından filtrelenmiş olmalıdır.

Cache, raw credential, cookie veya auth secret saklamaz. POST ve authentication-sensitive request'ler için varsayılan cache kapalıdır. Tenant/target scope ayrımı korunur; farklı tenant'ların aynı key'i paylaşmaması caller contract'ında zorunlu kabul edilir ve ileriki distributed cache adapter'ında key namespace'e dahil edilmelidir.

## 6. Test kanıtı

Bu paket sonrasında **20 test dosyasında 100 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve tüm Vitest suite başarılıdır. Testler; 429 Retry-After, 404 terminal classification, 503 retryable classification, policy/transport error ayrımı, finite retry budget, GET cache hit, concurrency limit, proxy unavailable terminal failure, artifact result ve mevcut M1 security/lifecycle/tenant contract'larını kapsar.

Gerçek PostgreSQL/Redis integration suite Phase 1'deki sandbox dependency koşulu nedeniyle kontrollü skip olarak kalır; reliability unit/contract suite gerçek Redis rate limiter veya distributed cache davranışını kanıtlamaz.

## 7. Açık sınırlar ve sonraki hardening

| Konu | Mevcut durum | Kapanış yolu |
|---|---|---|
| Distributed rate limit | Process-local rate window | Redis-backed atomic limiter |
| Distributed concurrency | Process-local semaphore | Queue/Redis worker governor |
| Cache | In-memory, GET-only | Policy'li Redis/object cache ve invalidation |
| Backoff execution | Retryability ve Retry-After metadata hazır; scheduler delay'i merkezi değil | P02-B07/queue retry adapter |
| HTTP-date validation | Bounded parse hazır | Clock-skew ve integration test |
| DNS address pinning | Pending | HTTP transport hardening |
| Real provider proxy | Interface/boundary hazır | Proxy Intelligence phase |

## 8. Review kararı talebi

P02-B06/P02-B07 reliability implementation paketi review'a sunulmuştur. Onay sonrasında P02-B08 kapsamında HTTP Engine test, integration, operations ve M2 gate çalışması tamamlanacaktır. P02-B08, gerçek HTTP fixture server ile request/redirect/limit/parser/retry akışını ve mevcut PostgreSQL/Redis integration runner'ını birlikte değerlendirir.

## References

[1]: ./phase-2-http-engine-p02-b04-b05-review.md "P02-B04/P02-B05 access planner, parser ve artifact review"
[2]: ./phase-2-http-engine-p02-b01-review.md "P02-B01 request planı ve outbound policy"
[3]: ./phase-2-http-engine-task-board.md "Phase 2 HTTP Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı"
[6]: ../src/http/reliability.ts "HTTP reliability implementation"
