# P06-T04 — Bounded HTML/DOM Cleaner ve Raw-Artifact Reference Pipeline Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T04  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-fixture-only, tenant/attempt-scoped, secret-safe ve non-fetching cleaner/reference pipeline contract

## 1. Amaç ve kabul sınırı

P06-T04, bounded HTML/DOM cleaner ve raw artifact referanslı parse pipeline’ını fixture testleriyle sunma kabul hedefini karşılar.[1] `HtmlDomCleaner`, caller-provided transient HTML fixture’ını temizlerken yalnız tenant/job/task/attempt-scoped raw artifact **reference metadata**sını lineage olarak taşır. `HtmlParsePipeline`, caller-provided HTTP response body’sini yalnız HTML ise cleaner’a iletir.

Contract raw artifact’i storage’dan okumaz veya storage’a yazmaz. Real target fetch, browser/provider/proxy call, credential kullanımı, queue/worker dispatch, persistence veya external network call yoktur.

## 2. Execution boundary ve raw-artifact reference

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_FIXTURE_ONLY` | Caller-provided transient HTML ile sınırlı |
| `allowsTargetFetch` | `false` | URL/target/HTTP isteği yok |
| `allowsArtifactStorageRead` | `false` | Storage read yok |
| `allowsArtifactStorageWrite` | `false` | Storage write yok |
| `allowsProviderCall` | `false` | Provider/proxy çağrısı yok |
| `allowsBrowserExecution` | `false` | Browser/runtime execution yok |
| `allowsCredentialMaterial` | `false` | Credential materyali kabul edilmez |

Raw artifact reference yalnız `artifactType`, content type, size, checksum ve tenant/job/task/attempt-prefix'li storage key metadata'sını taşır. Reference checksum 64-hex, size non-negative integer ve storage key belirtilen scope prefix’iyle eşleşmelidir. Secret-like storage key veya scope dışı reference `RAW_ARTIFACT_REFERENCE_INVALID` ile fail-closed reddedilir.

## 3. Bounded DOM cleanup ve output minimizasyonu

Cleaner script, style, noscript, template, iframe, object, embed, SVG/canvas, hidden form/control ve hidden/aria-hidden element'lerini kaldırır. Event handler, `srcdoc` ve JavaScript URL attribute’ları temizlenir. Sensitive attribute taşıyan element'ler çıkarılır; sensitive inline value `[REDACTED]` ile değiştirilir.

| Kontrol | Davranış |
|---|---|
| Geçersiz source/output limit | `HTML_CLEANER_OPTIONS_INVALID` exception |
| Source 1 MB default limitini aşar | `HTML_SOURCE_UNSUPPORTED` exception |
| Clean output 750 KB default limitini aşar | `CLEANED_OUTPUT_TOO_LARGE` exception |
| Scope/artifact metadata geçersiz | `RAW_ARTIFACT_REFERENCE_INVALID` exception |
| Non-HTML parse pipeline response | `HTML_SOURCE_UNSUPPORTED` exception |
| Executable/hidden/sensitive content | Remove/redact; raw source output’a eklenmez |

Output raw HTML veya HTTP response body taşımaz; yalnız cleaned HTML/text, source/cleaned checksum'ları, removal/redaction count ve cloned artifact reference metadata döner. Source checksum integrity referansıdır; secret hashleme veya persistent artifact storage değildir.

## 4. Determinism ve tenant lineage

Aynı fixture, scope ve raw artifact reference ile cleaner aynı cleaned content/checksum biçimini üretir. Tenant/job/task/attempt storage-key prefix’i lineage bağını doğrular. Bu contract process-local in-memory behaviordur; real storage object existence, checksum match, authorization, durable lineage veya distributed persistence kanıtı değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/html-cleaner.test.ts` | Başarılı — 1 dosya / 4 test | Execution boundary, typed limits, DOM cleanup/redaction, tenant/attempt artifact lineage, source/output bounds, HTML-only pipeline ve raw response minimizasyonu |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 425 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real storage read/write, artifact persistence, checksum verification against stored object veya durable lineage database.
2. URL/target/browser/API fetch, provider/proxy/credential/account integration, queue/worker dispatch ve external network call.
3. CSS/XPath/JSONPath extraction execution; P06-T02/P06-T03 kapsamındadır. Normalization P06-T05 kapsamındadır.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T04, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local cleaner/reference pipeline contract ve sandbox regression/build kanıtıdır; real artifact infrastructure, production extraction veya go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T05 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T04 kabul kriteri"
