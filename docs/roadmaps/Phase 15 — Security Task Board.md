# Phase 15 — Security Task Board

**Program:** Scraping Platform  
**Phase:** 15 — Security  
**Milestone:** M15 — Security Go-live Approval  
**Güncel durum:** M15 Accepted — CONDITIONAL NO-GO; P15-T01–P15-T08 Accepted

| ID | Workstream | Task | Owner | Efor (pd) | Bağımlılık | Durum | Kanıt |
|---|---|---|---|---:|---|---|---|
| P15-T01 | Security | Threat model ve abuse case review'ünü gerçekleştir | Security Lead | 7 | P14-T08 | Accepted | `docs/phase-15-security-p15-t01-review.md`, `src/security/threat-model.ts`, `test/security/threat-model.test.ts` |
| P15-T02 | IAM | RBAC enforcement, API key, OAuth/session ve revocation kontrollerini tamamla | Backend Lead | 8 | P15-T01 | Accepted | `docs/phase-15-security-p15-t02-review.md`, `src/security/iam-enforcement.ts`, `test/security/iam-enforcement.test.ts` |
| P15-T03 | Secrets | Secrets management ve credential rotation akışını uygula | Security Lead | 7 | P15-T02 | Accepted | `docs/phase-15-security-p15-t03-review.md`, `src/security/secret-lifecycle.ts`, `test/security/secret-lifecycle.test.ts` |
| P15-T04 | Cryptography | Encryption at rest/in transit ve key policy'sini doğrula | SRE/Platform Lead | 5 | P15-T03 | Accepted | `docs/phase-15-security-p15-t04-review.md`, `src/security/encryption-posture.ts`, `test/security/encryption-posture.test.ts` |
| P15-T05 | Network | SSRF, egress, redirect ve webhook destination guardrail'larını harden et | Security Lead | 8 | P15-T04 | Accepted | `docs/phase-15-security-p15-t05-review.md`, `src/security/network-guardrails.ts`, `test/security/network-guardrails.test.ts` |
| P15-T06 | Isolation | Worker/browser sandbox, resource limit ve tenant isolation hardening yap | SRE/Platform Lead | 8 | P15-T05 | Accepted | `docs/phase-15-security-p15-t06-review.md`, `src/security/runtime-isolation.ts`, `test/security/runtime-isolation.test.ts` |
| P15-T07 | Audit/Privacy | Audit, retention, deletion, DLP ve data access review'ünü tamamla | Compliance/Legal | 6 | P15-T06 | Accepted | `docs/phase-15-security-p15-t07-review.md`, `src/security/privacy-governance.ts`, `test/security/privacy-governance.test.ts` |
| P15-T08 | Security QA | Vulnerability scan, penetration test remediation ve go-live approval | Security Lead | 10 | P15-T07 | Accepted | `docs/phase-15-security-p15-t08-review.md`, `src/security/acceptance-gate.ts`, `test/security/acceptance-gate.test.ts`, `scripts/security-gate-smoke.ts` |

> **M15 karar notu:** Kullanıcı onayıyla M15, real vulnerability scan, authorized penetration test, remediation/re-test ve production security sign-off eksikleri korunarak `Accepted — CONDITIONAL NO-GO` olarak kapatılmıştır. Bu karar production go-live yetkisi vermez. Ayrıntı: `docs/phase-15-security-m15-gate.md`.

> **Güvenlik notu:** Phase 15 workstream'i backend-only ve explicit review kapılarıyla ilerler. Threat model veya abuse case record'ları secret, credential, token, cookie, authorization, private endpoint, active exploit payload ya da bypass/reproduction adımı içermez. Policy/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override ve automatic bypass retry kapsam dışıdır.
