# P08-T07 — Crawl Checkpoint, Pause/Resume ve Recovery Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, process-local checkpoint/reference contract  
**Bağımlılık:** P08-T06 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T07, tenant/job scoped crawler checkpoint registry ekler. Registry immutable snapshot döndürür, revision artırır ve entry'leri `PENDING → CLAIMED → COMMITTED` lifecycle'ında yönetir. Active crawl pause edilebilir; resume sırasında uncommitted `CLAIMED` entry'ler `PENDING` hale getirilir, committed entry'ler korunur. Böylece caller aynı entry'yi yeniden duplicate olarak üretmeden local recovery planı oluşturabilir.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Checkpoint scope/state | `src/crawler/checkpoint.ts` | Tenant/job, status, revision, entry snapshot |
| Pause/resume contract | `src/crawler/checkpoint.ts` | `ACTIVE ↔ PAUSED`; claimed entry reset, committed entry korunur |
| Claim/commit guard | `src/crawler/checkpoint.ts` | Claim owner enforcement ve all-committed completion |
| Local recovery behavior | `src/crawler/checkpoint.ts` | Resume sonrası uncommitted work yeniden pending olur |
| Unit acceptance | `test/crawler/checkpoint.test.ts` | Pause/resume, owner/complete, malformed/cross-tenant/conflict |

## 2. Lifecycle contract

Initialize yalnız unique, safe frontier entry identity listesi ile gerçekleşir ve aynı scope için aynı listede idempotenttir. `claim` yalnız active checkpoint'ten pending entry verir. `commit` yalnız claim owner tarafından ve active state'te yapılır. Tüm entry'ler committed olduğunda checkpoint `COMPLETED` olur ve yeni claim vermez.

| State / operation | İzinli davranış | Red/koruma |
|---|---|---|
| `ACTIVE → pause` | Checkpoint `PAUSED` olur | Terminal/paused checkpoint tekrar pause edilemez |
| `PAUSED → resume` | Claimed entry pending'e döner | Active/terminal checkpoint resume edilemez |
| `PENDING → claim` | Worker owner kaydıyla claimed | Paused/terminal state'te claim yok |
| `CLAIMED → commit` | Sadece same worker commit eder | Different worker / missing entry reject |
| All committed | `COMPLETED` | Duplicate new claim yok |

> **Recovery sınırı:** Resume, process memory'deki checkpoint state üzerinde gerçekleşir. Uygulama restart’ı, multi-worker yarışları veya ack kaybı karşısında durable recovery garantisi vermez; bu konular ayrı persistence/queue/lease çalışması gerektirir.

## 3. Integrity ve no-duplicate davranışı

Checkpoint entry identity'leri initialize sırasında unique olmalıdır. Committed entry resume tarafından pending'e alınmaz; yalnız claimed entry geri alınır. Claim owner kontrolü aynı entry için eşzamanlı duplicate commit riskini local contract seviyesinde reddeder. Snapshot clone olarak döndüğü için caller'ın değiştirmesi registry içi state'i mutate etmez.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: pause/resume sonrası claimed work'ün pending'e dönmesi ve committed entry'nin korunması; owner enforcement ile all-entry completion; duplicate/malformed initialization, cross-tenant read ve invalid resume reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **60 test dosyası / 259 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Durable PostgreSQL checkpoint / atomic revision | Persistence and concurrency integration sorumluluğu |
| Redis/BullMQ lease, heartbeat, ack ve retry | Queue/worker lifecycle sorumluluğu |
| Multi-worker distributed ownership | Lease/fencing contract’ı gerekir |
| Process restart sonrası actual recovery | Durable storage/queue replay gerekir |
| Cancelled terminal transition / audit event | Phase 9 orchestration lifecycle genişletmesi |
| Full crawler E2E / real target recovery drill | P08-T08 gate sorumluluğu |

## 6. Review kararı talebi

P08-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T08 — Crawler E2E, Limit, Dedup & Policy Gate olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-p08-t01-review.md "P08-T01 frontier contract"
[3]: ../src/orchestrator/lifecycle.ts "Existing job/task lifecycle guard"
[4]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
