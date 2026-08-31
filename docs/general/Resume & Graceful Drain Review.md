# P09-T04 — Cancel, Pause/Resume & Graceful Drain Review

**Program:** Scraping Platform  
**Phase:** 9 — Job Orchestration  
**Task:** P09-T04  
**Durum:** In Review  
**Kapsam:** Backend-only, process-local control-plane decision contract  
**Bağımlılık:** P09-T03 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P09-T04, tenant/job scoped `JobControlRegistry` ekler. Registry active delivery count üzerinden future dispatch’i fail-closed kapatır; pause/cancel isteği active work varsa graceful drain state’ine geçer, active count sıfıra indiğinde terminal paused/cancelled state’i üretir. Resume yalnız fully paused ve no-active-delivery durumda running’e döner. Hiçbir worker process'i kesilmez, queue message publish edilmez ve persistent state değiştirilmez.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Control snapshot | `src/orchestrator/control-plane.ts` | Tenant/job, status, active count, dispatch gate, revision |
| Pause drain | `src/orchestrator/control-plane.ts` | `RUNNING → PAUSE_DRAINING → PAUSED` |
| Cancel drain | `src/orchestrator/control-plane.ts` | `RUNNING → CANCEL_DRAINING → CANCELLED` |
| Resume gate | `src/orchestrator/control-plane.ts` | Yalnız `PAUSED` + zero active delivery sonrası |
| Safe audit | `src/orchestrator/control-plane.ts` | Control event/type/status/count, no raw payload |
| Unit acceptance | `test/orchestrator/control-plane.test.ts` | Pause/resume, cancel drain, isolation/conflict |

## 2. Control lifecycle

Job initial durumu `RUNNING` ve `dispatchAllowed: true` olur. `admitDispatch` active delivery count’i artırır. Pause/cancel request anından itibaren `dispatchAllowed: false` olur; dolayısıyla yeni task delivery dispatch’i kabul edilmez. Var olan active delivery sayısı `settleDelivery` ile sıfıra indiğinde state intent’e uygun terminal duruma geçer.

| Control operation | Active delivery > 0 | Active delivery = 0 |
|---|---|---|
| Pause request | `PAUSE_DRAINING`, new dispatch kapalı | Doğrudan `PAUSED` |
| Delivery settle during pause | Son settle'da `PAUSED` | Uygulanamaz |
| Resume | Reject | `PAUSED → RUNNING`, new dispatch açık |
| Cancel request | `CANCEL_DRAINING`, new dispatch kapalı | Doğrudan `CANCELLED` |
| Delivery settle during cancel | Son settle'da `CANCELLED` | Uygulanamaz |

> **Graceful drain sınırı:** Contract aktif işi yalnız count olarak takip eder. Worker'a cancel sinyali göndermez ve onun gerçekten durduğunu/commit ettiğini doğrulamaz. P09-T03 lease/commit contract’ı ile gerçek queue worker wiring’i ayrı sorumluluktur.

## 3. Safety, scope ve audit

Control state tenant/job keyed'dir. Cross-tenant scope state'i bulunamaz; invalid transition ve underflow settlement conflict ile reddedilir. Audit event yalnız safe event ID, scope, status, active count ve timestamp içerir. Request body, result, target URL, credentials, cookie/header, selector ya da worker error içeriği saklanmaz.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: pause drain sırasında future dispatch block ve zero-active resume; cancel drain tamamlanınca terminal cancel ve dispatch block; cross-tenant read, invalid resume/settle ve malformed scope reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **64 test dosyası / 271 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Queue'daki pending message stop/cancel | Redis/BullMQ integration gerekir |
| Worker interrupt / acknowledgement | Worker runtime & protocol gerekir |
| Lease heartbeat ile atomic drain coordination | P09-T03'e gerçek persistence/queue wiring gerekir |
| Durable control state/revision | PostgreSQL transaction/persistence gerekir |
| Restart/multi-node recovery | Distributed control/fencing gerekir |
| User-facing API/realtime event | P09-T05 sorumluluğu |
| Audit history/reconciliation | P09-T06 sorumluluğu |

## 6. Review kararı talebi

P09-T04 explicit kullanıcı review'ına sunulmuştur. Onaydan sonra task `Accepted` olarak işaretlenecek ve yalnızca P09-T05 — Progress Event, WebSocket Snapshot & Webhook Event paketi başlatılacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P09 Job Orchestration task register"
[2]: ./phase-9-job-orchestration-p09-t03-review.md "P09-T03 delivery ledger"
[3]: ./phase-9-job-orchestration-task-board.md "Phase 9 task board"
