# P05-T03 — Exponential Backoff, Jitter ve Retry-After Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T03  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P05-T02 — review onaylı

## 1. Teslim özeti

Reliability katmanına `RetryDelayCalculator` eklenmiştir. Hesaplayıcı, retry attempt sayısına göre exponential backoff üretir, maksimum gecikme sınırında (`maxDelayMs`) kalır ve jitter ile eşzamanlı retry fırtınası riskini azaltır. Üst sistemlerin test edebilmesi için random kaynağı inject edilebilir; production default'u `Math.random`'dır.

`Retry-After` değeri classifier tarafından parse edilip bounded milliseconds olarak korunur. Delay calculator, Retry-After'ı exponential delay'in altında olmayan bir alt sınır olarak dikkate alır; sonuç hiçbir zaman configured maximum delay'i aşmaz. HTTP worker retryable failure payload'ına `retryDelayMs` ve `retryDelaySource` alanlarını ekler; mevcut `errorCode` ve `retryable` alanları korunur.

> **Temel kural:** Backoff yalnız `retryable=true` ve retry budget izin veriyorsa kullanılabilir. Policy, authentication, anti-bot, CAPTCHA veya client barrier sonucu delay hesaplanıp otomatik retry'a dönüştürülmez.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/reliability.ts` | `RetryDelayCalculator`, options/input/result tipleri ve controller erişimi |
| `src/http/http-client.ts` | `HttpRequestPlan.retryAttempt` alanı |
| `src/workers/http-worker.ts` | Retryable failure payload'ına delay/source metadata'sı |
| `test/http/reliability.test.ts` | Backoff, jitter, cap, Retry-After ve invalid input testleri |
| `test/http/http-worker.test.ts` | 429 + Retry-After → result payload entegrasyonu |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T03 board durumu |

## 3. Delay sözleşmesi

| Alan | Davranış |
|---|---|
| `retryAttempt` | 1-based positive integer; 1 ilk retry'dır |
| `baseDelayMs` | Varsayılan 250 ms |
| `maxDelayMs` | Varsayılan 60.000 ms |
| exponential | `baseDelayMs * 2^(retryAttempt - 1)`, max ile sınırlandırılır |
| `jitterRatio` | Varsayılan 0.2; 0–1 aralığında |
| jitter | `floorDelay * jitterRatio * random`, max boşluğu ile bounded |
| Retry-After | Exponential delay'in alt sınırı; source `RETRY_AFTER` |
| result | `delayMs`, exponential delay, jitter, source ve capped bilgisi |

Hesaplama deterministic input ve injected random ile yeniden üretilebilir. Attempt sayısı yüksek olduğunda exponent overflow riski sınırlı bir exponent cap ile kontrol edilir. `delayMs` her zaman 0'dan büyük ve `maxDelayMs` değerine eşit veya küçüktür.

## 4. Retry-After ve worker entegrasyonu

Classifier 429 response için saniye veya HTTP-date Retry-After formatını mevcut bounded parser üzerinden milliseconds'e çevirir. Worker, retryable response sonucunda `HttpReliabilityController.calculateRetryDelay` çağırır. `retryAttempt` plan'da yoksa backward-compatible default olarak 1 kullanılır. Retry budget tanımlıysa önce budget tüketilir; budget aşılırsa `RETRY_BUDGET_EXCEEDED` terminal payload'ı üretilir ve delay metadata'sı eklenmez.

Örnek retryable result payload'ı şöyledir:

```json
{
  "errorCode": "HTTP_RATE_LIMITED",
  "retryable": true,
  "retryDelayMs": 2000,
  "retryDelaySource": "RETRY_AFTER"
}
```

Bu payload gerçek queue scheduling'i tek başına gerçekleştirmez. Delay'i kullanan orchestrator/queue scheduler, P05-T04 circuit breaker ve P05-T05 retry budget kararlarıyla birlikte çalışmalıdır. Mevcut worker doğrudan sleep veya sınırsız requeue yapmaz.

## 5. Compliance ve güvenlik sınırı

`retryable=false` sınıflandırmaları için worker yalnız terminal error payload üretir. `AUTHENTICATION_REQUIRED`, `ANTI_BOT_BARRIER`, `POLICY_BLOCKED` ve client error sonuçları retry delay'i ile yeniden çalıştırılmaz. Browser fallback shared never-bypass code policy'sini korur.

Retry metadata raw response body, Retry-After header'ın ham değeri, cookie, authorization, credential, target query veya provider secret taşımaz. Yalnız normalized delay ve source enum queue result'a eklenir. Policy violation veya anti-bot barrier için backoff/rotation/bypass yapılmaz.

## 6. Test kanıtı

`test/http/reliability.test.ts` içinde **9 test** bulunmaktadır. Testler status/error classifier, access taxonomy, deterministic exponential backoff, jitter, maximum cap, Retry-After lower bound, invalid options/input, retry budget, cache ve concurrency davranışlarını doğrular.

`test/http/http-worker.test.ts` içinde retryable 429 response'un Retry-After delay metadata'sıyla task result'a dönmesi doğrulanır. P05-T03 özel suite'i lint ve strict typecheck ile başarılıdır. Son tam backend regression sonucu **36 test dosyası / 169 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Queue scheduling | Delay payload'a taşınıyor; merkezi requeue scheduler yok | P05-T04/P05-T06 |
| Circuit breaker | Uygulanmadı | P05-T04 |
| Retry budget | Process-local temel budget mevcut | P05-T05 |
| Jitter random source | Process-local injected function | Distributed worker standardı |
| Delay telemetry | Payload source/delay var | P05-T07 dashboard/runbook |
| Live load/chaos | Çalıştırılmadı | P05-T08 |
| Postgres/Redis E2E | Sandbox dependency yok | M5 gate inherited condition |

## 8. Review kararı talebi

P05-T03 bounded exponential backoff, jitter ve Retry-After paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T04 circuit breaker ve provider/target quarantine mekanizması hazırlanacaktır. Bu paket anti-bot bypass, sınırsız retry veya otomatik provider rotation sağlamaz.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance guardrail policy"
[4]: ./phase-2-http-engine-p02-b06-b07-review.md "HTTP reliability baseline"
[5]: ./phase-4-proxy-intelligence-m4-gate.md "Proxy Intelligence M4 gate"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
[7]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
