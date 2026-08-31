# Phase 8 — Crawler Engine Task Board

**Program:** Scraping Platform  
**Milestone:** M8 — Crawler Engine Accepted  
**Kapsam:** Backend-only  
**Ön koşul:** M7 Schema Quality Gate — `CONDITIONAL GO`, kullanıcı onaylı

## Durum özeti

**Güncel durum:** M8 kullanıcı onaylı `CONDITIONAL GO`; Phase 9 Job Orchestration hazırlığı

| ID | Workstream | Teslim | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P08-T01 | Crawler | URL frontier, crawl state ve queue partition modelini oluştur | Backend Lead | 7 | P07-T08 | Accepted | `docs/phase-8-crawler-engine-p08-t01-review.md`, `src/crawler/frontier.ts`, `test/crawler/frontier.test.ts` |
| P08-T02 | Crawler | Link discovery ve URL extraction pipeline’ını geliştir | Data/Extraction Lead | 6 | P08-T01 | Accepted | `docs/phase-8-crawler-engine-p08-t02-review.md`, `src/crawler/link-discovery.ts`, `test/crawler/link-discovery.test.ts` |
| P08-T03 | Crawler | Canonicalization ve deduplication motorunu geliştir | Backend Lead | 6 | P08-T02 | Accepted | `docs/phase-8-crawler-engine-p08-t03-review.md`, `src/crawler/url-identity.ts`, `test/crawler/url-identity.test.ts` |
| P08-T04 | Compliance | robots/policy, allowlist/denylist ve domain restriction kontrollerini uygula | Security Lead | 6 | P08-T03 | Accepted | `docs/phase-8-crawler-engine-p08-t04-review.md`, `src/crawler/crawl-policy.ts`, `test/crawler/crawl-policy.test.ts` |
| P08-T05 | Crawler | Depth, page limit ve pagination kurallarını uygula | Backend Lead | 5 | P08-T04 | Accepted | `docs/phase-8-crawler-engine-p08-t05-review.md`, `src/crawler/crawl-limits.ts`, `test/crawler/crawl-limits.test.ts` |
| P08-T06 | Crawler | Sitemap ve priority queue desteğini geliştir | Backend Lead | 6 | P08-T05 | Accepted | `docs/phase-8-crawler-engine-p08-t06-review.md`, `src/crawler/sitemap-priority.ts`, `test/crawler/sitemap-priority.test.ts` |
| P08-T07 | Reliability | Crawl checkpoint, pause/resume ve recovery akışını tamamla | SRE/Platform Lead | 6 | P08-T06 | Accepted | `docs/phase-8-crawler-engine-p08-t07-review.md`, `src/crawler/checkpoint.ts`, `test/crawler/checkpoint.test.ts` |
| P08-T08 | Quality/Gate | Crawler E2E, limit, dedup ve policy testlerini tamamla | QA Lead | 8 | P08-T07 | Accepted — CONDITIONAL GO | `docs/phase-8-crawler-engine-m8-gate.md`, `scripts/crawler-gate-smoke.ts`, `package.json` |

> **Scope koruması:** P08-T01 bir frontier model contract'ıdır. Link discovery, canonical URL identity, robots/domain policy, crawl limits, priority, durable checkpoint/recovery, actual queue dispatch ve HTTP/browser fetch bu pakette uygulanmaz.
