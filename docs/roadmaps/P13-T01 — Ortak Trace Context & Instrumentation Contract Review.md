# P13-T01 — Ortak Trace Context & Instrumentation Contract Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, OpenTelemetry-style trace context/instrumentation reference contract

## 1. Amaç ve kabul sınırı

P13-T01, API/queue/worker zincirinde paylaşılan trace alanlarının görünür olmasını hedefleyen ortak instrumentation paketini tanımlar.[1] `src/observability/trace-context.ts`, W3C `traceparent` biçimine uyumlu root/child trace context, tenant/job/task/attempt scope, correlation id ve bounded span lifecycle sağlar.

Bu paket production OpenTelemetry SDK/exporter kurulumu değildir. Mevcut HTTP telemetry collector ve Fastify observability plugin'i değiştirilmeden, ileride API, queue ve worker adapte edilebilecek type-safe, safe-metadata contract katmanı eklenmiştir.

| Contract yüzeyi | Sağlanan davranış | Kapsam dışı |
|---|---|---|
| `startRoot` | Tenant/job/task/attempt scope'unda root trace + span oluşturur | Incoming HTTP headers parse etmez |
| `startChild` | Parent trace id/correlation id ile child span başlatır | Queue/worker automatic injection yapmaz |
| `carrier` | Strict `traceparent` ve `x-correlation-id` carrier üretir | Arbitrary header/payload taşımaz |
| `end` | Bounded allowlisted attributes ile immutable safe span projection döndürür | Remote exporter/log backend yazmaz |
| `get` | Scope-eşleşen safe span okur | Cross-tenant trace access sağlamaz |

## 2. Trace propagation ve scope bütünlüğü

Trace id 32 hexadecimal, span id 16 hexadecimal ve flags `01` formatındadır. Child span, root/parent'ın trace id'sini ve correlation id'sini korur; yalnız yeni span id alır ve `parentSpanId` üzerinden nedensellik bağını taşır. Context, tenant id ile birlikte opsiyonel job/task/attempt id'leri içerir.

`get` ve child span üretiminde scope bütünlüğü kontrol edilir. Aynı trace/span başka tenant veya job/task/attempt scope ile istenirse `TRACE_CONTEXT_SCOPE_MISMATCH` oluşur. Tenant başına en çok 10.000 process-local span saklanır; böylece sınırsız bellek büyümesi için fail-closed limit vardır.

## 3. Secret-safe attribute minimization

Span attribute key listesi kapalıdır: `service.name`, `component`, `operation.name`, `outcome`, `error.code` ve boolean `retryable`. String value'lar safe identifier pattern'i ve 128 karakter üst sınırı ile doğrulanır; attribute sayısı en çok 6'dır. Böylece URL, query, request/response body, raw error, authorization, cookie, credential, token, prompt veya artifact content taşınamaz.

| Hata/limit koşulu | Sonuç |
|---|---|
| Malformed trace/span/correlation/context id | `TRACE_CONTEXT_INVALID` |
| Sensitive/arbitrary attribute key veya unsafe value | `TRACE_CONTEXT_INVALID` |
| Cross-scope span read/parent kullanım | `TRACE_CONTEXT_SCOPE_MISMATCH` |
| Aynı spanı farklı completion ile bitirme | `TRACE_CONTEXT_CONFLICT` |
| Tenant span limitine ulaşma | `TRACE_CONTEXT_CONFLICT` |

`end`, negative duration'ı reddeder. Aynı completed span sadece birebir aynı completion ile idempotent okunabilir; farklı end time/status/attribute içeriği conflict üretir.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/trace-context.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/trace-context.test.ts` | Başarılı — 1 dosya / 3 test | Root/child propagation/carrier, bounded safe completion projection ve malformed/sensitive/scope/time/conflict fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 83 dosya / 328 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Actual OpenTelemetry SDK, OTLP/Jaeger/Tempo exporter, collector endpoint, sampling policy veya trace backend persistence.
2. Fastify hook, HTTP client, queue message, worker, proxy, extraction, storage ve browser automatic instrumentation integration.
3. W3C carrier'ın remote/incoming parse/validation uygulaması, cross-process context propagation E2E veya distributed trace correlation.
4. Metrics/log exporter, alert/dashboard, retention/access policy, trace cost accounting veya incident drill.
5. Raw payload/URL/credential/error capture, unrestricted attribute/label, policy bypass veya automatic operational action.

## 6. Review kararı

P13-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P13-T02 — API, Queue, Worker, Proxy, Extraction & Storage Trace Bindings olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T01 kabul kriteri"
