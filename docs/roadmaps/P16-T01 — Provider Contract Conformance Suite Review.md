# P16-T01 — Provider Contract Conformance Suite Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, secret-safe, deterministic, local-test-double-only provider conformance reference suite

## 1. Amaç ve kabul sınırı

P16-T01, her provider adapter'ın ortak `ProxyProvider` sözleşmesini boundary-level check'lerle değerlendirmek için `provider-conformance/v1` suite contract'ını tanımlar. Authoritative task register, her adapter'ın ortak conformance testlerini geçmesini kabul kriteri olarak belirtir.[1]

Bu paket real provider sertifikasyonu yapmaz. `evaluateProviderConformance` sadece local test double evidence'ını kabul eder; provider endpoint/account/credential/token, proxy IP, request payload veya raw provider response kabul etmez ve hiçbir provider API'sini çağırmaz.

| Conformance check | Sözleşme alanı |
|---|---|
| `CAPABILITY_CONTRACT` | Capability model ve supported feature sözleşmesi |
| `HEALTH_CONTRACT` | Bounded health output şekli |
| `ACQUIRE_RELEASE_LIFECYCLE` | Lease acquire/release lifecycle uyumu |
| `FAILURE_TAXONOMY` | Closed provider error taxonomy uyumu |
| `TENANT_SCOPE_ISOLATION` | Tenant-boundary isolation davranışı |
| `CREDENTIAL_REFERENCE_SAFETY` | Credential material yerine safe reference davranışı |

## 2. Conformance sonucu ve sertifikasyon sınırı

Suite, exact altı check'i birer kez kabul eder. Check'lerin tamamı `PASS` ise `CONFORMANT_REFERENCE`; en az bir check `FAIL` ise `NON_CONFORMANT` üretir. Başarısız check output'u yalnız fixed identifier olarak listelenir.

| Output flag | Sabit değer | Anlamı |
|---|---:|---|
| `executionMode` | `LOCAL_TEST_DOUBLE` | Live provider/test account kullanılmaz |
| `requiresManualCertification` | `true` | Reference result provider sertifikasyonu değildir |
| `allowsProviderActivation` | `false` | Adapter aktive edilmez |
| `allowsExternalProviderCall` | `false` | Provider network/API çağrısı yapılmaz |

> `CONFORMANT_REFERENCE`, yalnız supplied local test-double evidence'ının fixed ortak sözleşmeye uyduğunu ifade eder. Real provider credential, quota, network, endpoint, SLA, billing veya production failover doğrulaması değildir.

## 3. Veri minimizasyonu

Input/output yalnız safe adapter/provider/version ID, local execution mode ve closed check status'ları taşır. Provider URL/endpoint, account/customer ID, secret, credential, API key, token, proxy IP, raw response, usage/billing data veya target detail yoktur.

## 4. Doğrulama kanıtı

Dar kapsam test paketi full conformance, deterministic failed-check projection, no-activation/no-external-call flags'i, data minimization'ı ve malformed/non-local/duplicate evidence fail-closed yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/provider-conformance.test.ts` | Başarılı — 1 dosya / 3 test | Full/failing conformance, local-only flags ve fail-closed validation |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 106 dosya / 397 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. Bright Data, Oxylabs, Zyte veya başka bir gerçek provider API/account/endpoint/credential bağlantısı, çağrısı ya da sertifikasyonu.
2. Live quota/billing/health/lease doğrulaması, provider onboarding, account provisioning, credential rotation veya support iletişimi.
3. Proxy acquisition/release/rotation/failover execution, external dispatch, target request veya anti-bot/CAPTCHA/WAF bypass.
4. Real integration/E2E, SLA/load/failure injection, production activation veya provider portfolio certification.
5. Dashboard/frontend/UI ve abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 6. Review kararı

P16-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız local test-double provider conformance reference suite ve sandbox regression/build doğrulamasını kanıtlar; real provider API/account/credential/quota/health/lease/SLA entegrasyonu veya production adapter certification iddiası değildir. Sıradaki bounded paket P16-T02 — Provider Adapter Certification Reference olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T01 kabul kriteri"
