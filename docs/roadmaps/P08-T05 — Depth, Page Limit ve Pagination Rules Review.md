# P08-T05 — Depth, Page Limit ve Pagination Rules Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, side-effect-free frontier admission policy  
**Bağımlılık:** P08-T04 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T05, caller-owned crawl limit snapshot'ı üzerinde deterministic bir admission karar contract'ı ekler. Candidate, configured depth, toplam admitted page count, candidate identity ve pagination chain/step sınırlarına göre kabul veya terminal red alır. Karar yeni bir snapshot döndürür; frontier registry, queue, database veya network state mutate edilmez.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Limit policy | `src/crawler/crawl-limits.ts` | `maxDepth`, `maxPages`, `maxPaginationSteps` bounded contract |
| Caller-owned state | `src/crawler/crawl-limits.ts` | Admitted count/identity ve pagination chain progress snapshot |
| Admission decision | `src/crawler/crawl-limits.ts` | Allow veya deterministic terminal reason + immutable next state |
| Unit acceptance | `test/crawler/crawl-limits.test.ts` | Happy path, all boundary rejects, malformed input rejects |

## 2. Admission ve state contract

Bir candidate kabul edilmeden önce duplicate identity, depth ve page limit kontrol edilir. Pagination candidate'i varsa chain için daha önce kaydedilmiş step'ten kesin olarak büyük olmalı; ayrıca configured maximum step'i aşmamalıdır. Kabul edilen aday, count'ı bir artırır ve candidate identity'yi ekler; pagination bilgisi varsa chain step'i günceller.

| Decision | Koşul | Next state |
|---|---|---|
| `ALLOWED` | Tüm limitler içinde | Count +1, candidate eklenir, varsa pagination step güncellenir |
| `DUPLICATE_CANDIDATE` | Candidate identity daha önce admitted | Değişmez |
| `DEPTH_LIMIT_REACHED` | `depth > maxDepth` | Değişmez |
| `PAGE_LIMIT_REACHED` | `admittedPageCount >= maxPages` | Değişmez |
| `PAGINATION_LIMIT_REACHED` | Non-monotonic veya max step aşımı | Değişmez |

> **Fail-closed sınır:** Limit dışındaki candidate için retry, bypass, otomatik limit genişletme veya enqueue talimatı üretilmez. Caller, returned decision'ı sonraki policy/queue orchestration katmanında uygulamak zorundadır.

## 3. Input güvenliği ve teknik bound

Policy maksimum depth `0–64`, page `1–100.000` ve pagination step `0–10.000` aralığını kabul eder. State'teki admitted count ve identity sayısı eşleşmeli, identity'ler benzersiz olmalı ve chain state güvenli identifier/pozitif integer olmak zorundadır. Bu bound'lar memory safety içindir; tenant planı, billing quota veya target-specific crawl policy'nin yerine geçmez.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: immutable caller state ile bounded admission; duplicate/depth/page/non-monotonic pagination terminal red path'leri; malformed policy, candidate ve state reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **58 test dosyası / 253 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Limit kararının gerçek frontier enqueue akışına uygulanması | Crawler queue/orchestration integration sorumluluğu |
| Tenant plan/quota/budget limitleri | Billing/FinOps policy sorumluluğu |
| Target-specific dynamic pagination extraction | P08-T02/P08-T06 genişletme sorumluluğu |
| Durable atomic counter/dedup state | Postgres/Redis persistence ve concurrency koşulu |
| Priority queue | P08-T06 sorumluluğu |
| Checkpoint/pause/resume/recovery | P08-T07 sorumluluğu |

## 6. Review kararı talebi

P08-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T06 — Sitemap & Priority Queue olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-p08-t01-review.md "P08-T01 frontier contract"
[3]: ./phase-8-crawler-engine-p08-t04-review.md "P08-T04 policy boundary"
[4]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
