# P06-T07 — Controlled AI Extraction Adapter ve Structured Output Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T07  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T06 — kullanıcı onaylı

## 1. Teslim özeti

P06-T07, AI-assisted extraction'ı core extraction/worker davranışından ayıran provider-neutral bir adapter boundary ekler. `ControlledAiExtractionAdapter`, yalnız cleaner'dan gelmesi beklenen bounded text ve explicit `StructuredOutputSchema` kabul eder. Provider response'u JSON parse edilse dahi schema gate geçmeden accepted output'a dönüşmez; publish, queue dispatch, browser action veya storage write bu pakette yapılmaz.

Model girdi metni `UNTRUSTED_DATA` olarak açıkça işaretlenir. Sistem instruction, dış metni instruction değil veri kabul etmeyi; tool/action, browser/network, secret disclosure, schema change veya output dışı content üretmemeyi ister. Prompt-injection shaped text provider'a data olarak iletilir; adapter bu metinden action üretmez.

> **Fail-closed kuralı:** Invalid JSON, schema drift, missing required field, wrong primitive type, non-finite number, sensitive output ve provider failure accepted extraction sonucu üretmez.

## 2. Provider ve structured-output sözleşmesi

| Alan | Davranış |
|---|---|
| Provider boundary | `AiExtractionProvider.extract()` yalnız request/response contract'ı sağlar |
| Model ID | Caller-supplied, güvenli identifier; adapter vendor/model seçimi yapmaz |
| Girdi | Clean text, plan fingerprint, artifact checksum, schema metadata |
| Output schema | En fazla 50 field; `string`, `number`, `boolean`; explicit required flag |
| Extra property | Reddedilir |
| Schema field key | Unique, identifier formatında ve secret-shaped olmayan key |
| String limit | Field tanımlı `maxLength` ile bounded |
| Output | Sadece schema-valid primitive `Record` |
| Trace | Request/model/plan/schema/artifact fingerprint ve token count metadata'sı |

Adapter canlı model SDK'sına doğrudan bağımlı değildir. Güncel model kataloğu kontrol edildi; bununla birlikte P06-T07 testleri fake provider ile yürütülmüş, gerçek model/provider çağrısı yapılmamıştır.

## 3. Data minimization ve untrusted-content sınırı

| Kontrol | Davranış |
|---|---|
| Input kaynağı | `cleanText`; raw HTML/DOM/artifact input API'si yok |
| Input boyutu | Default 24.000 karakter; aşımda `AI_INPUT_TOO_LARGE` |
| Inline secret | Authorization, Bearer token, Set-Cookie, password, API key vb. `[REDACTED]` |
| Secret schema key | Adapter invocation öncesi rejected |
| Sensitive model output | `AI_OUTPUT_SENSITIVE`, content result'a eklenmez |
| Prompt injection | `UNTRUSTED_DATA` olarak isolate edilir; action/tool/browser path yok |
| Provider failure | `AI_PROVIDER_FAILURE`, provider error detail yok |
| Trace | Raw source, selector, storage key, prompt/response text yok |

Input size rejection fail-closed `AiExtractionRejection` döner ve provider çağrısı hiç yapılmaz. Provider'dan gelen raw `content`, accepted result veya rejection payload'ına eklenmez.

## 4. Rejection matrisi

| Kod | Tetikleyici | Sonuç |
|---|---|---|
| `AI_INPUT_TOO_LARGE` | Bounded clean text limiti aşımı | Provider çağrısı yok |
| `AI_PROVIDER_FAILURE` | Provider exception | Fail closed; detail yok |
| `AI_OUTPUT_INVALID_JSON` | JSON parse başarısız | Fail closed |
| `AI_OUTPUT_SCHEMA_INVALID` | Extra/missing field, type drift, finite olmayan number | Fail closed |
| `AI_OUTPUT_SENSITIVE` | Sensitive model output pattern | Fail closed; content yok |

Structural scope, plan/artifact fingerprint veya schema definition hataları invocation öncesinde terminal input validation exception olarak reddedilir. Bu hata tipi API mapping/persistence katmanı bağlandığında mevcut platform error envelope'una dönüştürülecektir.

## 5. Test kanıtı

`test/extraction/ai-extraction.test.ts` dört deterministic fake-provider senaryosu içerir. İlk senaryo schema-valid output, redacted input ve safe trace'i; ikinci senaryo invalid JSON/schema drift/sensitive output fail-closed davranışını; üçüncü senaryo prompt injection text'in untrusted-data olarak taşınmasını ve provider failure redaction'ını; dördüncü senaryo input limit ve unsafe schema key rejection'ını doğrular.

P06-T07 değişiklikleri sonrası tam backend regression sonucu **47 test dosyası / 216 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task/koşul |
|---|---|---|
| Gerçek model çağrısı | Yok; fake provider conformance | Provider integration |
| Prompt/version persistence | Safe trace ile sınırlı | Durable audit/repository |
| Token/cost budget | Provider token metadata passthrough | FinOps/AI strategy |
| Schema Engine validation | Local structured schema gate | Phase 7 integration |
| Dataset publish | Bilinçli olarak yok | Dataset Platform |
| Worker/queue wiring | Bilinçli olarak yok | Orchestration integration |
| Human approval | Automated trigger yok | Strategy/Control Center policy |
| Live DB/Redis/storage E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T07 controlled AI extraction adapter review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T08 fixture, drift ve regression acceptance paketiyle M6 gate hazırlanacaktır. Bu paket gerçek LLM extraction kalitesi, canlı provider başarısı, token maliyeti veya automatic publishing iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan versioning"
[3]: ./phase-6-extraction-engine-p06-t04-review.md "P06-T04 HTML/DOM cleaner"
[4]: ./phase-6-extraction-engine-p06-t05-review.md "P06-T05 normalize transform"
[5]: ./phase-6-extraction-engine-p06-t06-review.md "P06-T06 evidence/diagnostics"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T07 task register"
[7]: ../../skills/builtin-llm-models/SKILL.md "Built-in LLM model guidance"
[8]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
