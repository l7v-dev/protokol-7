# P06-T08 — Extraction Fixture, Drift/Regression Acceptance ve M6 Gate Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T08  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic, local-reference-only, secret-safe, non-invoking, non-dispatching ve non-releasing extraction acceptance contract

## 1. Amaç ve kabul sınırı

P06-T08, extraction fixture, drift/regression acceptance ve M6 exit gate kabul hedefini karşılar.[1] `evaluateExtractionAcceptance`, caller-provided SHA-256 evidence metadata'sını P06-T01–P06-T07 için sabit sekiz check ile toplar. Her check `PASS` ise `LOCAL_REFERENCE_ACCEPTED`, en az bir check `FAIL` ise `LOCAL_REFERENCE_REJECTED` üretir.

Bu gate yalnız local fixture/reference contract kanıtını sınıflandırır. Real target extraction, provider/model çağrısı, credential/account/endpoint erişimi, artifact storage, external dispatch veya production release yapmaz ve bu davranışların doğrulaması değildir.

## 2. Fixed check seti ve fixture/drift evidence

| Check ID | Local evidence anlamı |
|---|---|
| `IMMUTABLE_PLAN_VERSIONING` | P06-T01 plan/version/fingerprint contract |
| `CSS_XPATH_EXTRACTION` | P06-T02 bounded HTML fixture extraction |
| `JSONPATH_EXTRACTION` | P06-T03 bounded JSON fixture extraction |
| `HTML_CLEANER_ARTIFACT_REFERENCE` | P06-T04 cleaner/reference metadata contract |
| `IDEMPOTENT_NORMALIZATION` | P06-T05 fixed transform lineage contract |
| `DIAGNOSTICS_MINIMIZATION` | P06-T06 value/selector-minimized diagnostics |
| `CONTROLLED_AI_SCHEMA_GATE` | P06-T07 local test-double schema gate |
| `FIXTURE_DRIFT_DETECTED` | Fixture drift'te expected required-field error projection |

Gate input'u 1–128 karakter safe `gateId`, 64-hex plan fingerprint, artifact checksum ve diagnostics report ID ile tam olarak birer kez verilen fixed check setini gerektirir. Eksik/duplicate/unknown check, unsafe identifier veya malformed evidence hash karar üretilmeden `EXTRACTION_ACCEPTANCE_GATE_INVALID` ile fail-closed reddedilir.

## 3. Non-release decision boundary

| Output flag | Değer |
|---|---:|
| Live target validation gerekli | `true` |
| Real model validation gerekli | `true` |
| Production security sign-off gerekli | `true` |
| Target fetch | `false` |
| Provider call | `false` |
| Model invocation | `false` |
| Production release | `false` |

`LOCAL_REFERENCE_ACCEPTED`, yalnız supplied bounded fixture evidence’in tutarlı olduğunu söyler. Production extraction acceptance, runtime release/enablement, real model quality approval, real provider validation veya go-live yetkisi anlamına gelmez.

## 4. Deterministic smoke chain

`test:extraction-gate` scripti şu local fixture chain’ini in-process çalıştırır: P06-T01 HTML plan, P06-T04 cleaner, P06-T02 CSS extraction, P06-T05 normalization, P06-T06 diagnostics minimization, P06-T03 JSONPath wildcard extraction, P06-T02 fixture drift required-field detection ve P06-T07 declared local test-double schema gate. AI fixture provider external model/network/tool/credential kullanmaz; P06-T07 local boundary’sini eksiksiz ilan eder.

Smoke script gate output’unda raw fixture content, selector, clean text, prompt, model output, storage key, credential veya endpoint döndürmez; yalnız status, bounded checks, failed check ID’leri, safe flags ve hash ID’leri içerir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/acceptance-gate.test.ts` | Başarılı — 1 dosya / 3 test | Complete-pass decision, fixed drift failure projection, malformed evidence/incomplete/duplicate check fail-closed davranışı |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm test:extraction-gate` | Başarılı — `LOCAL_REFERENCE_ACCEPTED`, 8 fixed check `PASS` | Deterministic in-process M6 local fixture smoke gate |
| `pnpm test:integration` | `[integration] SKIPPED dependency unavailable.` | Dependency-bounded integration smoke; real provider/target/model E2E değildir |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 114 dosya / 432 test | Nihai full regression ve build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real target/API/browser/provider/model fetch/call, live catalog, credential/account/endpoint, billing/quota, prompt delivery veya external network validation.
2. Real artifact storage, database/Redis/BullMQ/S3 integration, distributed persistence/atomicity, production observability veya release/deployment.
3. Automatic retry/failover/bypass veya anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass ya da unauthorized data collection.
4. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T08, deterministic M6 local-reference gate ve nihai kalite kapısından başarıyla geçmiş; explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. M6, real target/model/provider/external infrastructure evidence ve M15 production security sign-off eksikleri nedeniyle **`Accepted — CONDITIONAL NO-GO`** olarak kapatılmıştır. Bu kayıt production extraction activation, release veya go-live yetkisi vermez.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T08 kabul kriteri"
