# P13-T02 — Component Trace Bindings Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, component-aware, secret-safe, non-exporting trace binding reference contract

## 1. Amaç ve kabul sınırı

P13-T02, API, queue, worker, proxy, extraction ve storage işlem yüzeylerinin P13-T01 ortak trace context'i üzerinde güvenli şekilde izlenebilmesi için component-aware binding katmanı ekler. Phase 13 kabul kriterisi, bir job attempt'in uçtan uca trace ile izlenebilmesidir.[1]

`src/observability/component-trace-bindings.ts`, components için kapalı operation allowlist tanımlar; root/child trace binding başlatır ve component/operation/outcome bilgilerini P13-T01'in bounded safe span katmanına geçirir. Current package automatic caller patching veya remote exporter içermez; bu nedenle gerçek distributed trace E2E iddiası yoktur.

| Component | Allowlisted operation | Trace davranışı |
|---|---|---|
| `API` | `api.request` | Root request veya parent'dan child span |
| `QUEUE` | `queue.publish`, `queue.consume` | Message publish/consume causality child span |
| `WORKER` | `worker.execute` | Task execution child span |
| `PROXY` | `proxy.acquire`, `proxy.release` | Lease lifecycle child span |
| `EXTRACTION` | `extraction.execute` | Extraction operation child span |
| `STORAGE` | `storage.read`, `storage.write` | Artifact/object operation child span |

## 2. Safe binding ve correlation zinciri

Her binding, P13-T01 `TraceContextRegistry` üzerinden root veya child span oluşturur. Parent verildiğinde tenant/job/task/attempt scope birebir eşleşmelidir. Başarılı zincirde API root span'ı; queue publish/consume, worker execute, proxy acquire, extraction execute ve storage write child span'larının aynı trace id/correlation id altında bağlanmasını sağlar.

`end` yalnız `SUCCESS`, `FAILURE` veya `BLOCKED` outcome'larını kabul eder ve bunları safe `outcome` attribute'u ile `OK`/`ERROR` status'a map eder. Component ve operation, caller'ın serbest label girişi yerine source-coded allowlist'ten gelir.

| Red koşulu | Sonuç |
|---|---|
| Component-operation kombinasyonu allowlist dışında | `TRACE_BINDING_INVALID` |
| Parent trace tenant/job/task/attempt scope ile uyuşmaz | `TRACE_BINDING_SCOPE_MISMATCH` |
| Bilinmeyen result/outcome | `TRACE_BINDING_INVALID` |
| P13-T01 trace/span/attribute lifecycle hatası | Alttaki trace contract'ın fail-closed hatası |

## 3. Data minimization ve no-exporter sınırı

Binding output yalnız component, operation, P13-T01 trace/correlation scope ve P13-T01 allowlisted attributes içerir. Raw queue payload, HTTP request/response body, URL, proxy credential, extraction input/output, storage object content/key, authorization, cookie, token, prompt, provider response veya raw error kabul edilmez.

Bu paket mevcut API hook, queue runtime, `HttpWorker`, proxy manager, extraction engine veya storage provider kodunu doğrudan patch etmez. Ayrıca OpenTelemetry SDK/OTLP exporter, collector endpoint, remote carrier parsing, trace backend persistence, dashboard/alert, network veya queue/worker external side effect çalıştırmaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/component-trace-bindings.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/component-trace-bindings.test.ts` | Başarılı — 1 dosya / 3 test | Altı component yüzeyinin ortak trace/correlation zinciri, allowlisted safe attributes/outcome ve operation/scope/result fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 84 dosya / 331 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Fastify, HTTP client, BullMQ queue, `HttpWorker`, proxy, extraction veya storage source'larına automatic instrumentation injection.
2. Actual W3C carrier remote parse/propagation, distributed trace correlation, retry context veya cross-process trace E2E.
3. OpenTelemetry SDK, OTLP/Jaeger/Tempo exporter, trace persistence/sampling, metrics/log backend veya network.
4. Dashboard, alerting, trace retention/access, cost attribution veya incident drill.
5. Raw payload/URL/credential/error capture, custom arbitrary labels, policy bypass veya external operational action.

## 6. Review kararı

P13-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P13-T03 — Platform, Target, Worker, Extraction & Quality Metrics olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T02 kabul kriteri"
