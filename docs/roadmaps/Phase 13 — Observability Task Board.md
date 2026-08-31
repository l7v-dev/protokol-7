# Phase 13 — Observability Task Board

**Program:** Scraping Platform  
**Phase:** 13 — Observability  
**Milestone:** M13 — Observability SLO Ready  
**Güncel durum:** M13 Accepted — CONDITIONAL GO; P13-T01–P13-T04 ve P13-T06–P13-T08 Accepted; P13-T05 dashboard/frontend Scope Excluded; Phase 12 Control Center kullanıcı talimatıyla Scope Excluded

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P13-T01 | Observability | Ortak OpenTelemetry instrumentation paketini geliştir | SRE/Platform Lead | 6 | P12-T08 (Scope Excluded) | Accepted | `docs/phase-13-observability-p13-t01-review.md`, `src/observability/trace-context.ts`, `test/observability/trace-context.test.ts` |
| P13-T02 | Observability | API, queue, worker, proxy, extraction ve storage trace'lerini ekle | SRE/Platform Lead | 8 | P13-T01 | Accepted | `docs/phase-13-observability-p13-t02-review.md`, `src/observability/component-trace-bindings.ts`, `test/observability/component-trace-bindings.test.ts` |
| P13-T03 | Metrics | Platform, target, worker, extraction ve quality metriklerini ekle | SRE/Platform Lead | 8 | P13-T02 | Accepted | `docs/phase-13-observability-p13-t03-review.md`, `src/observability/operational-metrics.ts`, `test/observability/operational-metrics.test.ts` |
| P13-T04 | Logging | Structured log schema, redaction ve log routing'i uygula | SRE/Platform Lead | 5 | P13-T03 | Accepted | `docs/phase-13-observability-p13-t04-review.md`, `src/observability/structured-logging.ts`, `test/observability/structured-logging.test.ts` |
| P13-T05 | Dashboard | Grafana overview, reliability, quality ve provider dashboard'larını kur | SRE/Platform Lead | 7 | P13-T04 | Scope Excluded — frontend/dashboard operasyon yüzeyi | — |
| P13-T06 | Alerting | Alarm kuralları, severity, on-call routing ve runbook linklerini tanımla | SRE/Platform Lead | 6 | P13-T05 (Scope Excluded) | Accepted | `docs/phase-13-observability-p13-t06-review.md`, `src/observability/alerting.ts`, `test/observability/alerting.test.ts` |
| P13-T07 | Governance | Telemetry retention, access ve completeness kontrolünü uygula | Security Lead | 4 | P13-T06 | Accepted | `docs/phase-13-observability-p13-t07-review.md`, `src/observability/telemetry-governance.ts`, `test/observability/telemetry-governance.test.ts` |
| P13-T08 | Quality/Gate | Observability acceptance ve incident drill'ü tamamla | QA Lead | 6 | P13-T07 | Accepted | `docs/phase-13-observability-p13-t08-review.md`, `src/observability/acceptance-gate.ts`, `test/observability/acceptance-gate.test.ts`, `scripts/observability-gate-smoke.ts` |

> **Bağımlılık notu:** Phase 12 frontend/UI workstream'i kullanıcı tarafından kapsam dışı bırakılmıştır. Bu board, backend-only observability contract'larını kendi explicit review kapılarıyla ilerletir; dashboard/UI işi başlatmaz.

> **M13 karar notu:** Kullanıcı onayıyla M13, açık persistent/exporter/RBAC/on-call/delivery/distributed-E2E koşulları korunarak `Accepted — CONDITIONAL GO` olarak kapatılmıştır. Ayrıntı: `docs/phase-13-observability-m13-gate.md`.
