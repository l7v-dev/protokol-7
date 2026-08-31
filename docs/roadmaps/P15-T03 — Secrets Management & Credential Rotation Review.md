# P15-T03 — Secrets Management & Credential Rotation Review

**Program:** Scraping Platform  
**Milestone / Phase:** M15 / Phase 15 — Security  
**Task:** P15-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, non-revealing, non-rotating secret reference lifecycle contract

## 1. Amaç ve kabul sınırı

P15-T03, secrets management ve credential rotation akışının safe reference-level karar yüzeyini `secret-lifecycle/v1` contract'ı üzerinden tanımlar. Authoritative task register, raw secret'ın database, log, trace veya UI içinde görünmemesini kabul kriteri olarak belirtir.[1]

`src/security/secret-lifecycle.ts`, herhangi bir secret değeri kabul etmez, çözümlemez, saklamaz, hash'lemez veya döndürmez. Contract yalnız safe `secretId`, `tenantId`, secret kind, `referenceId`, version, activation time ve lifecycle status taşıyan reference kayıtları üzerinde çalışır.

| Secret kind | Contract'ın kabul ettiği veri |
|---|---|
| `PROVIDER_CREDENTIAL_REFERENCE` | Tenant-scoped credential reference ID ve version |
| `API_KEY_REFERENCE` | API key değerinin kendisi değil safe reference ID |
| `OAUTH_CLIENT_REFERENCE` | OAuth client secret değil safe reference ID |
| `ENCRYPTION_KEY_REFERENCE` | Key material değil safe reference ID |

## 2. Lifecycle ve rotation decision

`SecretReferenceLifecycleRegistry`, tenant/reference/version boundary'sinde idempotent registration ve process-local lifecycle revoke kaydı sağlar. Aynı boundary'de farklı content gönderimi `SECRET_LIFECYCLE_CONFLICT` ile fail-closed reddedilir. Rotation kararının kendisi external secret rotate etmez; yalnız approval-required decision üretir.

| Durum | Rotation action | Output güvenlik flag'leri |
|---|---|---|
| Active reference yaş eşiğinin altında | `NO_ACTION` | `approvalRequired: true`, `allowAutomaticRotation: false` |
| Active reference yaş eşiğine ulaşmış/aşmış | `ROTATION_REQUIRED` ve `nextVersion` | `approvalRequired: true`, `allowAutomaticRotation: false` |
| Lifecycle revoke edilmiş | `REVOKED` | `approvalRequired: true`, `allowAutomaticRotation: false` |

`maxAgeDays` 1–365 aralığıyla sınırlıdır. Unsafe ID, unknown secret kind/status, invalid version/time veya invalid age `SECRET_LIFECYCLE_INVALID`; bulunmayan reference `SECRET_LIFECYCLE_NOT_FOUND` ile reddedilir.

> P15-T03, real secret/credential rotation yapmaz. Secret manager, vault/KMS, provider credential API, database/Redis/S3 persistence veya external network call içermez. JavaScript memory'de secret değerlerini güvenilir biçimde wipe etme iddiası da yoktur; contract secret material'ı hiç işlemez.

## 3. Veri minimizasyonu

Rotation decision output'unda yalnız secret ID, tenant ID, secret kind, reference ID, version, lifecycle status, evaluated time, max age, action ve next version vardır. Password, API key, bearer/OAuth token, refresh token, cookie, authorization header, credential value, key material veya secret hash alanı yoktur.

## 4. Doğrulama kanıtı

Dar kapsam test paketi rotation-required/no-action/revoked kararlarını, approval-required/non-automatic flags'i, secret-value minimization'ı ve invalid/conflict validation yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/security/secret-lifecycle.test.ts` | Başarılı — 1 dosya / 3 test | Rotation/revoke lifecycle, secret minimization ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 100 dosya / 379 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. Real secret value/credential/token/key material kabulü, storage, retrieval, loglama, hashing veya decryption.
2. Vault/KMS/secret manager/provider credential API bağlantısı, external network call, persistent lifecycle store veya distributed rotation propagation.
3. Automatic rotation, external credential revoke, provider session invalidation, database migration veya runtime config reload.
4. Encryption/key policy, certificate rotation, IAM account provisioning, audit export, dashboard veya frontend/UI.
5. Credential discovery, token/session theft, privilege escalation, authentication/policy bypass veya anti-bot/CAPTCHA/WAF bypass desteği.

## 6. Review kararı

P15-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız secret-reference lifecycle/rotation decision reference contract ve sandbox regression/build doğrulamasını kanıtlar; real secret manager/KMS/Vault/provider rotation, persistent lifecycle store, credential rotation veya production secrets management iddiası değildir. Sıradaki bounded paket P15-T04 — Encryption & Key Policy Verification olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 15 Security — P15-T03 kabul kriteri"
