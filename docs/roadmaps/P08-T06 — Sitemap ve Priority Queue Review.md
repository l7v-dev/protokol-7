# P08-T06 — Sitemap ve Priority Queue Review

**Program:** Scraping Platform  
**Phase:** 8 — Crawler Engine  
**Task:** P08-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam:** Backend-only, side-effect-free sitemap candidate extraction ve priority ordering  
**Bağımlılık:** P08-T05 `Accepted`, kullanıcı onaylı

## 1. Teslim özeti

P08-T06, caller-provided XML sitemap snapshot'larından bounded candidate çıkarımı ve deterministic priority ordering contract'ı ekler. Parser yalnız `urlset` ile `sitemapindex` belgelerini işler; canonical safe URL, sitemap checksum, source kind, deterministic discovery order ve optional sitemap priority hint üretir. Priority ranker candidate'ları source class, sitemap priority hint, depth ve stable tie-breaker üzerinden sıralar. Hiçbir sitemap/URL fetch edilmez, queue dispatch yapılmaz ve persistent state yazılmaz.[1] [2]

| Teslim | Dosya | Sonuç |
|---|---|---|
| XML sitemap parser | `src/crawler/sitemap-priority.ts` | Bounded `urlset`/`sitemapindex` candidate extraction |
| Source/provenance | `src/crawler/sitemap-priority.ts` | `SITEMAP_URL`, checksum, discovery order, optional priority hint |
| Safety guard | `src/crawler/sitemap-priority.ts` | DTD/entity, unsafe URL ve sensitive query key reject/skip |
| Priority ranker | `src/crawler/sitemap-priority.ts` | Source + hint − depth + stable tie-break order |
| Unit acceptance | `test/crawler/sitemap-priority.test.ts` | URL set/index, bound, canonicalization, no-leakage, ranking |

## 2. Sitemap parsing contract

Parser maksimum 1 MB XML ve 5.000 entry kabul eder. `urlset` içindeki `<url><loc>` değerleri `SITEMAP_URL` candidate’ı olur. `sitemapindex` içindeki `<sitemap><loc>` değerleri child sitemap reference olarak döner; caller bu reference’ları ancak sonraki policy-gated execution katmanında ele alabilir. DTD/entity deklarasyonları peşinen reddedilir.

| Input türü | Output | Bound |
|---|---|---|
| `urlset` | Canonical URL candidate’ları | maxEntries kadar unique canonical URL |
| `sitemapindex` | Canonical child sitemap URL’leri | maxEntries kadar reference |
| Unsafe/malformed URL | Skip + safe count | URL/egress guard ile fetch öncesi |
| Sensitive query key | Skip + safe count | URL ve secret output’a yazılmaz |
| Ek entry | `truncated: true` | Bounded extraction evidence |

## 3. Deterministic priority order

Priority ranker hiçbir scheduler/queue state taşımadan deterministic `RankedCrawlCandidate[]` üretir. Source base priority: `SEED=100`, `SITEMAP_URL=80`, `LINK=60`; sitemap priority hint varsa `round(hint × 10)` eklenir ve depth başına `2` puan düşülür. Eşitlikte önce discovery order, sonra candidate identity sıralanır. Candidate identity tekrar edemez.

> **Priority order, policy override değildir.** P08-T04 block kararı ile P08-T05 limit kararı priority yüksek olsa dahi uygulanmalıdır. Bu paket priority’yi yalnız karar verilebilir bir input olarak üretir.

## 4. No-fetch ve no-leakage sınırı

Sitemap parser DNS/HTTP/browser request, robots request, queue publish, frontier write ya da storage write yapmaz. Output raw XML body, loc içinde bulunan sensitive query value veya other source content taşımaz. Checksum yalnız immutable source evidence içindir.

## 5. Acceptance kanıtı

Dar kapsam suite üç behavior grubunu doğrular: urlset candidate'larının canonical safe extraction'ı ve sensitive target skip'i; sitemap-index reference’larının truncation ile bounded olması; source/hint/depth/tie-break ranking ve unsafe DTD/invalid candidate reject. Dar kapsam sonucu `1 test file / 3 tests passed` olmuştur.

Nihai kalite kapısı olarak `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` çalıştırılmış; **59 test dosyası / 256 test başarılı** bulunmuştur. Lint, strict typecheck ve production build başarılıdır.

## 6. Açık koşullar

| Açık koşul | Neden bu paket dışında |
|---|---|
| Network üzerinden sitemap/robots fetch | Policy-gated execution ve HTTP lifecycle sorumluluğu |
| Sitemap cache/TTL/provenance persistence | DB/storage integration sorumluluğu |
| Priority'nin gerçek queue dispatch’e uygulanması | Redis/BullMQ/worker integration sorumluluğu |
| Priority ile frontier/limit atomik admission | Durable queue/state transaction sorumluluğu |
| Checkpoint/pause/resume/recovery | P08-T07 sorumluluğu |
| Full crawler E2E / real target validation | P08-T08 gate sorumluluğu |

## 7. Review kararı talebi

P08-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P08-T07 — Crawl Checkpoint, Pause/Resume & Recovery olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "P08 Crawler Engine task register"
[2]: ./phase-8-crawler-engine-p08-t03-review.md "P08-T03 canonical identity"
[3]: ./phase-8-crawler-engine-p08-t04-review.md "P08-T04 policy boundary"
[4]: ./phase-8-crawler-engine-p08-t05-review.md "P08-T05 limit policy"
[5]: ./phase-8-crawler-engine-task-board.md "Phase 8 task board"
