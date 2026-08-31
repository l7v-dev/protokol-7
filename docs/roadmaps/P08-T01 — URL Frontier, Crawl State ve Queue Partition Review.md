# P08-T01 — URL Frontier, Crawl State ve Queue Partition Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local reference contract  
**Bağımlılık:** M7 Schema Quality Gate — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Teslim özeti

P08-T01, tenant/project/job scoped crawl state ve URL frontier modelini ekler. Registry idempotent crawl creation, bounded partition count, deterministic `crawl:{tenant}:{job}:p{partition}` queue key, exact URL duplicate idempotency, parent frontier lineage, claim/complete worker ownership transition ve immutable terminal status surface'i sağlar. Hiçbir URL fetch edilmez, queue'ya mesaj gönderilmez, state database'e yazılmaz.[1]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Crawl state model | `src/crawler/frontier.ts` | `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED` state type contract |
| Frontier entry model | `src/crawler/frontier.ts` | URL, depth, parent, partition, queue key, entry status contract |
| Queue partition | `src/crawler/frontier.ts` | Tenant/job/URL hash ile deterministic partition (1–128) |
| Claim lifecycle | `src/crawler/frontier.ts` | `QUEUED → CLAIMED → SUCCEEDED/FAILED`, worker ownership guard |
| Egress pre-guard | `src/crawler/frontier.ts` | HTTP(S), credential-free ve private/loopback/link-local target reject |
| Unit acceptance | `test/crawler/frontier.test.ts` | Idempotency, partition, lineage, worker ownership, unsafe/scope rejects |

## 2. Frontier contract

Registry key'i `tenantId + jobId`'dir; aynı job farklı tenant context’inde okunamaz. Aynı scope'ta aynı **exact validated URL** ikinci kez enqueue edildiğinde yeni entry üretilmez, ilk entry clone'ı döner. Bu yalnız pre-canonical idempotency'dir: query order, fragment, case ve diğer eşdeğerlik kuralları P08-T03 Canonicalization & Deduplication görevinin sorumluluğundadır.[2]

| Contract alanı | Sınır | Amaç |
|---|---|---|
| Partition count | 1–128 | Deterministic queue sharding modelini sınırlar |
| Frontier entry technical capacity | En fazla 10.000 entry | Policy bağımsız memory safety bound |
| Depth technical bound | 0–64 | P08-T05 policy limitlerinden önce runtime safety bound |
| URL length | En fazla 4.096 | Bounded input surface |
| URL egress | HTTP(S), no credentials, no private/local/link-local | Fetch öncesi fail-closed koruma |
| Parent | Aynı crawl scope'taki entry | Cross-job lineage engeli |

## 3. Lifecycle ve queue sınırı

`claimNext` yalnız `ACTIVE` crawl state içinde `QUEUED` entry'yi `CLAIMED` hale getirir. `complete` yalnız mevcut owner worker tarafından çağrıldığında terminal `SUCCEEDED` veya `FAILED` state’ine geçer. Registry instance-local'dır; crash/restart sonrası claim recovery veya distributed ownership garantisi vermez.

> **Queue partition, queue dispatch değildir.** Bu task yalnız partition key ve state contract'ını üretir. BullMQ/Redis producer/consumer, retry/DLQ, lease timeout ve worker execution entegrasyonu sonraki crawler/orchestration task'larında ayrı ele alınacaktır.

## 4. Acceptance kanıtı

Dar kapsam suite'i üç behavior grubunu doğrular: deterministic queue partition ve exact URL idempotency; parent lineage ile worker-owned claim/complete transition; credential/private target, parent, identifier ve cross-tenant read reject path’leri. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **54 test dosyası / 241 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Link discovery / source extraction | P08-T02 sorumluluğu |
| Canonicalization ve semantic dedupe | P08-T03 sorumluluğu |
| robots.txt, allow/denylist, domain restriction | P08-T04 sorumluluğu |
| Configured depth/page/pagination policy | P08-T05 sorumluluğu |
| Sitemap, priority queue | P08-T06 sorumluluğu |
| Durable checkpoint/pause/recovery | P08-T07 sorumluluğu |
| Redis/BullMQ dispatch ve worker integration | Crawler/Phase 9 entegrasyon sorumluluğu |
| Postgres persistence ve concurrency | Devralınan platform açık koşulu |
| Actual HTTP/browser crawl fetch | P08-T02 sonrası policy-gated execution kapsamı |

## 6. Review kararı talebi

P08-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T02 — Link Discovery & URL Extraction Pipeline olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
[3]: ../src/security/egress-policy.ts "Outbound target safety guard"
[4]: ./phase-7-schema-engine-m7-gate.md "M7 Schema Quality Gate"
