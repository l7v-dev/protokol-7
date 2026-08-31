# P15-T01 — Threat Model & Abuse Case Review

**Program:** Scraping Platform  
**Milestone / Phase:** M15 / Phase 15 — Security  
**Task:** P15-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, secret-safe, bounded threat model ve abuse-case review reference contract

## 1. Amaç ve kabul sınırı

P15-T01, Security Phase'in başlangıç kontrolü olarak threat model ve abuse-case review kaydını `threat-model/v1` contract'ı ile tanımlar. Authoritative task register, High/Critical riskler için owner ve kapanış kriteri atanmasını kabul kriteri olarak belirtir.[1]

`src/security/threat-model.ts`, serbest tehdit anlatımı, attack payload veya exploit adımı yerine kapalı bir catalog kullanır. Her catalog kaydı severity, control family ve doğrulanabilir closure criterion ile önceden tanımlıdır; review input yalnız fixed threat ID, rol tabanlı owner ve status kabul eder.

| Threat ID | Severity | Control family | Closure criterion özeti |
|---|---|---|---|
| `SSRF_EGRESS` | `CRITICAL` | `NETWORK` | Private/metadata egress ve redirect validation kontrolü |
| `TENANT_ISOLATION` | `CRITICAL` | `ISOLATION` | Cross-tenant access ve artifact isolation negatif testleri |
| `SECRET_EXPOSURE` | `CRITICAL` | `SECRETS` | Redaction, storage, trace/log exposure kontrolleri |
| `AUTHORIZATION_BYPASS` | `HIGH` | `IAM` | Role/scope/revocation enforcement negatif testleri |
| `POLICY_BYPASS` | `HIGH` | `COMPLIANCE` | Policy/anti-bot/CAPTCHA bypass ve automatic bypass retry redleri |
| `RESOURCE_EXHAUSTION` | `MEDIUM` | `RESILIENCE` | Worker/browser resource limit ve bounded retry kontrolleri |

## 2. Review tamlığı ve data minimization

Review, altı kayıtlı threat ID'nin tamamını tam olarak bir kez içermek zorundadır. High/Critical kayıtların owner ve closure criterion alanları fixed catalog üzerinden görünürdür. `MITIGATED_VERIFIED` dışındaki High/Critical kayıtlar `unresolvedHighCriticalThreatIds` alanında yalnız identifier olarak listelenir. Bu, açık riskleri gizlemez ancak raw kanıt veya active attack detail sızdırmaz.

| Fail-closed koşul | Sonuç |
|---|---|
| Unknown threat/owner/status veya unsafe review ID/time | `THREAT_MODEL_INVALID` |
| Duplicate threat ID | `THREAT_MODEL_INVALID` |
| Closed catalog'ın eksik review edilmesi | `THREAT_MODEL_INCOMPLETE` |

Contract `allowsGoLive: false` döndürür. P15-T01 threat review kaydı, canlı go-live onayı vermez ve security control, RBAC, network policy veya runtime isolation değişikliği yapmaz.

> Threat model output'u credential, token, cookie, authorization, private endpoint, target/URL, raw payload, exploit/pentest adımı veya policy bypass instruction içermez. CAPTCHA/WAF/anti-bot bypass, fingerprint evasion, credential discovery, policy override ve automatic bypass retry açıkça kapsam dışındadır.

## 3. Doğrulama kanıtı

Dar kapsam test paketi, fixed catalog tamlığını, High/Critical owner/kapanış kriteri güvencesini, unresolved identifier output'unu, fully-mitigated review davranışını ve invalid/incomplete/duplicate red yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/security/threat-model.test.ts` | Başarılı — 1 dosya / 3 test | Catalog completeness, owner/closure, unresolved/mitigated davranışı ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 98 dosya / 373 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Live penetration test, vulnerability scan, exploit verification, active target scanning veya attack payload/reproduction adımı.
2. Real go-live approval, risk acceptance sign-off, security control deployment, RBAC/session mutation, credential rotation veya encryption/key operation.
3. Network/proxy/browser/worker runtime değişikliği, policy bypass veya automatic remediation.
4. Database/Redis/S3 persistence, security ticket/issue tracker integration, alert/on-call dispatch veya external compliance reporting.
5. Frontend/UI, dashboard veya abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 5. Review kararı

P15-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız bounded threat-review reference contract ve sandbox regression/build doğrulamasını kanıtlar; real penetration testing, vulnerability scanning, remediation, security control deployment veya production go-live approval iddiası değildir. Sıradaki bounded paket P15-T02 — IAM Enforcement & Revocation olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 15 Security — P15-T01 kabul kriteri"
