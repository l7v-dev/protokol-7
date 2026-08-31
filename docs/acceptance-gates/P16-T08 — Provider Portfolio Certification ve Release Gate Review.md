# P16-T08 — Provider Portfolio Certification ve Release Gate Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T08  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, secret-safe, deterministic, bounded, tenant-isolated, local-reference-only ve non-releasing provider portfolio gate contract

## 1. Amaç ve kabul sınırı

P16-T08, provider portfolio certification ve release gate hedefini, gerçek runtime provider yönetimi yerine local reference evidence aggregate eden deterministic bir gate contract’ına indirger.[1] `provider-portfolio-gate/v1`, her candidate için P16-T01 conformance, local certification ve P16-T07 operations route sonuçlarını birleştirir.

> `LOCAL_REFERENCE_GATE_PASSED`, yalnız verilen bounded local reference kanıtının tutarlı olduğunu gösterir. Real provider certification, provider activation, runtime disablement, production release veya go-live onayı değildir.

## 2. Qualification modeli

Bir provider local olarak qualified sayılabilmek için dört koşulu birlikte sağlamalıdır: `CONFORMANT_REFERENCE`, `LOCAL_REFERENCE_CERTIFIED`, `NO_ACTION` support route ve `NOT_ACTIVATED` activation state. Her provider ID/version safe bounded identifier olmalı; portfolio 1–12 unique candidate ile sınırlı kalmalıdır.

| Evidence alanı | Qualified değer | Anlamı |
|---|---|---|
| P16-T01 conformance | `CONFORMANT_REFERENCE` | Local test-double six-check evidence başarılı |
| Local certification | `LOCAL_REFERENCE_CERTIFIED` | Reference certification kaydı başarılı |
| Operations route | `NO_ACTION` | Local operations reference ek manual review istemiyor |
| Activation state | `NOT_ACTIVATED` | Runtime provider active değildir |

Her provider qualified ise gate `LOCAL_REFERENCE_GATE_PASSED` ve `ALL_LOCAL_REFERENCE_EVIDENCE_ACCEPTED` sonucunu verir. Aksi hâlde gate `LOCAL_REFERENCE_GATE_REJECTED` verir; neden önceliği `LOCAL_CONFORMANCE_REJECTED`, ardından `LOCAL_CERTIFICATION_REJECTED`, aksi durumda `OPERATIONS_REVIEW_REQUIRED` şeklindedir. Qualified/rejected ID dizileri alfabetik sıralanır; sonuç, input dizilişinden bağımsız deterministiktir.

## 3. Release ve activation prohibition

Output, local evidence başarılı olsa dahi aşağıdaki sabit güvenlik koşullarını taşır.

| Output flag | Değer | Etkisi |
|---|---:|---|
| `requiresRealProviderCertification` | `true` | Vendor/provider real certification gerekir |
| `requiresProductionSecuritySignOff` | `true` | M15 external security evidence zorunludur |
| `requiresExplicitProductionReleaseApproval` | `true` | Ayrı yetkili release kararı gerekir |
| `allowsProviderActivation` | `false` | Runtime provider değişikliği yapılamaz |
| `allowsProductionRelease` | `false` | Production release/deploy yapılamaz |
| `allowsExternalProviderCall` | `false` | Provider API/network call yoktur |

Contract gerçek provider'ı etkinleştirmez, devre dışı bırakmaz, provider account/credential/token/endpoint kullanmaz, live health/quota/billing/SLA sorgulamaz, traffic/target dispatch etmez, proxy lifecycle yürütmez ve production release/deployment başlatmaz.

## 4. Secret safety, tenant boundary ve fail-closed davranış

Input/output yalnız tenant ID, gate ID, provider ID/version, fixed conformance/certification/runbook vocabularies ve `NOT_ACTIVATED` state taşır. Credential/API key/token, account/customer ID, endpoint/URL, proxy IP, raw provider response, target URL/payload, quota/billing detail veya actual runtime state kabul edilmez ya da döndürülmez.

Unsafe/duplicate provider ID, unsafe tenant/gate/provider version, empty veya 12 üzeri portfolio, bilinmeyen vocabulary veya activation state farklılığı gate üretilmeden `PROVIDER_PORTFOLIO_GATE_INVALID` ile fail-closed reddedilir. `locallyRejectedProviderIds`, yalnız reference gate classification'ıdır; runtime provider disablement iddiası veya kontrolü değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/provider-portfolio-gate.test.ts` | Başarılı — 1 dosya / 4 test | Complete local evidence, non-releasing flags, conformance/certification rejection, operations review requirement, secret minimization, invalid evidence fail-closed |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm test:provider-gate` | Başarılı — `LOCAL_REFERENCE_GATE_PASSED` | 4 local-reference evidence kaydı ile deterministic P16-T08 smoke gate; provider activation/release/network call yok |
| `pnpm test:integration` | `[integration] SKIPPED dependency unavailable.` | Gerçek database/queue/storage/provider E2E veya production provider kanıtı değildir |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 422 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. M16 decision constraint ve bilinçli kapsam dışları

P16-T08, Phase 16'nın local reference-contract zincirindeki son bounded paketidir; M16 karar kaydı ancak explicit kullanıcı onayından sonra güncellenebilir. M15 güvenlik gate’i **Accepted — CONDITIONAL NO-GO** olarak kalır. Gerçek vulnerability scan, yetkilendirilmiş pentest, remediation/re-test, real provider certification, provider account/credential/quota/billing/SLA doğrulaması, production security sign-off ve explicit production release approval tamamlanmadan production go-live veya provider portfolio activation iddia edilemez.

Dashboard/frontend/UI, abandoned `/home/ubuntu/scraping-platform-operations-site` projesi, persistent service/scheduler, external notification/ticket dispatch, automatic failover/retry, policy/quota bypass, anti-bot/CAPTCHA/WAF bypass, fingerprint evasion ve unauthorized data collection bu paketin kapsamı dışındadır.

## 7. Review kararı

P16-T08, nihai tam kalite, deterministic local provider gate ve dependency-bounded integration kontrolünden geçmiş; explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. `LOCAL_REFERENCE_GATE_PASSED`, smoke script'e verilmiş dört bounded local evidence kaydının tutarlı olduğunu gösterir; real Bright Data, Oxylabs, Zyte veya internal provider certification/health/quota/account/credential/activation doğrulaması değildir. Bu paket local provider portfolio evidence gate’idir; real provider portfolio certification veya release/gate sign-off değildir. M16, external provider evidence ve M15 security dış kanıtları tamamlanana kadar **`Accepted — CONDITIONAL NO-GO`** olarak kalır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T08 kabul kriteri"
