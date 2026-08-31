# GATE-P02-M2 — HTTP Engine Acceptance Gate

**Program:** Scraping Platform  
**Kapsam:** Backend-only  
**Milestone:** M2 — HTTP Engine Accepted  
**Durum:** Closed — user approved  
**Karar:** `CONDITIONAL GO` — kullanıcı onaylı

## 1. Gate amacı

Bu gate, browser gerektirmeyen policy-allowed hedeflerde HTTP request, response, parser, artifact ve reliability zincirinin Phase 2 kapsamındaki davranışları karşıladığını değerlendirir. Gate production readiness veya gerçek proxy/provider sertifikasyonu anlamına gelmez.

## 2. Kapsam ve kanıtlar

| Alan | Durum | Kanıt |
|---|---|---|
| Request plan ve outbound policy | Tamamlandı | P02-B01 review, Phase 1 egress testleri |
| GET/POST ve auth reference | Tamamlandı | `src/http/http-client.ts`, client suite |
| Redirect ve bounded response | Tamamlandı, transport hardening koşullu | Client suite, fixture integration |
| Direct/proxy access boundary | Tamamlandı | `src/http/access-plan.ts`, access suite |
| Parser/artifact | Tamamlandı | `src/http/response-parser.ts`, parser suite |
| Rate/concurrency/cache | Process-local baseline | `src/http/reliability.ts`, reliability suite |
| Error classifier/retry budget | Tamamlandı, queue backoff entegrasyonu sonraki hardening | Reliability suite, worker suite |
| HTTP worker result flow | Tamamlandı | `src/workers/http-worker.ts`, worker suite |
| Security negative tests | Tamamlandı | Egress, redaction, HTTP policy suites |
| Operations | Tamamlandı | `docs/phase-2-http-engine-operations.md` |
| Full PostgreSQL/Redis E2E | Açık koşul | Sandbox'ta dependency servisleri yok |

## 3. Otomatik kalite sonucu

Son doğrulamada **21 test dosyasında 103 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Gerçek HTTP fixture integration suite'i local ephemeral HTTP server ile üç senaryoda başarılıdır: GET + JSON parse, POST + redirect + response limit ve 429 Retry-After + worker artifact flow.

Test suite'i ayrıca M1 security/lifecycle/tenant/repository contract'larını regression olarak çalıştırır. Full PostgreSQL/Redis integration runner'ı mevcut Phase 1 çevresel koşul nedeniyle kontrollü skip davranışını sürdürür; bu durum gerçek queue E2E başarısı olarak raporlanmaz.

## 4. Exit criteria değerlendirmesi

| Exit criterion | Karar | Açıklama |
|---|---|---|
| Policy dışı host/port/private IP bağlantısı yapılmaması | PASS | Default egress policy ve negative testler |
| GET/POST deterministic fixture davranışı | PASS | Gerçek local HTTP fixture |
| Header/cookie/auth secret izolasyonu | PASS | Reference-only ve response header filtering |
| Redirect'te yeniden policy | PASS | Manual redirect + her hop validation |
| Response/body/decompressed limit | PASS | Bounded response stream; wire metric koşullu |
| Content type/parse sınıflandırması | PASS | JSON/HTML/XHTML/text + terminal parse errors |
| Rate/concurrency/cache controls | CONDITIONAL | Process-local baseline; distributed backend sonraki hardening |
| Retryable/terminal error ayrımı | PASS | Error classifier + finite budget |
| Artifact metadata/checksum | PASS | Tenant/job/task/attempt scoped storage adapter |
| HTTP worker message correlation | PASS | Envelope context korunuyor |
| Full API → DB → outbox → Redis → worker → DB E2E | CONDITIONAL | PostgreSQL/Redis sandbox'ta yok |

## 5. Açık koşullar

| ID | Koşul | Sahip | Kapanış kriteri |
|---|---|---|---|
| C-P02-01 | PostgreSQL ve Redis ile full integration E2E | Backend/SRE | Compose veya staging dependency ile migration, outbox, queue, worker ve result chain geçer |
| C-P02-02 | DNS post-resolution ve socket address pinning | Security/Backend | Resolved A/AAAA adresleri policy'den geçer; connection adresi doğrulanır |
| C-P02-03 | Wire-level compressed byte ölçümü | Backend | Transport adapter compressed/decompressed limitleri ayrı ölçer |
| C-P02-04 | Redis-backed distributed rate/concurrency/cache | SRE | Multi-worker atomic limiter, lease ve invalidation testleri geçer |
| C-P02-05 | Gerçek proxy provider adapter | SRE/Provider | Contract, credential, health, lease ve failure injection gate'i geçer |

## 6. Release ve rollback kararı

`CONDITIONAL GO` ile Phase 2 backend hardening çalışmasına devam edilebilir. Gerçek scraping/provider erişimi, production traffic veya private network yakınsaması başlatılamaz. HTTP Worker release'i sorunlu olursa immutable önceki worker image/tag'ine dönülür; yeni optional message alanları eski consumer'larla uyumlu tutulur.

Policy violation, credential error, unsupported content type, limit aşımı ve proxy zorunluluğu bulunamaması terminal davranışını korur. Retryable response'lar finite budget dışına çıkamaz. Raw secret veya response body queue/log/trace'e sızarsa release durdurulur.

## 7. Sign-off

| Rol | İsim | Karar | Tarih |
|---|---|---|---|
| Engineering Manager | — | Conditional GO — accepted | 2026-08-26 |
| Backend Lead | — | Conditional GO — accepted | 2026-08-26 |
| Security Lead | — | Conditional GO — accepted | 2026-08-26 |
| SRE/Platform Lead | — | Conditional GO — accepted | 2026-08-26 |
| QA Lead | — | Conditional GO — accepted | 2026-08-26 |
| Business Owner / User | — | Onaylandı | 2026-08-26 |

## References

[1]: ./phase-2-http-engine-task-board.md "Phase 2 HTTP Engine task board"
[2]: ./phase-2-http-engine-p02-b01-review.md "P02-B01 request plan ve outbound policy"
[3]: ./phase-2-http-engine-p02-b02-b03-review.md "P02-B02/P02-B03 HTTP client ve worker"
[4]: ./phase-2-http-engine-p02-b04-b05-review.md "P02-B04/P02-B05 access planner, parser ve artifact"
[5]: ./phase-2-http-engine-p02-b06-b07-review.md "P02-B06/P02-B07 reliability controls"
[6]: ./phase-2-http-engine-operations.md "Phase 2 HTTP Engine operations runbook"
[7]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı"
[8]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 2 task register"
