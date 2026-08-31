# P06-T02 — Bounded CSS/XPath Extraction Engine Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T02  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-fixture-only, plan-scoped, secret-safe ve non-fetching CSS/XPath extraction contract

## 1. Amaç ve kabul sınırı

P06-T02, bounded CSS/XPath extraction motorunu fixture testleriyle sunma kabul hedefini karşılar.[1] `HtmlSelectorEngine`, P06-T01'den resolve edilmiş `HTML` source-kind extraction plan’ını ve caller-provided HTML string fixture’ını alarak field-level result üretir.

Bu engine yalnız local in-memory fixture üzerinde parse yapar. URL/target fetch, browser execution, provider/proxy çağrısı, credential kullanımı, script evaluation, raw artifact persistence, queue/worker dispatch veya external network call yapmaz.

## 2. Execution boundary ve bounded davranış

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_FIXTURE_ONLY` | Caller-provided local HTML string ile sınırlı |
| `allowsTargetFetch` | `false` | URL/HTTP/target isteği yok |
| `allowsProviderCall` | `false` | Provider/proxy çağrısı yok |
| `allowsBrowserExecution` | `false` | Browser/runtime çalıştırma yok |
| `allowsScriptEvaluation` | `false` | JavaScript/script execute edilmez |
| `allowsCredentialMaterial` | `false` | Credential materyali kabul edilmez |

Constructor kaynak boyutu ve field başına match sayısı için pozitif integer limit ister. Geçersiz limit `HTML_SELECTOR_ENGINE_OPTIONS_INVALID` ile parse başlamadan typed fail-closed reddedilir. Default source limiti 1 MB, default match limiti field başına 100’dür.

## 3. CSS/XPath output ve güvenlik kontrolleri

Engine CSS selector, XPath ve bounded `::attr(attribute)` syntax’ını destekler. Tekil field’larda ilk normalize değer, `multiple` field’larda tüm bounded normalize değerler döner. Whitespace canonicalize edilir; empty required field `REQUIRED_FIELD_MISSING` olur. Unsupported plan source/kind, selector evaluation error, max-match aşımı ve unsafe selector target fixed error vocabulary ile field-level sonuçlanır.

| Kontrol | Davranış |
|---|---|
| Non-HTML plan | `EXTRACTION_SOURCE_UNSUPPORTED` exception |
| `script`, `style`, `iframe` vb. target | `UNSAFE_SELECTOR_TARGET` field error |
| Secret-like output key | `UNSAFE_SELECTOR_TARGET` field error |
| Source/selector içindeki sensitive value | `[REDACTED]`, `REDACTED` status |
| Field match sınırı aşımı | `MAX_MATCHES_EXCEEDED` field error |
| Required empty field | `REQUIRED_FIELD_MISSING` field error |

Field error output selector veya source content'i taşımaz. Test fixture’ında yer alan `never extract` string’i result serializasyonunda bulunmaz. Redaction yalnız extraction result boundary’sini korur; real secret storage/scanning veya DLP sistemi değildir.

## 4. P06-T01 plan relation ve determinism

Sonuç `planId`, `version` ve `fingerprintSha256` taşıyarak extraction sonucunu immutable P06-T01 plan version’a bağlar. Aynı plan ve aynı fixture, aynı field ordering ve normalize edilmiş value dizisiyle sonuçlanır. Bu, process-local deterministic behavior kanıtıdır; distributed repeatability, durable artifact lineage veya live target behavior kanıtı değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/html-selector-engine.test.ts` | Başarılı — 1 dosya / 4 test | Execution boundary, invalid typed limits, CSS/XPath/attribute extraction, bounded errors, no source leak, non-HTML rejection ve sensitive value redaction |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 423 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. URL/HTTP/browser fetch, live target retrieval, browser JavaScript execution veya external network call.
2. Provider/proxy/credential/account/endpoints, queue/worker dispatch, retries, storage/persistence ve raw artifact lifecycle.
3. JSONPath/API extraction; P06-T03 kapsamıdır.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T02, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local fixture parsing contract ve sandbox regression/build kanıtıdır; production extraction veya go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T03 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T02 kabul kriteri"
