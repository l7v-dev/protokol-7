# M6 / Phase 6 — Extraction Engine Exit Gate

**Program:** Scraping Platform  
**Milestone:** M6 / Phase 6 — Extraction Engine  
**Karar durumu:** Accepted — kullanıcı onaylı, `CONDITIONAL NO-GO`  
**Karar türü:** Local-reference-contract exit gate; production release kararı değildir

## 1. Gate hedefi

M6, P06-T01–P06-T08 için immutable plan, bounded fixture extraction, HTML cleaner/reference, normalization, diagnostics, controlled local model-output schema gate ve fixture drift/regression kanıtını bir local-reference contract zincirinde toplar.[1]

## 2. P06 kanıt özeti

| Paket | Local kanıt | Durum |
|---|---|---|
| P06-T01 | Immutable plan/version/fingerprint ve attempt binding | Accepted |
| P06-T02 | Local fixture CSS/XPath extraction | Accepted |
| P06-T03 | Local fixture JSONPath extraction | Accepted |
| P06-T04 | Cleaner ve raw-artifact reference metadata | Accepted |
| P06-T05 | Idempotent normalization ve lineage | Accepted |
| P06-T06 | Secret-safe diagnostics projection | Accepted |
| P06-T07 | Local test-double-only schema-gated AI output | Accepted |
| P06-T08 | Fixture/drift-regression acceptance ve local gate | Accepted |

## 3. Gerçekleştirilen local kanıt

| Kontrol | Gerçek sonuç |
|---|---|
| `pnpm test:extraction-gate` | `LOCAL_REFERENCE_ACCEPTED`; 8 fixed check `PASS` |
| `pnpm test:integration` | `[integration] SKIPPED dependency unavailable.` |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 114 dosya / 432 test, build başarılı |

`LOCAL_REFERENCE_ACCEPTED`, yalnız in-process fixture/reference chain’in supplied bounded evidence ile tutarlı olduğunu gösterir. Integration sonucu dependency availability nedeniyle `SKIPPED` olup real Postgres/Redis/BullMQ/S3, provider, target veya model E2E `PASS` değildir.

## 4. Ön karar ve kesin dış kanıtlar

P06-T08 gate başarılı olursa M6 için yalnız **`CONDITIONAL NO-GO`** önerilir. Production go-live için aşağıdaki dış kanıtlar eksiktir:

| Eksik kanıt | Bu gate’in kapsamı |
|---|---|
| Real target/API/browser extraction | Yok |
| Real model/provider validation | Yok |
| Real Postgres/Redis/BullMQ/S3 veya distributed validation | Yok |
| Real performance/load/chaos behavior | Yok |
| M15 vulnerability scan/pentest/remediation/security sign-off | Yok |
| Production activation/release onayı | Yok |

Bu gate target fetch, provider/model call, credential/account access, storage I/O, deployment veya production release başlatmaz.

## 5. Nihai karar

P06-T08 ve M6 local-reference gate, explicit kullanıcı `onaylandı` kararıyla kabul edilmiştir. M6 **`Accepted — CONDITIONAL NO-GO`** olarak kapatılmıştır. Bu kabul, real target extraction/model/provider validation, external infrastructure evidence veya M15 production security sign-off eksiklerini kapatmaz; production activation/release/deployment ya da go-live yetkisi vermez.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 6 Extraction Engine — M6 work packages"
