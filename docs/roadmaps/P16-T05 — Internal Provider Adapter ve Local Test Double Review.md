# P16-T05 — Internal Provider Adapter ve Local Test Double Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T05  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, secret-safe, deterministic, tenant-isolated ve non-provider-calling internal adapter/test-double contract

## 1. Amaç ve kabul sınırı

P16-T05, internal provider adapter ve local test double yüzeyini external provider secret'ı olmadan çalışır hâle getirme kabul kriterini karşılar.[1] `InternalProviderAdapter`, mevcut credential-free `FakeProxyProvider`’a yalnız in-process delegasyon yapan bir `ProxyProvider` adapter'ıdır.

> Adapter, gerçek provider bağlantısı için hazırlık veya aktivasyon anlamına gelmez. `LOCAL_TEST_DOUBLE` execution mode yalnız deterministic sandbox test evidence üretir.

## 2. Contract ve deterministik lifecycle

Internal adapter, capability, health, acquire, release, quarantine ve rotate çağrılarını mevcut local fake provider üzerinden yürütür. Sabit `internal.provider.invalid` host metadata'sı test-double lease biçimi için ayrılmıştır; network resolve, provider dispatch veya endpoint çağrısı yapılmaz.

| Execution boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_TEST_DOUBLE` | In-process deterministic local reference |
| `allowsExternalProviderCall` | `false` | Network/provider API çağrısı yok |
| `allowsProviderActivation` | `false` | Provider activation yok |
| `allowsCredentialMaterial` | `false` | Credential/token/key/account materyali kabul edilmez |

Capability, health ve lease kayıtları defensive-copy ile döndürülür. Hata injection yalnız fixed `ProxyProviderErrorCode` vocabulary’si ve pozitif bounded sayım üzerinden test edilebilir. Bu, failure exercise imkânı verir ancak auto-retry, policy override, failover veya external dispatch başlatmaz.

## 3. Tenant ve provider isolation

Her acquire isteği adapter `providerId`’si, declared capability ve lease duration ile eşleşmelidir. Mismatched provider terminal `PROVIDER_POLICY_REFUSED` ile reddedilir. Bir lease yalnız aynı provider ve tenant kapsamında release/quarantine/rotate edilebilir; tenant değiştirilmiş lease `PROXY_LEASE_NOT_FOUND` ile fail-closed kapanır.

| Sınır | Kontrol | Başarısızlık davranışı |
|---|---|---|
| Provider scope | `request.providerId` adapter ID ile eşleşir | `PROVIDER_POLICY_REFUSED` |
| Tenant lease ownership | Stored lease provider/tenant ile eşleşir | `PROXY_LEASE_NOT_FOUND` |
| Capability/lease policy | Protocol, class, geo ve max duration | `PROXY_CAPABILITY_MISMATCH` |
| Unsafe adapter ID/version | Bounded safe ID regex | `INTERNAL_PROVIDER_ADAPTER_CONFIG_INVALID` |

## 4. Secret safety ve non-goals

Adapter options veya observable control plane credential, API key, bearer token, account/customer ID, provider endpoint/URL, proxy IP, target URL, raw response, quota, billing veya external error payload'ı taşımaz. Testler observable boundary/call kayıtlarında `credential`, `token`, `endpoint` ve `account` dizgilerinin bulunmadığını doğrular.

Gerçek provider onboarding/account access/credential provisioning, live proxy acquisition/rotation, external call, automated failover/retry, quota/billing/SLA/health doğrulaması, target dispatch, policy bypass, anti-bot/CAPTCHA/WAF bypass, fingerprint evasion ve frontend/UI bu paketin kapsamı dışındadır.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/internal-provider-adapter.test.ts` | Başarılı — 1 dosya / 4 test | Local lifecycle, external execution prohibition, tenant/provider isolation, bounded failure injection, invalid config |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 110 dosya / 410 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Review kararı

P16-T05, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local in-process test-double ve sandbox regression/build kanıtıdır; real provider validation, production adapter activation veya production go-live kanıtı değildir. M15 güvenlik gate’i **Accepted — CONDITIONAL NO-GO** olarak kalmaktadır; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off henüz dış kanıt gerektirir. P16-T06 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T05 kabul kriteri"
