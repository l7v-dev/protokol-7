# P04-B07 — Proxy Request/GB/Lease Cost Metering Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B07  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B06 — kullanıcı onaylı

## 1. Teslim özeti

Proxy cost metering katmanı, proxy kullanımını **request**, **GB** ve **lease hour** kategorilerinde immutable usage event olarak modeller. Her event provider, proxy, tenant, project, job, task ve attempt attribution alanlarını; event'in oluştuğu anda kullanılan tariff snapshot'ını; source ve idempotency key'i taşır.

Request, byte ve lease ölçümleri ayrı helper metotlarla üretilir. Attempt/job bağını güçlendirmek için `ProxyMeteringContext` ve `recordAttemptRequest`, `recordAttemptBytes`, `recordAttemptLease` metotları eklenmiştir. Maliyet rate alanları P04-B06 ile uyumlu olarak cents tabanındadır: request başına, GB başına ve lease hour başına.

> **Temel kural:** Cost event yalnızca gerçekleşen veya ölçülen kullanım sinyalini temsil eder; selection aşamasındaki tahmini maliyet gerçek kullanım event'i yerine geçmez.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/cost.ts` | Tariff snapshot, usage event üretimi, idempotency, attempt/job summary ve metadata guardrail'i |
| `test/proxy/cost.test.ts` | Kategori hesaplama, attribution, tenant izolasyonu, idempotency, clone safety ve invalid input testleri |
| `docs/phase-4-proxy-intelligence-task-board.md` | P04-B07 review durumu ve kanıt kaydı |

## 3. Event sözleşmesi

| Alan | Kural |
|---|---|
| `category` | `PROXY_REQUEST`, `PROXY_BYTES` veya `PROXY_LEASE` |
| `quantity/unit` | Request count/`request`, bytes / 2^30/`GB`, lease seconds / 3.600/`hour` |
| `unitCostCents` | Event oluşurken tariff'ten alınan immutable rate |
| `estimatedCostCents` | `quantity * unitCostCents`, bounded decimal rounding |
| `tariff` | `tariffId`, currency ve üç kategori rate snapshot'ı |
| attribution | Tenant zorunlu; attempt helper'larında project/job/task/attempt zorunlu |
| `source` | Ölçüm kaynağı için güvenli provider/adapter adı |
| `idempotencyKey` | Aynı tenant + key + category için at-least-once duplicate suppression |
| metadata | Yalnız güvenli operasyonel metadata; secret isimleri reddedilir |

`PROXY_BYTES` quantity değeri binary GB (`1024 ** 3`) olarak normalize edilir. `ProxyCostSummary`, tenant scope içinde job ve attempt filtreleriyle toplam maliyet ve kategori kırılımı üretir.

## 4. Tariff snapshot ve maliyet bütünlüğü

Rate event input'unda snapshot olarak taşınır; daha sonra provider rate değişse bile daha önce üretilmiş event'in cost değeri değişmez. Event'in `unitCostCents` ve `estimatedCostCents` alanları ile usage event kaydına aktarılabilecek `unit_cost` ve `estimated_cost` karşılıkları ayrıştırılmıştır. Currency ve `tariffId` event üzerinde korunur.

Idempotency key, `tenantId:idempotencyKey:category` bileşimiyle process-local deduplication sağlar. Aynı event yeniden işlendiğinde ilk immutable event clone edilerek döndürülür; yeni quantity ile overwrite yapılmaz. Veritabanı tarafındaki hedef uniqueness, mevcut migration'daki `(tenant_id, idempotency_key, category)` unique constraint'iyle uyumludur.

## 5. Attempt/job attribution ve tenant isolation

`ProxyMeteringContext`, `jobId`, `taskId` ve `attemptId` alanlarını typed API seviyesinde zorunlu kılar. Bu sayede worker/adapter kullanımında request, bytes ve lease event'lerinin belirli attempt'e bağlanması mümkün olur. Summary önce `tenantId` eşleşmesini, ardından istenen job/attempt filtrelerini uygular; farklı tenant event'i aynı summary'ye dahil edilmez.

Selection'daki tahmini cost sinyali ile gerçekleşen usage event ayrımı korunur. Selection, lease veya provider adapter event üretirken aynı tariff snapshot'ı ve ilgili `meterReference`/idempotency convention'ı kullanmalıdır. Bu bağ P04-B08 conformance ve failure injection aşamasında doğrulanacaktır.

## 6. Security ve failure davranışı

Raw provider credential, authorization header, cookie, session veya token alanlarının event metadata'sına sızmasını azaltmak için secret isimleri validation aşamasında reddedilir. Event ID, idempotency bileşiminden SHA-256 ile deterministic üretilir; raw secret veya endpoint değeri event ID'ye eklenmez.

Geçersiz quantity, negatif tariff, category/unit uyuşmazlığı veya secret metadata terminal `PROXY_USAGE_INVALID` hatasıdır ve retryable değildir. Cost kaydının başarısız olması provider policy, private target veya anti-bot bypass için otomatik failover sebebi değildir.

## 7. Test kanıtı

P04-B07 için **5 cost meter testi** bulunmaktadır. Testler request/GB/lease hesabını, attempt/job summary'sini, tenant izolasyonunu, aynı event'in idempotent duplicate davranışını, metadata clone safety/deterministic ID üretimini, invalid input ve secret metadata reddini doğrular.

Tam backend regression çalışmasında **34 test dosyası / 155 test** başarılıdır. `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` başarılıdır. Gerçek Chromium/Playwright fixture testi de bu tam koşuda başarılıdır.

## 8. Açık sınırlar ve sonraki adımlar

| Konu | Mevcut durum | Açık iş |
|---|---|---|
| Persistence | Process-local `Map` reference implementation | Postgres repository adapter ve transactional insert |
| DB usage write | Mevcut `usage_events` schema ile uyumlu mapping tasarlandı, canlı write çalıştırılmadı | P04-B08/integration provisioning |
| Tariff source | Caller tarafından verilen rate snapshot | Provider tariff registry/versioning |
| Job cost rollup | In-memory summary | Job `cost_summary_json` transactional rollup |
| Distributed idempotency | Process-local duplicate suppression | Postgres unique constraint + retry-safe repository |
| Provider integration | Gerçek vendor yok | P04-B08 fake provider conformance ve failure injection |
| M4 readiness | Henüz gate kararı yok | P04-B08 operations ve acceptance |

## 9. Review kararı talebi

P04-B07 proxy request/GB/lease cost metering paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P04-B06 Accepted olarak board'a işlenecek ve P04-B08 provider conformance, failure injection, operations runbook ve M4 gate paketi hazırlanacaktır.

Gerçek PostgreSQL/Redis servisleri sandbox'ta bulunmadığından distributed persistence, transactional rollup ve canlı usage event E2E doğrulanmamıştır. Gerçek provider credential, vendor endpoint veya production readiness iddiası bu review kapsamına dahil değildir.

## References

[1]: ./phase-4-proxy-intelligence-p04-b06-review.md "P04-B06 deterministic proxy selection"
[2]: ./phase-4-proxy-intelligence-p04-b05-review.md "P04-B05 provider/proxy health score"
[3]: ./phase-4-proxy-intelligence-p04-b04-review.md "P04-B04 proxy lease lifecycle"
[4]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[5]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[6]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[7]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
