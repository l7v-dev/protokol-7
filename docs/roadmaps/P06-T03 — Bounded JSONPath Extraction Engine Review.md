# P06-T03 — Bounded JSONPath Extraction Engine Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T03  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-fixture-only, plan-scoped, secret-safe ve non-fetching JSONPath extraction contract

## 1. Amaç ve kabul sınırı

P06-T03, bounded JSONPath/API extraction motorunu fixture testleriyle sunma kabul hedefini karşılar.[1] `JsonPathSelectorEngine`, P06-T01’den resolve edilmiş `JSON` source-kind plan’ını ve caller-provided JSON fixture’ını field-level result'a dönüştürür.

`API` ifadesi yalnız JSON-shaped source semantics’ini tanımlar; engine API/URL/HTTP çağrısı yapmaz. Source yalnız in-memory caller fixture’ıdır; target fetch, provider/proxy/browser call, credential kullanımı, script evaluation, storage/persistence, queue/worker dispatch veya external network call yoktur.

## 2. Execution boundary ve bounded kaynak işleme

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_FIXTURE_ONLY` | Caller-provided local JSON ile sınırlı |
| `allowsApiFetch` / `allowsTargetFetch` | `false` / `false` | URL/HTTP/API/target isteği yok |
| `allowsProviderCall` | `false` | Provider/proxy çağrısı yok |
| `allowsBrowserExecution` | `false` | Browser/runtime execution yok |
| `allowsScriptEvaluation` | `false` | Filter/script expression değerlendirme yok |
| `allowsCredentialMaterial` | `false` | Credential materyali kabul edilmez |

Constructor source boyutu ve field başına match sayısı için pozitif integer limit ister. Geçersiz limit `JSONPATH_SELECTOR_ENGINE_OPTIONS_INVALID` ile evaluate başlamadan typed fail-closed reddedilir. Default source limiti 1 MB, default match limiti field başına 100’dür.

## 3. Safe JSONPath subset ve output güvenliği

JSONPath yalnız property, quoted property, array index ve wildcard navigation için strict grammar ile kabul edilir. Filter, recursive traversal, script/eval expression veya sensitive selector target'ı `UNSAFE_JSONPATH` olarak field-level reddedilir. Library evaluator `eval: false` ile çağrılır.

| Kontrol | Davranış |
|---|---|
| Non-JSON plan | `EXTRACTION_SOURCE_UNSUPPORTED` exception |
| Filter/script/unsafe JSONPath | `UNSAFE_JSONPATH` field error |
| Farklı selector kind | `SELECTOR_KIND_UNSUPPORTED` field error |
| Match sınırı aşımı | `MAX_MATCHES_EXCEEDED` field error |
| Required empty field | `REQUIRED_FIELD_MISSING` field error |
| Secret-like scalar/object value | `[REDACTED]`, `REDACTED` status |
| Non-serializable veya oversized source | `EXTRACTION_SOURCE_UNSUPPORTED` exception |

Object/array result'larında sensitive nested key bulunursa raw object serialize edilmez; `[REDACTED]` kullanılır. Field error result selector veya full source value taşımaz. Bu redaction result-boundary güvenliğidir; real DLP, secret store veya API authentication mekanizması değildir.

## 4. Plan relation ve deterministic sonuç

Her extraction output `planId`, `version` ve `fingerprintSha256` ile P06-T01 immutable plan version’a bağlanır. Aynı plan ve local JSON fixture, aynı field order ve same bounded value set ile sonuçlanır. Bu yalnız in-memory deterministic contract kanıtıdır; real API behavior, external response artifact lineage veya persistent data validation kanıtı değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/jsonpath-engine.test.ts` | Başarılı — 1 dosya / 4 test | Execution boundary, invalid typed limits, property/index/wildcard extraction, unsafe path/match/required errors, redaction, non-JSON/oversized source rejection |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 424 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real API endpoint/URL/HTTP fetch, authentication, request header/cookie veya external network call.
2. Provider/proxy/browser/credential/account integration, queue/worker dispatch, retry, storage/persistence veya raw response artifact lifecycle.
3. CSS/XPath extraction; P06-T02 kapsamındadır. HTML cleaner/parse pipeline ise P06-T04 kapsamındadır.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T03, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local JSON fixture evaluation contract ve sandbox regression/build kanıtıdır; real API extraction veya production go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T04 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T03 kabul kriteri"
