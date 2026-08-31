# P06-T07 — Controlled AI Extraction Adapter ve Schema-Gated Output Review

**Program:** Scraping Platform  
**Milestone / Phase:** M6 / Phase 6 — Extraction Engine  
**Task:** P06-T07  
**Durum:** Accepted — explicit kullanıcı onayı alındı  
**Kapsam türü:** Backend-only, deterministic local-test-double, strict schema-gated, secret-safe, non-invoking ve non-dispatching AI extraction reference contract

## 1. Amaç ve kabul sınırı

P06-T07, controlled AI extraction adapter ve schema-gated structured output kabul hedefini karşılar.[1] `ControlledAiExtractionAdapter`, caller-provided local clean-text fixture’ını sabit bir güvenlik instruction’ı ve explicit structured schema ile yalnız declared **local test-double** provider’a verir. Dönen fixture content strict schema validation’dan geçmeden kabul edilmez.

Bu pakette gerçek model/API çağrısı, model catalog discovery, prompt dispatch, account/credential kullanımı, browser/tool call, target fetch, queue/worker dispatch, persistence veya external network call yapılmadı. Built-in model rehberi incelendi; gerçek LLM kullanımı için live catalog discovery ve sunucu-side credential-bound invoker gerekir.[2] Bu koşullar bu bounded paketin dışındadır.

## 2. Execution boundary ve non-invocation garantisi

| Boundary | Sabit değer | Etki |
|---|---:|---|
| `executionMode` | `LOCAL_TEST_DOUBLE_ONLY` | Yalnız declared local fixture provider kabul edilir |
| `allowsExternalModelCall` | `false` | Real model invocation yok |
| `allowsNetworkCall` | `false` | Network/API endpoint çağrısı yok |
| `allowsToolCall` | `false` | Tool/browser action yok |
| `allowsPromptDispatch` | `false` | Harici prompt delivery yok |
| `allowsCredentialMaterial` | `false` | Credential/token/key kabul edilmez |

Provider, `LOCAL_AI_EXTRACTION_PROVIDER_EXECUTION_BOUNDARY` değerini eksiksiz ilan etmelidir. External model call, network call, tool call veya credential material’a izin veren provider constructor aşamasında fail-closed reddedilir; `extract` metodu çağrılmaz. Bu local boundary deklarasyonu runtime sandbox/network enforcement veya production egress policy kanıtı değildir.

## 3. Prompt/data minimizasyonu ve schema gate

System instruction, untrusted texti yalnız data olarak tanımlar; instruction follow, secret reveal, browse, tool call veya schema değişimini yasaklar. Inputtaki sensitive inline value redakte edilir ve input 24.000 karakterle bounded’dir. Output content default 16.000 karakterle bounded’dir.

| Kontrol | Fail-closed sonuç |
|---|---|
| Invalid scope/model/schema/fingerprint | Typed input validation exception |
| Input limit aşımı | `AI_INPUT_TOO_LARGE` |
| Local test-double failure veya response model mismatch | `AI_PROVIDER_FAILURE` |
| Oversized/non-string response content | `AI_PROVIDER_FAILURE` |
| Invalid JSON | `AI_OUTPUT_INVALID_JSON` |
| Unknown/missing/wrong-typed/non-finite field | `AI_OUTPUT_SCHEMA_INVALID` |
| Sensitive string output | `AI_OUTPUT_SENSITIVE` |

Schema yalnız 1–50 field, `string`/`number`/`boolean` fixed type vocabulary, safe identifier key ve optional bounded string max length kabul eder. Additional field, missing required field veya schema drift reddedilir. Trace yalnız request/model ID, plan/schema/artifact fingerprint, character count, output field count ve safe bounded token count taşır; prompt, clean text veya raw model output taşımaz.

## 4. Local provider fixture ve output minimizasyonu

Test paketi `FakeAiProvider` adlı in-process local fixture provider kullanır. Bu provider network, provider account, live model, tool, credential veya endpoint kullanmaz. Provider exception durumunda adapter error detail veya model content döndürmez. Mismatched/untrusted response metadata veya oversized content de `AI_PROVIDER_FAILURE` ile raw content olmadan kapanır.

Bu çalışma local schema-gate ve safety behavior kanıtıdır; real model output quality, token accounting, model latency, cost, provider reliability, prompt injection resistance in production veya model-vendor security assurance kanıtı değildir.

## 5. Doğrulama kanıtı

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/extraction/ai-extraction.test.ts` | Başarılı — 1 dosya / 6 test | Local-only boundary, external-like provider pre-invocation rejection, schema-gated acceptance, data minimization, invalid JSON/schema/sensitive output rejection, injection-as-data, provider failure, bounded input/output ve untrusted response metadata |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 113 dosya / 429 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 6. Bilinçli kapsam dışları

1. Real LLM/model/vendor API, live catalog, account, credential, endpoint, billing, token metering, latency veya provider reliability evidence.
2. External prompt/model dispatch, browser/tool action, target/API fetch, queue/worker/storage integration ve persistence.
3. Production prompt execution, runtime sandbox/egress enforcement, automated retry/fallback, deployment veya go-live.
4. Anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, quota/policy bypass veya unauthorized data collection.
5. Dashboard/frontend/UI ve `/home/ubuntu/scraping-platform-operations-site` projesi.

## 7. Review kararı

P06-T07, nihai tam kalite kapısından başarıyla geçmiş ve explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. Bu paket yalnız local schema-gated model-output reference contract ve sandbox regression/build kanıtıdır; real model integration veya production go-live kanıtı değildir. M15 güvenlik kararının **Accepted — CONDITIONAL NO-GO** kısıtı yürürlüktedir; real vulnerability scan, yetkilendirilmiş pentest, remediation/re-test ve production security sign-off eksikleri bu paketle kapanmaz. P06-T08 yalnız bu kabulden sonra bağımsız bir bounded paket olarak başlatılabilir.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — P06-T07 kabul kriteri"
[2]: /home/ubuntu/skills/builtin-llm-models/SKILL.md "Built-in LLM Models — live catalog ve server-side invocation sınırları"
