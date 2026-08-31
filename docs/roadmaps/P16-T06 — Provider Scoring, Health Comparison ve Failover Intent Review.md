# P16-T06 — Provider Scoring, Health Comparison ve Failover Intent Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T06  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, secret-safe, deterministic, bounded, tenant-isolated ve non-dispatching provider decision reference contract

## 1. Amaç ve kabul sınırı

P16-T06, provider scoring, health comparison ve failover kararının event olarak izlenebilir olma kabul hedefini gerçek provider operasyonu üretmeden local reference decision kaydına dönüştürür.[1] `provider-decision-reference/v1`, yalnız caller-provided bounded health/capacity/cost snapshot'larını sıralar ve bir **failover intent** döndürür.

> Result, provider seçimi için operasyon emri değildir. Bir alternative en yüksek skora sahip olsa dahi `MANUAL_FAILOVER_REVIEW_REQUIRED` dışında bir otomatik aksiyon üretmez.

## 2. Deterministik scoring modeli

Eligibility için iki koşul birlikte aranır: candidate `LOCAL_REFERENCE_CERTIFIED` olmalı ve `health.healthy` değeri `true` olmalıdır. Ineligible candidate'ların tüm skorları `0` olur; dolayısıyla seçim dışında kalırlar. Eligible candidates için total score, fixed ağırlıklarla hesaplanır ve eşitlik `providerId` alfabetik sırası ile deterministik olarak çözülür.

| Score bileşeni | Ağırlık | Kaynak snapshot |
|---|---:|---|
| `healthScore` | %65 | Success rate ve bounded latency |
| `capacityScore` | %15 | `availableCapacity`, 100’e normalize edilir |
| `costScore` | %20 | Aynı currency’de relatif `estimatedCostCents` |

Candidate sayısı **1–12** ile bounded’dir. Tenant ID, decision ID, provider ID/version ve currency safe bounded identifier olmalıdır. Currency farklılığı, duplicate provider ID, current provider yokluğu, negatif/non-finite metric veya unsafe identifier karar üretilmeden fail-closed reddedilir.

## 3. Failover intent ve action prohibition

| Koşul | `failoverIntent` | `reasonCode` | External/automatic action |
|---|---|---|---|
| Mevcut provider en yüksek eligible score | `KEEP_CURRENT_PROVIDER` | `CURRENT_HEALTHY_HIGHEST_SCORE` | Yok |
| Başka provider en yüksek eligible score | `MANUAL_FAILOVER_REVIEW_REQUIRED` | `ALTERNATIVE_HIGHER_SCORE` | Yok; yalnız manual review input'u |
| Hiç eligible candidate yok | `NO_AUTOMATIC_FAILOVER` | `CURRENT_PROVIDER_NOT_ELIGIBLE` veya `NO_ELIGIBLE_LOCAL_REFERENCE` | Yok; fail-closed |

Her output şu sabit sınırları taşır: `requiresRealProviderCertification: true`, `requiresExplicitActivationApproval: true`, `allowsAutomaticFailover: false`, `allowsProviderActivation: false` ve `allowsExternalProviderCall: false`.

Bu nedenle contract provider health probe, adapter activation, provider API/account/credential, target request, proxy acquisition/rotation, automatic retry/failover veya network dispatch gerçekleştirmez. Cost field’ı billing/metering çağrısı değil, yalnız caller tarafından verilen local reference estimate'dir.

## 4. Tenant isolation, secret safety ve bounded evidence

Decision record yalnız tenant-scoped `tenantId`, bounded `decisionId`, provider ID/version, fixed certification status, numeric health/capacity/cost metrics, fixed reason/intent vocabulary ve decision flags taşır. Endpoint/URL, credential/API key/token, account/customer ID, proxy IP, raw provider response, target URL/payload veya billing record kabul edilmez ya da üretilmez.

Contract state tutmadığı için decision'lar arasında hidden mutation olmaz. Aynı immutable input, aynı ordered candidate listesi ve aynı output ile değerlendirilir; tenant ID output'a korunarak bağlanır. Bu, distributed state, persistence veya cross-tenant authorization kanıtı değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/provider-decision-reference.test.ts` | Başarılı — 1 dosya / 4 test | Deterministik ranking, manual-review intent, keep-current, ineligible fail-closed, unsafe/cross-currency/duplicate/unbounded input rejection |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 111 dosya / 414 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real provider health/capacity/cost poll, vendor API/account/credential, quota/billing/SLA veya provider certification doğrulaması.
2. Provider adapter activation, traffic dispatch, proxy lease acquisition/release/rotation, target request veya external network call.
3. Automatic failover, automatic retry, fallback execution, policy override veya quota bypass.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, stealth davranışı, credential discovery veya unauthorized data collection.
5. Persistent datastore, distributed consistency, event transport, dashboard/frontend/UI ve abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P16-T06, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız caller-provided local reference snapshot'ları üzerindeki side-effect-free ranking ve sandbox regression/build kanıtıdır; real provider validation, provider activation, external dispatch veya production go-live kanıtı değildir. M15 güvenlik gate’i **Accepted — CONDITIONAL NO-GO** olarak kalmaktadır; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off henüz dış kanıt gerektirir. P16-T07 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T06 kabul kriteri"
