# P06-T05 — İdempotent Normalize Transform ve Raw/Normalized Lineage Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T05  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-value-only, plan-compatible, secret-safe ve non-dispatching normalize/lineage contract

## 1. Amaç ve kabul sınırı

P06-T05, normalize transform kütüphanesini idempotent ve raw/normalized lineage korunmuş biçimde sunma kabul hedefini karşılar.[1] `ExtractionNormalizer`, caller-provided local string value dizisini fixed transform vocabulary ile dönüştürür; her output raw value, normalized value, step-by-step lineage ve redaction status taşır.

Contract URL/target/API fetch, browser/provider/proxy çağrısı, credential kullanımı, script evaluation, queue/worker dispatch, persistence veya external network call yapmaz.

## 2. Execution boundary ve bounded input

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_VALUE_ONLY` | Caller-provided local string values ile sınırlı |
| `allowsTargetFetch` | `false` | URL/target isteği yok |
| `allowsProviderCall` | `false` | Provider/proxy çağrısı yok |
| `allowsBrowserExecution` | `false` | Browser/runtime execution yok |
| `allowsScriptEvaluation` | `false` | Serbest expression/script yok |
| `allowsCredentialMaterial` | `false` | Credential materyali kabul edilmez |

Default input limitleri en çok 100 value ve value başına 64 KB UTF-8'tir. Invalid options veya limit aşımı typed normalization error ile herhangi bir transform uygulanmadan fail-closed reddedilir.

| Kontrol | Error code |
|---|---|
| Geçersiz max value / value byte limit | `NORMALIZATION_OPTIONS_INVALID` |
| Value sayısı, byte boyutu veya string type sınırı | `NORMALIZATION_INPUT_LIMIT_EXCEEDED` |
| Bilinmeyen/10 üzeri transform | `NORMALIZATION_TRANSFORM_INVALID` |

## 3. İdempotent transform ve lineage modeli

Desteklenen transform vocabulary `TRIM`, `COLLAPSE_WHITESPACE`, `LOWERCASE`, `UPPERCASE`, `REMOVE_CURRENCY_SYMBOL` ve `NORMALIZE_DECIMAL` ile sınırlıdır. Transform fingerprint, ordered transform kind dizisini taşır; transform tanımı serbest regex, locale inference, user code veya eval kabul etmez.

| Output alanı | Anlamı |
|---|---|
| `rawValue` | Original local value; sensitive ise `[REDACTED]` |
| `normalizedValue` | Fixed transform zincirinin sonucu |
| `steps` | Her transform öncesi/sonrası value lineage'i |
| `redacted` | Sensitive output boundary koruması |
| `transformFingerprint` | Ordered fixed transform zinciri veya `IDENTITY` |

Aynı fixed transform chain, kendi normalized output'u üzerinde tekrar çalıştırıldığında aynı sonucu verir. Plan transforms, P06-T01 immutable plan version içinde defensive-copy ile tutulur; caller mutation'ı normalization semantics'ini değiştirmez.

## 4. Secret safety ve non-goals

Sensitive value pattern'i (örneğin bearer/authorization, cookie, password veya API key benzeri content) algılandığında raw ve normalized result `[REDACTED]` olur; step chain üretilmez. Bu davranış caller input'unu storage/log'a yazmaz ve real secret scanning/DLP/vault mekanizması değildir.

Real extraction, target/provider/credential/account access, artifact storage, model call, API dispatch, automatic retry, production data mutation, anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery ve frontend/UI kapsam dışıdır.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/normalize.test.ts` | Başarılı — 1 dosya / 5 test | Boundary, invalid options/input bounds, deterministic chain, raw/normalized step lineage, idempotency, redaction, arbitrary transform rejection ve immutable plan transform copy |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 426 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Review kararı

P06-T05, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local value normalization contract ve sandbox regression/build kanıtıdır; real data persistence, external extraction veya production go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T06 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T05 kabul kriteri"
