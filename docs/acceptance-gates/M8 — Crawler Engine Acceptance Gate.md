# M8 — Crawler Engine Acceptance Gate

**Program:** Scraping Platform  
**Milestone:** M8 — Crawler Engine Accepted  
**Durum:** Accepted — kullanıcı onaylı  
**Karar:** `CONDITIONAL GO`  
**Kapsam:** Backend-only deterministic contract ve fixture acceptance

## 1. Gate özeti

Phase 8 kapsamında P08-T01–P08-T07 kullanıcı onayıyla `Accepted` durumundadır. P08-T08, crawler frontier, clean HTML link discovery, canonical identity/dedupe, terminal policy kararları, limit admission, sitemap priority ordering ve local checkpoint recovery contract'larını tek deterministic harness içinde doğrular. M8 için öneri `CONDITIONAL GO`’dur; bu karar gerçek crawler service E2E veya production readiness iddiası değildir.[1] [2]

| Alan | Gate kanıtı | Durum |
|---|---|---|
| Frontier & partition | Tenant/job scoped entry, deterministic partition, canonical dedupe | PASS — process-local |
| Discovery | Clean HTML anchor discovery, parent provenance, unsafe skip | PASS — no fetch |
| URL identity | Host/default-port/fragment/query order canonicalization | PASS — conservative policy |
| Crawl policy | Robots snapshot, host/path rules, nofollow, terminal no-bypass | PASS — no robots fetch |
| Limits | Duplicate, depth, page, pagination chain admission | PASS — caller-owned snapshot |
| Sitemap & priority | Bounded XML candidate extraction, deterministic ranking | PASS — no sitemap fetch/queue |
| Checkpoint/recovery | Pause/resume, claimed work reset, commit owner guard | PASS — process-local |

## 2. P08-T08 acceptance harness

`pnpm test:crawler-gate` external network, database, Redis/BullMQ, storage veya browser çağrısı yapmadan çalışır. Harness aşağıdaki chain'i doğrular: clean HTML’den parent-provenance link discovery; canonical semantic dedupe ile tek frontier entry; robots/nofollow terminal no-bypass policy block; page limit fail-closed admission; deterministic priority ranking; paused claimed checkpoint entry'nin resume sonrası pending'e dönmesi.

> **Harness sınırı:** Bu evidence yalnız deterministic module integration’ıdır. DNS resolution, HTTP/browser fetch, remote robots/sitemap retrieval, provider behavior, real queue processing veya durable recovery kanıtı değildir.

## 3. P08 exit criteria traceability

| Task | Kabul odağı | Kanıt | Durum |
|---|---|---|---|
| P08-T01 | Frontier, crawl state, partition | [P08-T01 review][3] | Accepted |
| P08-T02 | Link discovery/provenance | [P08-T02 review][4] | Accepted |
| P08-T03 | Canonicalization/deduplication | [P08-T03 review][5] | Accepted |
| P08-T04 | robots/domain policy | [P08-T04 review][6] | Accepted |
| P08-T05 | Depth/page/pagination limits | [P08-T05 review][7] | Accepted |
| P08-T06 | Sitemap/priority ordering | [P08-T06 review][8] | Accepted |
| P08-T07 | Checkpoint/recovery contract | [P08-T07 review][9] | Accepted |
| P08-T08 | Fixture, limit, dedup, policy regression | `scripts/crawler-gate-smoke.ts` | In Review |

## 4. Quality evidence

| Komut | Amaç | Durum |
|---|---|---|
| `pnpm test:crawler-gate` | Deterministic crawler acceptance harness | PASS |
| `pnpm lint` | Static quality | PASS |
| `pnpm typecheck` | Strict TypeScript contract | PASS |
| `pnpm test --run` | Full regression suite | PASS — 60 test files / 259 tests |
| `pnpm build` | Production compilation | PASS |
| `pnpm test:integration` | DB/Redis integration smoke | Controlled SKIPPED — dependency unavailable |

`pnpm test:crawler-gate && pnpm lint && pnpm typecheck && pnpm test --run && pnpm build && pnpm test:integration` zinciri tamamlanmıştır. Integration smoke'un **SKIPPED** sonucu gerçek PostgreSQL/Redis integration PASS kanıtı değildir.

## 5. Açık koşullar

M8 `CONDITIONAL GO` yalnız aşağıdaki koşullar açıkça korunarak önerilir.

| Açık koşul | Neden M8 full close değildir |
|---|---|
| Actual HTTP/browser crawler fetch E2E | Hiçbir real target crawl edilmedi |
| DNS rebinding/remote host validation | Runtime network lifecycle integration yok |
| Remote robots/sitemap retrieval, cache, TTL | Parser yalnız caller-supplied snapshot işler |
| Redis/BullMQ enqueue/consume, retry/DLQ/lease | Queue contract ve real worker wiring yok |
| PostgreSQL durable frontier/dedupe/checkpoint | Registry ve counters process-local |
| Multi-worker concurrency/fencing/recovery | Distributed ownership/atomic commit test edilmedi |
| Frontier/policy/limit atomik orchestration | Module contracts side-effect-free |
| Real target drift/crawl quality/performance/load | Synthetic fixtures dışında baseline yok |
| Dataset/schema publish integration | Crawler output staging/publish akışı yok |
| Production observability, alerts, incident drill | Centralized operations integration yok |

## 6. Sign-off talebi

P08-T08 ve M8 gate kullanıcı tarafından onaylanmıştır. P08-T08 `Accepted — CONDITIONAL GO` olarak işaretlenmiş, M8 koşullu kapanmıştır. Sonraki bounded backend paketi **Phase 9 — Job Orchestration / P09-T01** olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
[3]: ./phase-8-crawler-engine-p08-t01-review.md "P08-T01 review"
[4]: ./phase-8-crawler-engine-p08-t02-review.md "P08-T02 review"
[5]: ./phase-8-crawler-engine-p08-t03-review.md "P08-T03 review"
[6]: ./phase-8-crawler-engine-p08-t04-review.md "P08-T04 review"
[7]: ./phase-8-crawler-engine-p08-t05-review.md "P08-T05 review"
[8]: ./phase-8-crawler-engine-p08-t06-review.md "P08-T06 review"
[9]: ./phase-8-crawler-engine-p08-t07-review.md "P08-T07 review"
