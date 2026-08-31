# M6 — Extraction Engine Acceptance Gate

**Program:** Scraping Platform  
**Milestone:** M6 — Extraction Engine Accepted  
**Durum:** Accepted — `CONDITIONAL GO`  
**Karar:** `CONDITIONAL GO`, kullanıcı onaylı  
**Kapsam:** Backend-only  
**Ön koşul:** M5 Reliability Engine — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Karar özeti

M6 için önerilen karar **`CONDITIONAL GO`**'dur. P06-T01–P06-T08 kapsamında versioned extraction plan, bounded CSS/XPath ve JSONPath execution, cleaner, normalize transform, secret-safe evidence/diagnostics, schema-gated controlled AI adapter ve deterministic acceptance smoke harness tamamlanmıştır.

Bu karar, local deterministic contract ve fixture kanıtlarını kapsar. Gerçek database/Redis/storage/LLM provider E2E, cross-process idempotency, extraction worker orchestration, Schema Engine validation ve production data-plane operasyonları henüz doğrulanmadığından milestone **production-ready veya live-provider-ready değildir**.

> **Gate sınırı:** `CONDITIONAL GO`, Phase 7 Schema Engine tasarımına geçmek için core extraction contract'ının yeterli olduğuna işaret eder; canlı hedeften veri toplanması, dataset publish veya automatic AI action yetkisi vermez.

## 2. M6 exit-criterion matrisi

| Criterion | P06 teslimi | Kanıt | Durum |
|---|---|---|---|
| Immutable plan version | Tenant-scoped version, canonical plan fingerprint, attempt binding | P06-T01 tests | Passed |
| CSS/XPath | Bounded selector execution, attribute selector, required/multiple state | P06-T02 fixtures | Passed |
| JSONPath | Eval-disabled property/index/wildcard subset | P06-T03 fixtures | Passed |
| Raw preservation | Validated raw artifact reference; no raw body in cleaner result | P06-T04 fixtures | Passed |
| Normalization | Whitelist chain, idempotence, raw/normalized trace, redaction | P06-T05 tests | Passed |
| Field diagnostics | Checksum/fingerprint/count based evidence; no value/selector/key leakage | P06-T06 tests | Passed |
| Controlled AI | Untrusted-data boundary, input redaction, strict schema gate, fail closed | P06-T07 fake provider tests | Passed |
| Drift detection | Required selector field disappearance produces safe missing diagnostic | P06-T08 smoke | Passed |
| Regression | Lint, strict typecheck, full test, build | P06-T08 quality run | Passed — 47 dosya / 216 test |

## 3. P06-T08 acceptance smoke kanıtı

`pnpm test:extraction-gate` deterministic acceptance harness olarak eklenmiştir. Harness external network, live provider credential, queue veya storage service kullanmaz.

| Check | Beklenen kanıt |
|---|---|
| `html-cleaner` | Executable DOM elemanları clean output'ta bulunmaz |
| `css-extraction` | Required CSS name ve attribute price değerleri çıkar |
| `normalization` | Currency/decimal chain `1234.50` üretir |
| `diagnostics-no-value-leak` | Diagnostics serialized output raw/normalized product value içermez |
| `jsonpath-extraction` | Wildcard API-style fixture iki ID döndürür |
| `fixture-drift` | Selector değişiminde `REQUIRED_FIELD_MISSING` oluşur |
| `controlled-ai-schema-gate` | Fake provider structured output'u schema gate geçer |

Harness çıktısı `PASS` aldı; yalnız check names ve SHA-256 fingerprint/report ID taşır. Raw source, selector, storage key, cookie, authorization veya provider response content loglanmaz.

## 4. Security/compliance acceptance

| Kontrol | M6 davranışı |
|---|---|
| Tenant isolation | Plan/attempt/diagnostic registry key'leri tenant scoped |
| Private target egress | Phase 2 egress policy sorumluluğunda; extraction yeni egress açmaz |
| Raw secret persistence | Plan/diagnostics/AI trace raw secret tutmaz |
| Selector execution | CSS/XPath/JSONPath data-only; script/eval/filter execution yok |
| Anti-bot/CAPTCHA | Bypass, evasion, automatic escalation yolu yok |
| AI untrusted content | Input data olarak işaretli, action/tool/browser path yok |
| AI output | Schema failure/sensitive content fail closed |
| Extraction drift | Missing required field field-level diagnostic ile görünür |

## 5. Açık koşullar ve M6 sonrası zorunlu doğrulamalar

| Açık koşul | Risk | Kapatma sahibi/bağımlılık |
|---|---|---|
| Postgres repository + migration | Plan/evidence state process restart'ta kaybolur | Backend/Data persistence |
| Redis/BullMQ outbox E2E | Worker flow ve cross-process idempotency doğrulanmamış | Platform/Orchestration |
| S3-compatible storage E2E | Raw artifact checksum/reference gerçek storage üzerinde doğrulanmamış | Storage/Operations |
| Extraction worker wiring | Cleaner → selector → normalizer → diagnostics gerçek attempt lifecycle'ına bağlı değil | Phase 9/worker integration |
| Schema Engine | Field type/quality/publish threshold henüz yok | Phase 7 |
| Live LLM provider | Model contract, cost, rate limit ve provider error E2E yok | AI/FinOps/Provider integration |
| Drift baseline | Real target snapshot, alert threshold ve repair playbook yok | Operations/Observability |
| Production drill | Rollback, retention, incident/recovery practice edilmedi | SRE/Operations |

M5'ten devralınan gerçek Postgres/Redis E2E, durable/distributed state, centralized alerting ve production rollback koşulları da açık kalır.

## 6. Gate sign-off

P06-T08 ve M6 gate kullanıcı tarafından onaylanmıştır. P06-T08 `Accepted — CONDITIONAL GO` olarak işaretlenmiştir. Sıradaki milestone olan **Phase 7 — Schema Engine** ilk bounded paketi, ayrı review döngüsüyle başlatılabilir.

## References

[1]: ./phase-6-extraction-engine-task-board.md "Phase 6 task board"
[2]: ./phase-6-extraction-engine-p06-t01-review.md "P06-T01 extraction plan/versioning"
[3]: ./phase-6-extraction-engine-p06-t02-review.md "P06-T02 CSS/XPath engine"
[4]: ./phase-6-extraction-engine-p06-t03-review.md "P06-T03 JSONPath engine"
[5]: ./phase-6-extraction-engine-p06-t04-review.md "P06-T04 DOM cleaner"
[6]: ./phase-6-extraction-engine-p06-t05-review.md "P06-T05 normalize transforms"
[7]: ./phase-6-extraction-engine-p06-t06-review.md "P06-T06 evidence/diagnostics"
[8]: ./phase-6-extraction-engine-p06-t07-review.md "P06-T07 controlled AI extraction"
[9]: ../../scraping-platform-docs/docs/13-task-register.md "P06-T08 task register"
[10]: ./phase-5-reliability-engine-m5-gate.md "M5 Reliability Engine gate"
