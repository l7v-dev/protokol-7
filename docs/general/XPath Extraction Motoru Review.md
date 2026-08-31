# P06-T02 — CSS/XPath Extraction Motoru Review

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Task:** P06-T02  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P06-T01 — kullanıcı onaylı

## 1. Teslim özeti

P06-T02, versioned `ExtractionPlan` üzerinden HTML source'tan deterministic CSS ve XPath değer çıkarımı yapar. `HtmlSelectorEngine`, network, browser, queue veya artifact persistence çalıştırmadan yalnız input source string ve immutable plan üzerinde yürür. Sonuç, plan ID/version/fingerprint ve field-level extracted/empty/error/redacted durumlarını döndürür.

CSS execution server-side Cheerio, XPath execution `@xmldom/xmldom` + `xpath` ile yapılır. Böylece selector yürütmesi browser automation, serbest JavaScript veya untrusted script evaluation'a ihtiyaç duymaz.

> **Değiştirilemez kural:** CSS/XPath selector motoru anti-bot bypass, browser fallback, network isteği, iframe/script çalıştırma ya da selector içine gömülmüş kod yürütme yapmaz.

## 2. Uygulanan sözleşme

| Alan | Davranış |
|---|---|
| Girdi | `sourceKind=HTML` olan immutable extraction plan + HTML string |
| CSS selector | Cheerio ile text extraction; `::attr(attribute)` extension ile attribute extraction |
| XPath selector | XML DOM üzerinde node text veya `::attr(attribute)` extraction |
| Text normalization | Whitespace collapse + trim |
| Single field | İlk normalize edilmiş değer döner |
| Multiple field | Tüm bounded değerler döner |
| Required field | Hiç değer yoksa `REQUIRED_FIELD_MISSING` |
| Match limiti | Default field başına 100; limit aşımında `MAX_MATCHES_EXCEEDED` |
| Source limiti | Default 1 MB UTF-8; limit aşımında terminal source rejection |
| Sonuç | Plan ID/version/fingerprint ve field-level safe result |

Plan output field sırası kullanıcı tanımlı plan sırasını korur. Fingerprint ise field ID sıralı canonical payload üzerinden hesaplanmaya devam eder; bu ayrım user-facing output order ile plan identity stabilitesini birbirinden ayırır.

## 3. Field sonucu ve hata matrisi

| Status/error | Anlam | Raw source/selector davranışı |
|---|---|---|
| `EXTRACTED` | Normalize edilmiş değer bulundu | Yalnız değer döner |
| `EMPTY` | Optional field için değer bulunmadı | Raw source yok |
| `REDACTED` | Secret-like extracted value maskelendi | Değer `[REDACTED]` olur |
| `REQUIRED_FIELD_MISSING` | Required field bulunmadı | Selector/source geri verilmez |
| `MAX_MATCHES_EXCEEDED` | Field match sınırı aşıldı | Değer seti döndürülmez |
| `UNSAFE_SELECTOR_TARGET` | Script/style/iframe vb. hedef reddedildi | Source içeriği yok |
| `SELECTOR_EVALUATION_FAILED` | Invalid veya yürütülemeyen selector | Selector string geri verilmez |
| `EXTRACTION_SOURCE_UNSUPPORTED` | HTML olmayan plan veya source limit aşımı | Raw body saklanmaz |

## 4. Secret ve raw artifact safety

P06-T01 plan contract'ındaki secret-oriented `outputKey` reddi korunmuştur. Engine ayrıca script, style, noscript, iframe, object ve embed target'larını field-level olarak reddeder. Extracted value bir authorization header, Bearer token, Set-Cookie, password veya API key kalıbı taşıyorsa field `REDACTED` olarak döner.

Engine source'u loglamaz, saklamaz, telemetry üretmez veya result içine kopyalamaz. Bu sınırlama raw artifact preservation yerine geçmez; raw artifact reference ve cleaner pipeline P06-T04'te eklenecektir. P06-T02 sadece execution output'unda raw source leakage'ını azaltır.

## 5. Test kanıtı

`test/extraction/html-selector-engine.test.ts` içinde üç fixture senaryosu vardır. İlk senaryo CSS text, CSS attribute ve XPath multiple value extraction'ını; ikinci senaryo required field, field match limit ve unsafe script target reddini; üçüncü senaryo non-HTML plan reddini ve secret-like value redaction'ını doğrular.

P06-T01 testleri plan output sırasını korurken canonical fingerprint'in immutable plan identity için kullanılmasını doğrular. Son tam backend regression sonucu **42 test dosyası / 199 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 6. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| JSONPath/API extraction | Yok | P06-T03 |
| Malformed HTML recovery | Parser library default davranışı; drift strategy yok | P06-T04/P06-T08 |
| DOM cleaner | Yok | P06-T04 |
| Raw artifact reference | Yok | P06-T04 |
| Normalize transform chain | Basic whitespace normalization ile sınırlı | P06-T05 |
| Evidence/diagnostics | Field status/error ile sınırlı | P06-T06 |
| AI extraction | Yok | P06-T07 |
| Persistence/queue wiring | Process-local execution | M6 open condition |
| Live DB/Redis E2E | Sandbox dependency yok | M6 open condition |

## 7. Review kararı talebi

P06-T02 CSS/XPath extraction motoru review'a sunulmuştur. Kullanıcı onayı sonrasında P06-T03 JSONPath/API extraction paketi hazırlanacaktır. Bu paket browser DOM fidelity, raw artifact persistence veya AI extraction başarısı iddia etmez.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan versioning"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T02 task register"
[4]: ./phase-5-reliability-engine-p05-t02-review.md "Compliance guardrail policy"
[5]: ./phase-5-reliability-engine-p05-t07-review.md "Reliability telemetry/runbook"
[6]: ./phase-4-proxy-intelligence-operations.md "Operations runbook"
