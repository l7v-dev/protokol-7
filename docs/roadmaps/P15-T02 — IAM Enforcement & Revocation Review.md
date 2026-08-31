# P15-T02 — IAM Enforcement & Revocation Review

**Program:** Scraping Platform  
**Milestone / Phase:** M15 / Phase 15 — Security  
**Task:** P15-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded RBAC/identity reference/revocation enforcement contract

## 1. Amaç ve kabul sınırı

P15-T02, RBAC enforcement, API key, OAuth/session ve revocation kontrolünü `iam-enforcement/v1` contract'ı üzerinden tanımlar. Authoritative task register, rol matrisi dışı işlemlerin reddedilmesini ve revoked identity'nin erişememesini kabul kriteri olarak belirtir.[1]

`src/security/iam-enforcement.ts`, API key veya OAuth/session'ın ham secret'ını, token'ını, refresh token'ını veya cookie değerini hiç kabul etmez. Bunun yerine yalnız `API_KEY_REFERENCE` veya `OAUTH_SESSION_REFERENCE` identity kind'i ile safe `referenceId` kullanır. Contract gerçek authentication yapmaz; registered reference identity üzerinde tenant/role/permission/expiry/revocation kararını deterministik üretir.

| Role | İzinli fixed permission'lar |
|---|---|
| `OWNER` | Project/job/dataset read, job execute, dataset export, security manage |
| `OPERATOR` | Project/job/dataset read, job execute |
| `ANALYST` | Project/job/dataset read, dataset export |
| `VIEWER` | Project/job/dataset read |
| `SERVICE` | Project/job/dataset read, job execute, dataset export |

## 2. Enforcement sırası ve tenant izolasyonu

Authorization değerlendirmesi önce requested tenant ile identity tenant'ını karşılaştırır. Ardından registered revocation listesi, expiry zamanı ve fixed role/permission matrix değerlendirilir. Her red yolu safe outcome code üretir; raw identity material veya access token output'a taşınmaz.

| Öncelik | Koşul | Decision code |
|---:|---|---|
| 1 | Requested tenant identity tenant ile eşleşmiyor | `TENANT_SCOPE_MISMATCH` |
| 2 | Tenant/reference identity revoke edilmiş | `IDENTITY_REVOKED` |
| 3 | `expiresAt <= evaluatedAt` | `IDENTITY_EXPIRED` |
| 4 | Role, requested permission'ı içermiyor | `ROLE_FORBIDDEN` |
| 5 | Tüm kontroller geçiyor | `ALLOWED` |

Identity kaydı `tenantId:referenceId` boundary'sinde idempotenttir. Aynı boundary altında farklı identity content gönderimi `IAM_ENFORCEMENT_CONFLICT` ile fail-closed reddedilir. Unknown role/permission/kind, invalid time veya unsafe identifier ise `IAM_ENFORCEMENT_INVALID` üretir.

> P15-T02 authorization/revocation **decision contract**'ıdır. Fastify request patch etmez, token doğrulamaz, OAuth provider çağırmaz, session store'a yazmaz, database/Redis persistence yapmaz veya gerçek credential rotation çalıştırmaz.

## 3. Veri minimizasyonu

Public authorization output yalnız identity ID, tenant ID, identity kind, role, reference ID, requested permission ve karar code'unu içerir. API key, bearer token, OAuth token, refresh token, cookie, authorization header, credential, secret veya session material alanı bulunmaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi role matrix allow/deny davranışını, tenant isolation, revoke/expiry red kararlarını, raw token minimization'ı ve invalid/conflict validation yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/security/iam-enforcement.test.ts` | Başarılı — 1 dosya / 3 test | RBAC, tenant/revocation/expiry enforcement ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 99 dosya / 376 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. Real API key/OAuth/JWT/token validation, token mint/refresh, password flow, cookie parsing veya provider identity integration.
2. Persistent session/revocation store, distributed revocation propagation, token replay detection, device/session management veya rate limiting.
3. Fastify middleware replacement, database/Redis/S3 write, identity provider callback veya external OAuth network call.
4. Credential rotation, secrets management, encryption/key policy, account provisioning, audit export, dashboard veya frontend/UI.
5. Credential discovery, authentication bypass, policy override, privilege escalation, session hijacking veya anti-bot/CAPTCHA/WAF bypass desteği.

## 6. Review kararı

P15-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic IAM decision/reference contract ve sandbox regression/build doğrulamasını kanıtlar; real API key/OAuth validation, persistent revocation/session store, provider identity integration veya production access enforcement iddiası değildir. Sıradaki bounded paket P15-T03 — Secrets Management & Credential Rotation olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 15 Security — P15-T02 kabul kriteri"
