# Phase 2 HTTP Engine Operations Runbook

**Program:** Scraping Platform  
**Kapsam:** Backend-only  
**Milestone:** M2 — HTTP Engine Accepted  
**Durum:** Review hazırlığı  
**Owner:** SRE/Platform Lead

## 1. Amaç ve sınır

Bu runbook, HTTP Worker'ın policy kontrollü GET/POST request, redirect, bounded response, parser, artifact, access plan, rate limit, concurrency, cache ve retry taxonomy davranışını local/staging ortamında işletmek için kullanılır. Sistem yalnızca yetkili ve policy-allowed collection için çalıştırılmalıdır.

Otomatik CAPTCHA veya authentication barrier bypass, serbest JavaScript çalıştırma, private network erişimi, raw credential loglama, sınırsız retry ve gerçek proxy provider'a doğrudan secret bağlama bu runbook'un dışında ve yasaktır.

## 2. Ön koşullar

| Gereksinim | Local fixture | Full staging |
|---|---|---|
| Node.js | `>=22` | `>=22` |
| pnpm | Kurulu | CI image içinde |
| PostgreSQL | HTTP fixture için gerekmez | Zorunlu |
| Redis/BullMQ | HTTP fixture için gerekmez | Zorunlu |
| Storage | InMemory veya filesystem | S3-compatible adapter planı |
| Auth | Test/header mode | External provider |
| Proxy | Direct fixture | Provider adapter ve lease policy |

Bağımlılık servisleri yoksa yalnız unit/fixture integration suite çalıştırılır. PostgreSQL/Redis bulunmadığında gerçek API → outbox → queue → orchestrator zinciri başarılı kabul edilmez.

## 3. Doğrulama komutları

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:smoke
pnpm build
```

HTTP fixture integration suite'i tam Vitest run içinde çalışır ve local ephemeral HTTP server kullanır:

```bash
pnpm exec vitest run test/http/http-fixture.integration.test.ts
```

Bu suite; gerçek Node fetch ile GET, POST, allowlisted redirect, response limit, 429 Retry-After, parser ve artifact storage akışını doğrular. Fixture için test-only outbound validator enjeksiyonu kullanılır; production default egress policy private/loopback hedefleri engellemeye devam eder.

## 4. Çalıştırma ve akış

HTTP task envelope'ı `task.execute` queue'sundan alınır. Worker sırasıyla envelope context'ini doğrular, access plan üretir, rate/concurrency governor'a girer, cache'i kontrol eder, HTTP request'i policy üzerinden gönderir, response body'yi bounded tüketir, parser/artifact akışını yürütür ve result queue'suna correlation/trace alanları korunmuş bir mesaj bırakır.

Başarı akışında queue result yalnız güvenli response metadata, parser summary, byte ölçüsü, redirect count ve storage artifact reference taşır. Raw body queue'da tutulmaz. Failure akışında error code, retryable kararı ve retry budget sonucu kaydedilir.

## 5. Health ve gözlemleme

| Alan | Kontrol |
|---|---|
| API liveness | `GET /health/live` |
| API readiness | `GET /api/v1/health/ready` |
| Database | `GET /api/v1/health/database` veya deployment health probe |
| Queue | `GET /api/v1/health/queue` veya deployment health probe |
| Request correlation | `requestId`, `correlationId`, `traceId` |
| HTTP ölçümleri | method, status class, duration, response bytes, redirect count, result class |
| Security ölçümleri | policy denials, private target blocks, raw secret rejection |
| Reliability ölçümleri | rate limited, timeout, retry budget exhausted, cache hit |

URL, query, raw header, cookie, request body, proxy credential veya response secret'i loglanmaz. Host ve tenant değerleri düşük cardinality metric label olarak kullanılmamalıdır.

## 6. Failure matrix

| Belirti | Muhtemel sınıf | Aksiyon | Retry |
|---|---|---|---:|
| Host/private/credential URL reddi | `POLICY` | Target policy ve authorized scope'u incele | Hayır |
| Proxy lease yok | `PROXY_REQUIRED_UNAVAILABLE` | Provider/target planını kontrol et | Hayır |
| Provider acquire geçici hata | `PROXY_ACQUIRE_FAILED` | Provider health ve quota kontrolü | Bütçeli |
| 401/403/4xx | `HTTP_CLIENT_ERROR` | Yetki ve target policy doğrula | Hayır |
| 429 | `HTTP_RATE_LIMITED` | Retry-After ve target rate policy'yi incele | Bütçeli |
| 5xx | `HTTP_SERVER_ERROR` | Target/provider health, backoff ve budget | Bütçeli |
| Timeout | `*_TIMEOUT` | Connect/response/total deadline ve hedef health | Bütçeli |
| Body limit | `RESPONSE_TOO_LARGE` | Target response veya limit policy'sini incele | Hayır |
| Unsupported content | `UNSUPPORTED_CONTENT_TYPE` | Parser desteğini veya target content type'ı incele | Hayır |
| Artifact write failure | Storage dependency | Storage health/checksum/key scope kontrolü | Kontrollü |
| Retry budget bitti | `RETRY_BUDGET_EXCEEDED` | Job/task bütçesini ve hedef davranışını incele | Hayır |

## 7. Incident checklist

Olay sırasında önce `requestId`, `correlationId`, `jobId`, `taskId` ve `attemptId` ile sınırlı log/metric araması yapılır. Ardından policy denial, status class, response duration, response bytes, retry budget, cache, artifact storage ve proxy access plan alanları karşılaştırılır. Raw secret veya cookie istemek, loglamak veya incident kanalına kopyalamak yasaktır.

Policy violation veya private target görülürse retry durdurulur ve target policy/authorized collection kaydı Security Lead'e yönlendirilir. 429/5xx/timeout artışında rate/concurrency budget, Retry-After, provider/target health ve queue backlog incelenir. Artifact checksum veya storage error varsa result publish edilmez; storage health ve idempotent replay yolu doğrulanır.

## 8. Rollback ve recovery

Yeni HTTP worker release'i sorunluysa queue consumer deployment'ı bir önceki immutable image/tag'e rollback edilir. Request plan schema geriye uyumlu tutulur; yeni alanlar optional olmalıdır. Parser veya artifact değişikliği response result contract'ını bozuyorsa worker rollout durdurulur, eski worker ile pending task'lar kontrollü drain edilir ve result duplication için attempt idempotency kontrol edilir.

Retry budget ve rate policy değişiklikleri önce staging'de canary fixture ile doğrulanır. Distributed Redis limiter/cache production'a alınmadan process-local davranış yüksek ölçekli operasyon kanıtı olarak kabul edilmez.

## 9. Production readiness notları

Bu milestone kapsamında gerçek PostgreSQL/Redis integration environment sandbox'ta mevcut değildir; bu nedenle full queue E2E kanıtı oluşturulmamıştır. Gerçek proxy provider, DNS post-resolution address pinning, wire-level compressed byte metering, Redis-backed distributed limiter/cache, S3 adapter ve OpenTelemetry exporter sonraki hardening/phase gate'lerinde kapatılmalıdır.

## References

[1]: ./phase-2-http-engine-task-board.md "Phase 2 HTTP Engine task board"
[2]: ./phase-2-http-engine-p02-b06-b07-review.md "P02-B06/P02-B07 reliability review"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/09-deployment-operations.md "Deployment ve operasyon baseline"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı"
