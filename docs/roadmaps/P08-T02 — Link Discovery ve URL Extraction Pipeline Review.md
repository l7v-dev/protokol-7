# P08-T02 — Link Discovery ve URL Extraction Pipeline Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, clean HTML tabanlı deterministic candidate discovery  
**Bağımlılık:** P08-T01 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T02, P06 HTML cleaner tarafından hazırlanmış transient `cleanHtml` üzerinden `<a href>` adaylarını keşfeder. Her kabul edilen aday; resolved URL, `HTML_ANCHOR` source kind, cleaned source checksum, parent task/attempt identity, deterministic discovery order ve `nofollow` metadata'sı ile ilişkilendirilir. Pipeline URL fetch etmez, frontier enqueue etmez, database/queue/storage write yapmaz.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| Link discovery contract | `src/crawler/link-discovery.ts` | Source-aware discovered link ve safe summary types |
| Candidate extraction | `src/crawler/link-discovery.ts` | Clean HTML `<a href>` scan + base URL resolution |
| Egress/sensitive guard | `src/crawler/link-discovery.ts` | Private target, unsupported scheme ve sensitive query key reject |
| Bounded output | `src/crawler/link-discovery.ts` | max 1–1.000 candidate, clean input max 750 KB |
| Deterministic evidence | `src/crawler/link-discovery.ts` | Safe result fingerprint; raw DOM/anchor text yok |
| Unit acceptance | `test/crawler/link-discovery.test.ts` | Source lineage, nofollow, bound, safe skip/reject cases |

## 2. Discovery ve source lineage contract

Input, tenant/job/task/attempt scope ile P06 `CleanHtmlDocument`’ın yalnız `cleanHtml` ve `cleanedChecksumSha256` alanlarını kabul eder. Output parent `taskId` ve `attemptId` ile source checksum’u tekrar taşır. Böylece P08-T03 canonical/deduplication ve sonraki frontier enqueue işlemi, adayın hangi clean source ve parent execution’dan geldiğini raw HTML veya artifact key taşımadan izleyebilir.

| Output alanı | Amaç | Secret/raw veri içerir mi? |
|---|---|---|
| `resolvedUrl` | Bir sonraki policy/dedup aşaması için candidate URL | Hayır; sensitive query key içeren URL reddedilir |
| `sourceChecksumSha256` | Clean source integrity evidence | Hayır |
| `parentTaskId`, `parentAttemptId` | Parent execution lineage | Hayır |
| `discoveryOrder`, `noFollow` | Deterministic order ve link hint | Hayır |
| `summary` | Scan/discover/skip count ve truncation | Hayır |

## 3. Safety ve limit davranışı

Pipeline özellikle clean HTML üzerinde çalışır. HTML cleaner, script elementlerini, JavaScript href değerlerini ve sensitive attribute/value taşıyan elementleri discovery öncesinde kaldırır. Discovery katmanı da defense-in-depth olarak `javascript:`, `data:`, `mailto:`, `tel:` ve fragment adaylarını skip eder; sensitive query key, malformed URL veya outbound egress policy ile unsafe bulunan resolved URL’leri kabul etmez.

> **No-fetch sınırı:** `discoverLinks` yalnız DOM parse ve string URL resolve işlemi yapar. DNS, HTTP/browser request, robots request, queue publish, frontier write veya artifact write çağrısı içermez.

`maxLinks` limiti kabul edilen candidate sayısına uygulanır; limit sonrası ekstra anchor görülürse `truncated: true` döner. Bu teknik bound, P08-T05 configured depth/page limit policy’sinin yerine geçmez.

## 4. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: clean HTML anchor’larının parent lineage/nofollow metadata ile bulunması ve sensitive/raw DOM leak olmaması; deterministic `maxLinks` truncation; unsafe base URL, invalid checksum ve invalid limit reject path’leri. Fixture’da cleaner’ın JavaScript ve secret-bearing href’leri discovery öncesinde kaldırdığı ayrıca gözlemlenmiştir. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **55 test dosyası / 244 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır. İlk full regression run’da P08-T02 ile ilgisiz circuit-breaker retry-after testinin gerçek zaman farkından kaynaklanan 1 ms flake'i gözlenmiş; test sabit saat kaynağı kullanacak şekilde deterministik hale getirilmiş ve final run tamamen geçmiştir.

## 5. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Canonical URL identity ve semantic dedupe | P08-T03 sorumluluğu |
| robots.txt / allowlist / denylist / domain restriction | P08-T04 sorumluluğu |
| Configured depth, page limit, pagination | P08-T05 sorumluluğu |
| Discovered link’in frontier enqueue edilmesi | P08-T03 sonrası policy-gated integration |
| HTTP/browser fetch | Crawler execution/orchestration sorumluluğu |
| Redis/BullMQ producer/consumer | Devralınan queue integration koşulu |
| Durable provenance/checkpoint | P08-T07 / persistence sorumluluğu |

## 6. Review kararı talebi

P08-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T03 — Canonicalization & Deduplication Engine olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ../src/extraction/html-cleaner.ts "P06 clean HTML ve artifact lineage contract"
[3]: ../src/security/egress-policy.ts "Outbound egress guard"
[4]: ./phase-8-crawler-engine-p08-t01-review.md "P08-T01 frontier contract"
[5]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
