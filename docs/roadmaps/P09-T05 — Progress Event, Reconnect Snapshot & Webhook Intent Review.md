# P09-T05 — Progress Event, Reconnect Snapshot & Webhook Intent Review

**Program:** Scraping Platform  
**Phase:** 9 — Job Orchestration  
**Task:** P09-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local event/snapshot ve policy-gated webhook intent contract  
**Bağımlılık:** P09-T04 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P09-T05, tenant/job scoped bounded progress event registry ekler. Registry sequence-numbered, value-free lifecycle/progress/control event'leri üretir ve client reconnect için `afterSequence` parametresiyle snapshot + missed event listesi döndürür. Ek olarak event transport'u başlatmayan, egress-guarded `WebhookDeliveryIntent` contract'ı eklenmiştir. Bu paket WebSocket açmaz ve HTTP webhook isteği göndermez.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Progress event model | `src/orchestrator/progress-events.ts` | Job/task/control progress için monotonic sequence event |
| Reconnect snapshot | `src/orchestrator/progress-events.ts` | Latest aggregate snapshot + afterSequence event delta |
| Webhook intent | `src/orchestrator/progress-events.ts` | Egress-validated destination fingerprint + payload checksum |
| Security guard | `src/orchestrator/progress-events.ts` | Private/credential/non-HTTP(S) destination reject, retry/bypass false |
| Unit acceptance | `test/orchestrator/progress-events.test.ts` | Reconnect, webhook policy, forged input reject |

## 2. Progress/reconnect semantics

Event types `JOB_STATE_CHANGED`, `TASK_STATE_CHANGED`, `TASK_PROGRESS`, `DELIVERY_SETTLED` ve `CONTROL_CHANGED` ile sınırlıdır. Event order scope içinde monotonic sequence ile korunur. Snapshot yalnız aggregate current status, completed/total task count, last sequence ve requested cursor sonrası recent event listesi taşır. Stored event sayısı scope başına 1.000 ile bounded’dır.

| Operation | Sonuç | Side effect |
|---|---|---|
| `emit` | Safe event + aggregate snapshot update | Sadece process-local state |
| `snapshot(afterSequence)` | Current snapshot + missed safe events | WebSocket/message göndermez |
| Cursor geçersiz | Fail-closed validation error | State değişmez |
| Scope yok | `PROGRESS_EVENT_SCOPE_NOT_FOUND` | Cross-tenant read yok |

## 3. Webhook intent güvenlik sınırı

`createWebhookDeliveryIntent` yalnız previously constructed safe progress event için çalışır. Destination, mevcut outbound egress policy ile HTTP(S), credential-free, non-private/non-loopback hedef olarak doğrulanır. Output raw destination URL veya event payload taşımaz; destination fingerprint, safe event type, payload checksum ve kesin `retryable: false`, `allowBypass: false` alanları döner.

> **No-delivery sınırı:** Webhook intent, network dispatch, retry planı, redirect follow, credential injection veya bypass izni değildir. Actual transport, signed delivery policy, retry/DLQ ve receipt persistence ayrı bir infrastructure task’ıdır.

## 4. No-leakage ve tenant scope

Progress event ve snapshot request body, raw result, target URL, selector, credential, cookie/header, proxy/provider veya error content saklamaz. Scope tenant + job ile ayrılır. Event ID, status identifier ve count alanları safe bounded metadata’dır.

## 5. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: cursor sonrası reconnect-safe snapshot; deterministic egress-guarded webhook intent ve private destination terminal reject; invalid count/sequence/scope/forged event fail-closed path'leri. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **65 test dosyası / 274 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 6. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Actual WebSocket/SSE connection | Runtime transport/server lifecycle gerekir |
| Webhook HTTP dispatch/redirect verification | Outbound HTTP worker & SSRF hardening gerekir |
| Signed payload/secret management | Secret vault/key rotation integration gerekir |
| Retry/DLQ/delivery receipt | P09-T07 ve durable queue/persistence sorumluluğu |
| Durable event history/replay/reconciliation | P09-T06 sorumluluğu |
| Multi-node event ordering/cursor retention | Shared event store/stream gerekir |

## 7. Review kararı talebi

P09-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T06 — Run/Attempt History, Reconciliation & Audit View olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ../src/security/egress-policy.ts "Outbound egress guard"
[3]: ./phase-9-job-orchestration-p09-t04-review.md "P09-T04 job control contract"
[4]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
