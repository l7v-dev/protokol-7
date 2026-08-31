# Phase 2 HTTP Scraping Engine Backend Task Board

**Program:** Scraping Platform  
**Milestone:** M2 — HTTP Engine Accepted  
**Kapsam:** Backend-only  
**Ön koşul:** GATE-P01-M1 — `CONDITIONAL GO`, kullanıcı onaylı  
**Board sahibi:** Backend Lead  
**Güncel durum:** P02-B08 M2 HTTP Engine gate review

## Amaç

Phase 2, browser gerektirmeyen ve erişim policy'si tarafından izin verilen hedeflerde güvenli, ölçülebilir ve test edilebilir HTTP veri toplama motorunu teslim eder. Bu fazda otomatik CAPTCHA veya kimlik doğrulama bariyeri aşma, serbest kullanıcı JavaScript'i, gerçek proxy provider onboarding'i ve frontend/Control Center geliştirmesi yapılmayacaktır.

## Faz çıkış kriterleri

| Kriter | Beklenen kanıt |
|---|---|
| HTTP request policy | Method, host, port, private IP, redirect, header, body ve timeout kararları deterministic testli |
| GET/POST client | İzinli request'ler mock server fixture'larında çalışır; credential raw değeri dışarı sızmaz |
| Redirect/compression/limits | Her redirect tekrar policy'den geçer; decompressed/response/body limitleri uygulanır |
| Parser/artifact | Desteklenen content type'lar ayrıştırılır; raw response metadata/checksum ile saklanır |
| Reliability | Timeout, rate limit, 4xx/5xx ve Retry-After sınıflandırılır; retry bütçesi korunur |
| Observability | Request/attempt correlation, duration, status class, bytes ve terminal reason görünür |
| E2E | API → task.execute → HTTP worker → task result → job completion gerçek dependency ortamında geçer |
| Operations | Runbook, failure matrix, health/readiness ve rollback notu güncellenir |

## Task register

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P02-B01 | Security/HTTP | HTTP request planı ve outbound policy sözleşmesini kesinleştir | Security Lead | 5 | P01-M1 | Accepted | `docs/phase-2-http-engine-p02-b01-review.md` |
| P02-B02 | HTTP | GET/POST client, izinli header/cookie ve auth reference akışını geliştir | Backend Lead | 6 | P02-B01 | Accepted | `src/http/http-client.ts`, `test/http/http-client.test.ts` |
| P02-B03 | HTTP | Redirect, compression, content-type ve response/body size limitlerini ekle | Backend Lead | 5 | P02-B02 | Accepted | `src/http/http-client.ts`, `src/workers/http-worker.ts`, `test/http/http-client.test.ts`, `test/http/http-worker.test.ts` |
| P02-B04 | Integration | HTTP Worker ile proxy/direct access plan boundary'sini bağla | SRE/Platform Lead | 5 | P02-B03 | Accepted | `src/http/access-plan.ts`, `src/workers/http-worker.ts`, `test/http/access-plan.test.ts`, `test/http/http-worker.test.ts` |
| P02-B05 | Parsing | Response parser ve raw response artifact metadata akışını geliştir | Data/Extraction Lead | 6 | P02-B04 | Accepted | `src/http/response-parser.ts`, `src/workers/http-worker.ts`, `test/http/response-parser.test.ts`, `test/http/http-worker.test.ts` |
| P02-B06 | Reliability | Target/tenant concurrency, rate limit ve cache policy katmanını ekle | SRE/Platform Lead | 6 | P02-B05 | Accepted | `src/http/reliability.ts`, `test/http/reliability.test.ts`, `src/workers/http-worker.ts` |
| P02-B07 | Reliability | HTTP error classifier, Retry-After ve retry budget davranışını tamamla | Backend Lead | 5 | P02-B06 | Accepted | `src/http/reliability.ts`, `src/workers/http-worker.ts`, `test/http/reliability.test.ts` |
| P02-B08 | Quality/Gate | HTTP Engine unit, contract, security, integration ve operations kabulünü yap | QA Lead | 7 | P02-B07 | In Review | `test/http/http-fixture.integration.test.ts`, `docs/phase-2-http-engine-operations.md`, `docs/phase-2-m2-http-engine-gate.md` |

## Değiştirilemez guardrail'ler

| Alan | Kural |
|---|---|
| Yetki ve uyum | Yalnız authorized ve policy-allowed collection; CAPTCHA/anti-bot bypass yok |
| Egress | HTTP/HTTPS, allowlisted host/port, private/link-local/metadata deny; redirect'te tekrar kontrol |
| Secret | Raw credential/cookie/session/auth header persistence, queue, log, trace veya response içine yazılmaz |
| İzolasyon | Her request tenant/project/job/task/attempt correlation'ı taşır; tenant context worker tarafından değiştirilemez |
| Sınırlar | Connect/response/total timeout, request body, compressed/decompressed response ve artifact limitleri zorunludur |
| Retry | Policy violation, credential error ve unsupported content type otomatik retry edilmez |
| Kaynak | HTTP worker önce gelir; Browser fallback bu fazın dışında kalır |

## Review sırası

Önce P02-B01 request planı ve policy sözleşmesi onaylanır. Bu karar sonrasında P02-B02–P02-B03 HTTP client ve response kontrolü, daha sonra P02-B04–P02-B07 reliability/parser katmanları uygulanır. P02-B08 yalnız tüm test ve operasyon kanıtları toplandığında gate review'a alınır.

## References

[1]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve HTTP Engine kabul kriterleri"
[2]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 2 HTTP Scraping Engine detailed task register"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/backend/phase-0-m0-backend-security.md "M0 backend security baseline"
[5]: ./phase-1-m1-gate.md "Phase 1 M1 gate"
