# P08-T04 — Robots/Policy, Allowlist/Denylist ve Domain Restriction Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, side-effect-free candidate policy decision  
**Bağımlılık:** P08-T03 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T04, crawl candidate için bounded robots snapshot parser'ı ve fail-closed policy evaluator ekler. Evaluator, URL’yi outbound egress guard ile güvenli HTTP(S) hedef olarak kontrol eder; ardından allowlist/denylist host ve path kurallarını, `nofollow` hint’ini ve robots allow/disallow kurallarını deterministic sırada değerlendirir. Sonuç yalnız allow/block reason, policy fingerprint ve kesin `retryable: false`, `allowBypass: false` alanlarını taşır. URL fetch, robots request, queue/frontier write veya policy mutation yapılmaz.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Robots snapshot parser | `src/crawler/crawl-policy.ts` | Bounded text, user-agent group, allow/disallow path ve fingerprint |
| Candidate policy contract | `src/crawler/crawl-policy.ts` | Host/path allow/deny, subdomain, nofollow, robots options |
| Fail-closed evaluator | `src/crawler/crawl-policy.ts` | Terminal allow/block decision, no automatic retry/bypass |
| Unit acceptance | `test/crawler/crawl-policy.test.ts` | Robots precedence, egress/host/path/nofollow blocks, invalid policy rejects |

## 2. Decision order ve policy contract

Policy evaluation sırası güvenlik lehine sabittir: unsafe target, deny host, missing allowed host, deny path, missing allowed path, nofollow ve robots disallow. Bir candidate block edildiğinde alternatif proxy/browser rotation, bypass retry veya policy değişikliği önerilmez.

| Karar | Reason | Retry/bypass |
|---|---|---|
| Unsafe/private/credential URL | `UNSAFE_TARGET` | `false / false` |
| Denied host | `DENYLIST_HOST` | `false / false` |
| Allowlist dışı host | `HOST_NOT_ALLOWLISTED` | `false / false` |
| Denied/missing allowed path | `DENYLIST_PATH` / `PATH_NOT_ALLOWLISTED` | `false / false` |
| Nofollow | `NOFOLLOW` | `false / false` |
| Robots disallow | `ROBOTS_DISALLOWED` | `false / false` |
| All gates pass | `ALLOWED` | `false / false` |

Allowlist en az bir hostname içerir; host/path rule listeleri bounded’dır. Subdomain eşleşmesi varsayılan olarak kapalıdır ve yalnız explicit `allowSubdomains: true` olduğunda etkinleşir. Deny host ve deny path, uygun allow rule bulunsa da önce değerlendirilir.

## 3. Robots snapshot sınırı

`parseRobotsRules` caller tarafından sağlanan, en fazla 64 KB robots text snapshot’ını işler; kendi başına `/robots.txt` isteği yapmaz. Requested user agent ile `*` grupları birleştirilir. Path eşleşmesinde en uzun prefix kazanır; allow ve disallow uzunluğu eşitse allow tercih edilir. Boş disallow directive kural üretmez.

> **Robots operasyon sınırı:** Bu paket network üzerinden robots indirme, cache TTL, conditional request, sitemap discovery veya robots provenance persistence içermez. Bunlar explicit future integration/persistence kararları olmadan uygulanmayacaktır.

## 4. No-leakage ve evidence

Decision output URL, robots body, host/path rule, raw candidate metadata veya header taşımaz. Sadece stable reason code ve policy fingerprint bulunur. Policy fingerprint deterministic input contract evidence’idir; authorize/publish artifact’i değildir.

## 5. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: robots longest-prefix ve allow-tie precedence; private target, host/path allow/deny ve nofollow için terminal no-bypass block; boş/unsafe policy kuralı ve bounded robots path reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **57 test dosyası / 250 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 6. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Robots network fetch/cache/TTL | Network/persistence integration scope’u gerekir |
| Robots source provenance persistence | Storage/DB lifecycle sorumluluğu |
| Sitemap discovery | P08-T06 sorumluluğu |
| Configured depth/page/pagination | P08-T05 sorumluluğu |
| Candidate → frontier enqueue execution | Crawler queue/orchestration integration sorumluluğu |
| Domain policy CRUD/API | Ayrı API/persistence contract’ı gerekir |
| Durable policy audit | Database/outbox/observability sorumluluğu |

## 7. Review kararı talebi

P08-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T05 — Depth, Page Limit & Pagination Rules olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ../src/security/egress-policy.ts "Outbound egress safety guard"
[3]: ../src/security/compliance-policy.ts "No-bypass compliance decision boundary"
[4]: ./phase-8-crawler-engine-p08-t03-review.md "P08-T03 canonical identity"
[5]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
