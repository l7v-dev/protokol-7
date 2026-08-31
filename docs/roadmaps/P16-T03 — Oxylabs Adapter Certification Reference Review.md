# P16-T03 — Oxylabs Adapter Certification Reference Review

**Program:** Scraping Platform  
**Milestone / Phase:** M16 / Phase 16 — Provider Abstraction  
**Task:** P16-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, secret-safe, immutable, local mock/reference ve non-provider-calling adapter certification contract

## 1. Amaç ve kabul sınırı

P16-T03, authoritative backlog'taki Oxylabs adapter/certification işini gerçek provider entegrasyonu olmadan güvenli bir **reference certification** yüzeyine indirger. `oxylabs-reference-certification/v1`, `OXYLABS_REFERENCE` sınıflandırma etiketini yalnız local test-double conformance evidence'ı ile değerlendirebilir.[1]

Bu etiket gerçek Oxylabs adapter'ı, hesabı, endpoint'i, credential'ı, quota'sı veya sertifikasyonu anlamına gelmez. Contract hiçbir external provider API çağrısı veya proxy operation yapmaz.

## 2. Certification akışı

`OxylabsReferenceCertificationRegistry`, P16-T01'in exact altı fixed conformance check'i ile immutable bir certification record üretir.

| Conformance sonucu | Certification status |
|---|---|
| Tüm six common check `PASS` | `LOCAL_REFERENCE_CERTIFIED` |
| En az bir common check `FAIL` | `LOCAL_REFERENCE_REJECTED` |

Aynı `certificationId`, aynı output ile tekrar verilirse idempotent sonuç döner; farklı provider version veya evidence ile tekrar kullanılırsa `OXYLABS_REFERENCE_CERTIFICATION_CONFLICT` ile fail-closed reddedilir.

| Output flag | Sabit değer | Anlamı |
|---|---:|---|
| `requiresRealProviderCertification` | `true` | Local reference sonucu real vendor certification değildir |
| `allowsProviderActivation` | `false` | Adapter aktivasyonu yapılmaz |
| `allowsExternalProviderCall` | `false` | Provider API/network call yapılmaz |

> `LOCAL_REFERENCE_CERTIFIED`, yalnız P16-T01 common conformance evidence'ının local test double üzerinde eksiksiz olduğunu gösterir. Live provider health, quota, billing, lease, proxy endpoint, account/credential veya SLA doğrulaması değildir.

## 3. Secret safety ve veri minimizasyonu

Input/output yalnız certification/adapter/provider-version ID, `OXYLABS_REFERENCE`, review time ve fixed conformance ID/status taşır. Provider endpoint/URL, account/customer ID, credential, API key, token, proxy IP, raw response, target URL, payload veya billing verisi kabul edilmez ya da döndürülmez.

## 4. Doğrulama kanıtı

Dar kapsam test paketi complete local reference certification, fixed failing check projection, no-activation/no-external-call flags'i, sensitive-value minimization'ı ve invalid reference/immutability conflict fail-closed yollarını kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/proxy/oxylabs-reference-certification.test.ts` | Başarılı — 1 dosya / 3 test | Local certification/rejection, flags ve immutability conflict |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 108 dosya / 403 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 5. Bilinçli kapsam dışları

1. Gerçek Oxylabs veya diğer provider API/account/endpoint/credential bağlantısı, OAuth/API key kullanımı, quota, billing veya SLA doğrulaması.
2. Live proxy acquisition/release/rotation, target request, external provider network call, provider activation veya production adapter certification.
3. Provider onboarding, credential provisioning/rotation, support ticket/notification, automatic failover veya automatic retry.
4. Proxy/target policy override, credential discovery, anti-bot/CAPTCHA/WAF bypass, fingerprint evasion veya stealth davranışı.
5. Dashboard/frontend/UI ve abandoned `/home/ubuntu/scraping-platform-operations-site` projesi.

## 6. Review kararı

P16-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız local mock/reference provider certification contract ve sandbox regression/build doğrulamasını kanıtlar; real Oxylabs/provider API/account/credential/quota/billing/health/lease entegrasyonu veya production adapter certification iddiası değildir. Sıradaki bounded paket P16-T04 — Zyte Adapter Certification Reference olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 16 Provider Abstraction — P16-T03 kabul kriteri"
