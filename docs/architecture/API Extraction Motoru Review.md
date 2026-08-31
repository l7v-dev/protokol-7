# P06-T03 — JSONPath/API Extraction Motoru Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T03  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T02 — kullanıcı onaylı

## 1. Teslim özeti

P06-T03, immutable `ExtractionPlan` üzerindeki `JSONPATH` field'larını, önceden parse edilmiş JSON/API response value'dan deterministik olarak çıkarır. `JsonPathSelectorEngine`, API'ye istek atmaz; HTTP veya browser aşamasının ürettiği JSON value'yu yalnızca data-only evaluator'a girdi kabul eder. Bu ayrım egress, authentication, rate-limit ve anti-bot kurallarının extraction aşamasında yeniden uygulanmasını veya aşılmasını engeller.

Evaluator property, quoted property, array index ve wildcard navigation içeren **sınırlı JSONPath subset** kabul eder. Filter, script, recursive descent, union/slice ve eval gerektiren ifade biçimleri kabul edilmez. JSONPathPlus çağrısı `eval: false` ile yapılır.

> **Kapsam sınırı:** “API extraction”, yeni bir uzak API çağrısı anlamına gelmez. Engine yalnız mevcut bir API response artifact'inden JSONPath value extraction yapar.

## 2. Uygulanan sözleşme

| Alan | Davranış |
|---|---|
| Girdi | `sourceKind=JSON` immutable plan + parsed JSON value |
| İzinli path | `$`, dot-property, quoted-property, array index, wildcard |
| Eval | `eval: false`; filter/script ifadesi yok |
| Primitive value | String normalize edilir; number/boolean string representation'a çevrilir |
| Object/array value | JSON serialize edilir; sensitive key/value varsa maskelenir |
| Single/multiple | Single field ilk değeri, multiple field bounded tüm değerleri döndürür |
| Required field | Sonuç yoksa `REQUIRED_FIELD_MISSING` |
| Match limiti | Default field başına 100; aşım `MAX_MATCHES_EXCEEDED` |
| Source limiti | Default 1 MB JSON serialization; aşım terminal source rejection |
| Result provenance | plan ID, version, fingerprint ve field-level output |

## 3. Güvenlik ve secret-safety

`authorization`, `cookie`, `credential`, `password`, `secret`, `token` veya `session` içeren JSONPath target'ları `UNSAFE_JSONPATH` olur. Plan layer'ın secret-oriented `outputKey` guardrail'i korunur. Allowed bir public path'ten gelen value, authorization header, Bearer token, Set-Cookie, password veya API key kalıbına benziyorsa `[REDACTED]` döner.

Engine raw JSON source'u loglamaz, persist etmez, telemetry'ye kopyalamaz veya error message içine selector/source content koymaz. Bu paket secret discovery, credential extraction, JSONPath filter execution, network request veya anti-bot bypass yolu sunmaz.

## 4. Error/field sonucu matrisi

| Status/error | Anlam |
|---|---|
| `EXTRACTED` | Normalize edilmiş değer veya bounded value seti bulundu |
| `EMPTY` | Optional field için değer bulunmadı |
| `REDACTED` | Sensitive value/output maskelendi |
| `REQUIRED_FIELD_MISSING` | Required field path'i sonuç döndürmedi |
| `MAX_MATCHES_EXCEEDED` | Field match sayısı limitin üstünde |
| `UNSAFE_JSONPATH` | Sensitive target veya subset dışı path reddedildi |
| `SELECTOR_KIND_UNSUPPORTED` | JSON plan içinde CSS/XPath field kullanıldı |
| `EXTRACTION_SOURCE_UNSUPPORTED` | JSON olmayan plan/source veya source size sınırı |

## 5. Test kanıtı

`test/extraction/jsonpath-engine.test.ts` üç deterministic API-style fixture içerir. İlk senaryo property/index/wildcard JSONPath extraction'ını; ikinci senaryo missing required field, match bound, sensitive target ve filter form reddini; üçüncü senaryo secret-like value redaction, non-JSON plan ve oversized source rejection'ını doğrular.

P06-T03 değişiklikleri sonrası tam backend regression sonucu **43 test dosyası / 202 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| HTTP/API fetch | Bu engine'de yok; Phase 2 HTTP client sorumluluğu | Mevcut HTTP worker integration |
| CSS/XPath | P06-T02'de mevcut | P06-T02 |
| DOM cleaner | Yok | P06-T04 |
| Raw artifact ref | Yok | P06-T04 |
| Transform chain | Basic scalar normalization ile sınırlı | P06-T05 |
| Evidence/diagnostics | Field status/error ile sınırlı | P06-T06 |
| AI extraction | Yok | P06-T07 |
| Persistence/queue wiring | Process-local execution | M6 open condition |
| Live DB/Redis E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T03 JSONPath/API extraction motoru review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T04 HTML/DOM cleaner ve parse pipeline paketi hazırlanacaktır. Onay yalnız bounded local JSONPath execution sözleşmesini kapsar; live API fetch, raw artifact persistence veya production data-plane başarısı iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan versioning"
[3]: ./phase-6-extraction-engine-p06-t02-review.md "P06-T02 CSS/XPath extraction"
[4]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T03 task register"
[5]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
[6]: ./phase-5-reliability-engine-p05-t07-review.md "Reliability telemetry/runbook"
[7]: ./phase-4-proxy-intelligence-operations.md "Operations runbook"
