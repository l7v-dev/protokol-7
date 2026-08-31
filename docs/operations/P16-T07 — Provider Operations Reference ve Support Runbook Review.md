# P16-T07 — Provider Operations Reference ve Support Runbook Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T07  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, secret-safe, deterministic, bounded, tenant-isolated ve non-executing provider operations reference contract

## 1. Amaç ve kabul sınırı

P16-T07, provider onboarding, quota, credential rotation ve support runbook işini gerçek provider işlemi yürütmeden local reference routing modeline dönüştürür.[1] `provider-operations-reference/v1`, yalnız safe provider/credential-reference metadata'sını değerlendirir ve sabit bir manual support-runbook route üretir.

> Contract gerçek onboarding, quota query, credential resolution, credential rotation, adapter activation, provider API call veya support ticket dispatch yapmaz. Output yalnız bir **manual review route**’tur.

## 2. Local reference input ve secret minimizasyonu

Input tenant/provider ID/version, local certification status, onboarding status, bounded local quota reference, credential **reference** ID/version/status ve rotation **reference action** taşır. Secret value, API key, token, password, cookie, authorization header, endpoint/URL, account/customer ID, proxy IP, target URL, raw provider response, ticket payload veya billing record kabul edilmez.

| Alan | Kabul edilen bounded değer | Gerçek operasyon etkisi |
|---|---|---|
| Local certification | `LOCAL_REFERENCE_CERTIFIED` / `LOCAL_REFERENCE_REJECTED` | Vendor/provider certification değil |
| Onboarding | `LOCAL_REFERENCE_READY` / `REAL_PROVIDER_ONBOARDING_REQUIRED` | Onboarding başlatmaz |
| Quota | Fixed status + %0–100 remaining reference | Quota/usage query yapmaz |
| Credential | Safe reference ID, positive version, `ACTIVE` / `REVOKED` | Credential resolve/rotate etmez |
| Rotation | `NO_ACTION` / `ROTATION_REQUIRED` / `REVOKED` | Yalnız approval-required review intent |

## 3. Manual support runbook routing

Route’lar priority sırasıyla dönülür. Revoked credential/reference koşulu diğer tüm koşullardan önce manual security review oluşturur. Contract, hiçbir koşulda automatic rotation, activation, failover, retry veya external dispatch üretmez.

| Koşul | `supportRunbookRoute` | Aksiyon sınırı |
|---|---|---|
| Credential veya rotation reference `REVOKED` | `MANUAL_SECURITY_REVIEW` | Manual security review; secret resolve/rotation yok |
| Quota `LIMIT_REACHED` veya `UNKNOWN` | `MANUAL_QUOTA_REVIEW` | Manual quota review; provider query veya bypass yok |
| Rotation `ROTATION_REQUIRED` | `MANUAL_CREDENTIAL_ROTATION_REVIEW` | Explicit approval gerekir; automatic rotation yok |
| Certification rejected veya onboarding required | `MANUAL_ONBOARDING_REVIEW` | Manual review; onboarding/activation yok |
| Complete local-reference posture | `NO_ACTION` | Operational action yok |

Output tüm durumda `requiresRealProviderOnboarding: true`, `requiresExplicitCredentialRotationApproval: true`, `requiresExplicitQuotaApproval: true`, `allowsAutomaticCredentialRotation: false`, `allowsProviderActivation: false` ve `allowsExternalProviderCall: false` taşır.

## 4. Fail-closed ve tenant boundaries

Tenant/provider/version/reference ID’leri safe bounded identifier olmalıdır. Quota yüzdesi 0–100 arasında finite olmalı; credential version pozitif integer olmalı; `ROTATION_REQUIRED` yalnız exact next version (`current + 1`) ile ifade edilebilir. Bu kurallardan herhangi biri sağlanmazsa `PROVIDER_OPERATIONS_REFERENCE_INVALID` ile route üretilmeden fail-closed reddedilir.

Result tenant ID ve provider ID'yi korur, ancak credential reference ID/version/status veya quota numeric details output'a taşınmaz. Contract process-local ve stateless'tir; persistent operations history, distributed tenant authorization veya real support workflow evidence'i değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/provider-operations-reference.test.ts` | Başarılı — 1 dosya / 4 test | No-action güvenlik flags'i, manual quota/rotation/onboarding routes, revoked security priority, invalid input fail-closed ve credential minimizasyonu |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 112 dosya / 418 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Gerçek provider onboarding, account access, credential provisioning/resolution/rotation/revocation veya vendor credential store entegrasyonu.
2. Live quota/usage/billing/SLA polling, quota increase veya quota/policy bypass.
3. Provider activation, target/traffic dispatch, proxy lease operation, automatic retry/failover, external support ticket/notification veya network call.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, stealth davranışı, credential discovery veya unauthorized data collection.
5. Persistent database, scheduler, external event transport, dashboard/frontend/UI ve abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P16-T07, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız bounded metadata üzerinde side-effect-free support-runbook routing ve sandbox regression/build kanıtıdır; real provider operations, credential rotation, quota polling, onboarding/activation veya production go-live kanıtı değildir. M15 güvenlik gate’i **Accepted — CONDITIONAL NO-GO** olarak kalmaktadır; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off henüz dış kanıt gerektirir. P16-T08 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T07 kabul kriteri"
