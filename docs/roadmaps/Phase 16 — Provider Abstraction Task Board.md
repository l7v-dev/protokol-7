# Phase 16 — Provider Abstraction Task Board

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Kapsam:** Backend-only provider contract, adapter certification, comparison, controlled failover ve onboarding reference contracts  
**Güncel durum:** P16-T01–P16-T08 Accepted; M16 `Accepted — CONDITIONAL NO-GO` olarak kapatıldı

> **Çalışma ilkesi:** Her bounded paket source, test, Türkçe review belgesi ve nihai kalite kapısından sonra explicit kullanıcı `onaylandı` kararıyla kapanır. Provider credential/token, endpoint/account detail veya raw provider response log/trace/artifact içine taşınmaz.

> **Güvenlik notu:** Bu phase hiçbir real provider çağrısı, credential discovery, quota bypass, automatic provider failover, target bypass, anti-bot/CAPTCHA/WAF bypass veya external dispatch başlatmaz. Provider-specific adapter sertifikasyonu yalnız ayrıca scoped mock/reference contract kapsamında ilerler.

| ID | Workstream | Görev | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P16-T01 | Provider | Provider contract conformance test suite oluştur | SRE/Platform Lead | 5 | P15-T08 | Accepted | `docs/phase-16-provider-abstraction-p16-t01-review.md`, `src/proxy/provider-conformance.ts`, `test/proxy/provider-conformance.test.ts` |
| P16-T02 | Provider | Bright Data adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T01 | Accepted | `docs/phase-16-provider-abstraction-p16-t02-review.md`, `src/proxy/bright-data-reference-certification.ts`, `test/proxy/bright-data-reference-certification.test.ts` |
| P16-T03 | Provider | Oxylabs adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T02 | Accepted | `docs/phase-16-provider-abstraction-p16-t03-review.md`, `src/proxy/oxylabs-reference-certification.ts`, `test/proxy/oxylabs-reference-certification.test.ts` |
| P16-T04 | Provider | Zyte adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T03 | Accepted | `docs/phase-16-provider-abstraction-p16-t04-review.md`, `src/proxy/zyte-reference-certification.ts`, `test/proxy/zyte-reference-certification.test.ts` |
| P16-T05 | Provider | Internal provider adapter ve local test doubles geliştir | Backend Lead | 5 | P16-T04 | Accepted | `docs/phase-16-provider-abstraction-p16-t05-review.md`, `src/proxy/internal-provider-adapter.ts`, `test/proxy/internal-provider-adapter.test.ts` |
| P16-T06 | Strategy | Provider scoring, health comparison ve failover kararını uygula | SRE/Platform Lead | 6 | P16-T05 | Accepted | `docs/phase-16-provider-abstraction-p16-t06-review.md`, `src/proxy/provider-decision-reference.ts`, `test/proxy/provider-decision-reference.test.ts` |
| P16-T07 | Operations | Provider onboarding, quota, credential rotation ve support runbook oluştur | FinOps/Operations | 5 | P16-T06 | Accepted | `docs/phase-16-provider-abstraction-p16-t07-review.md`, `src/proxy/provider-operations-reference.ts`, `test/proxy/provider-operations-reference.test.ts` |
| P16-T08 | Quality | Provider portfolio certification ve release gate'ini tamamla | QA Lead | 8 | P16-T07 | Accepted | `docs/phase-16-provider-abstraction-p16-t08-review.md`, `docs/phase-16-provider-abstraction-m16-gate.md`, `src/proxy/provider-portfolio-gate.ts`, `test/proxy/provider-portfolio-gate.test.ts`, `scripts/provider-portfolio-gate-smoke.ts` |

## Kapsam dışı

Phase 12 Control Center ve dashboard/frontend çalışma yüzeyleri kullanıcı talimatıyla Scope Excluded'dır. Abandoned `/home/ubuntu/scraping-platform-operations-site` statik projesi değiştirilmez, deploy edilmez veya sunulmaz. Real provider API/onboarding/credential provisioning ve production failover da P16-T01 kapsamı dışındadır.
