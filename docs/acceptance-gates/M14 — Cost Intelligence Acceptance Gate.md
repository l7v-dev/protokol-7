# M14 — Cost Intelligence Acceptance Gate

**Program:** Scraping Platform  
**Milestone / Phase:** M14 / Phase 14 — Cost Intelligence  
**Kapsam:** P14-T01–P14-T08  
**Durum:** Accepted — kullanıcı onaylı, `CONDITIONAL GO`  
**Gate önerisi:** Açık koşullar korunmak üzere `CONDITIONAL GO`

## 1. Gate özeti

M14, backend-only Cost Intelligence reference contract'larını kapsar: immutable usage event vocabulary, effective-date tariff configuration, multi-source metering projection, retry/fallback allocation, job aggregation/cost-per-record, non-dispatching budget decision, internal finance reporting/reconciliation ve sentetik acceptance drill. Phase 14 backlog'u bütün kaynak tüketiminin attributed olması, budget decision'ın kontrollü üretilmesi ve cost attribution zincirinin acceptance testinde tamamlanmasını hedefler.[1]

> M14'teki tüm kabul edilen paketler yalnız process-local ve deterministic reference contract niteliğindedir. Contract'lar raw URL, target/provider detail, payload, record, prompt/model content, credential, token, cookie, authorization, raw error veya serbest metadata taşımaz; live runtime collection, external export, actual close, alert dispatch, job stop, billing, charge veya payment çalıştırmaz.

## 2. P14 acceptance kanıtı

| Task | Contract / kanıt | Durum |
|---|---|---|
| P14-T01 | Usage event modeli ve fixed cost category/unit vocabulary | Accepted |
| P14-T02 | Immutable provider tariff, effective-date versioning ve historical resolve | Accepted |
| P14-T03 | HTTP/browser/proxy/AI/storage/compute non-collecting metering projection | Accepted |
| P14-T04 | Primary/retry/fallback deterministic allocation bucket'ları | Accepted |
| P14-T05 | Job total, category/bucket total ve cost-per-record projection | Accepted |
| P14-T06 | Tenant/project/job budget cap ve non-dispatching alert decision | Accepted |
| P14-T07 | Internal export projection, reconciliation ve non-persisting period-close decision | Accepted |
| P14-T08 | Sentetik Cost Intelligence acceptance drill ve smoke gate | Accepted |

## 3. P14-T08 sentetik cost attribution drill kanıtı

P14-T08, sabit in-memory scope/time üzerinde tüm dokuz usage category'yi üretir; synthetic `USD` tariff version'ını çözer; retry, browser fallback ve proxy fallback allocation bucket'larını oluşturur; job aggregate'i ve budget signalini değerlendirir; tek job üzerinden exact internal reconciliation ve non-persisting `CLOSED` decision üretir.

| Kontrol | Deterministic sonuç | Güvenlik/operasyon sınırı |
|---|---|---|
| Usage vocabulary | 9 fixed category | Live runtime collection veya raw usage capture yok |
| Tariff resolve | Tek synthetic `USD` version | Provider API/import veya currency conversion yok |
| Attribution | Retry/browser/proxy fallback bucket'ları | Retry/fallback seçimi veya execution yok |
| Job aggregate | 9 rated usage; 1.400 micro-cost; 700 micro-cost/record | Invoice/billing/payment yok |
| Budget | Job `BLOCKED` policy signal | Automatic stop veya alert delivery yok |
| Period close | Exact `RECONCILED`; non-persisting `CLOSED` | External export veya accounting close execution yok |

`pnpm test:finops-gate` yalnız `P14-T08 PASS` niteliğinde deterministic sentetik smoke çıktısı üretir. Bu, live cost attribution, actual finance close, billing veya money movement anlamına gelmez.

## 4. Conditional GO açık koşulları

| Açık koşul | Neden gate dışında | Tamamlama kanıtı |
|---|---|---|
| Live metering ve provider meter import | P14-T03 yalnız supplied number projection'ıdır | Controlled production/staging instrumentation, source reconciliation ve missing/late event handling |
| Tariff source ve currency conversion | P14-T02 immutable local configuration'dır | Authorized tariff import, version approval, currency basis/rate source ve audit evidence |
| Durable ledger ve distributed idempotency | Usage, allocation ve aggregates process-localdır | Persistent append-only ledger, concurrency/atomicity, replay/reconciliation ve backup/recovery evidence |
| Budget enforcement ve on-call delivery | P14-T06 yalnız decision üretir | Transactional reservation, human-approved stop, dedup/rate-limit, contact/ack/escalation ve delivery audit |
| External finance export ve accounting close | P14-T07 projection ve close decision yapar | Authorized export, accounting-system reconciliation, period lock, review/approval and audit trail |
| Billing, invoice, charge veya payment | Bilinçli olarak tüm P14 contract'larının dışındadır | Ayrı onaylı payments/billing scope, compliance, financial controls ve E2E evidence |
| Dashboard/frontend | Kullanıcı talimatıyla frontend/UI çalışma yapılmayacaktır | Ayrı kullanıcı onaylı frontend/dashboard scope'u, access control ve UAT evidence |
| Distributed service E2E | Sandbox doğrulaması live dependencies içermez | Kontrollü Postgres/Redis/BullMQ/S3/provider/finance-system integration testleri |

## 5. Nihai kalite kapısı

| Komut | Sonuç | Kanıt niteliği |
|---|---|---|
| `pnpm test:finops-gate` | Başarılı — `P14-T08 PASS` | P14-T08 deterministic sentetik Cost Intelligence smoke gate |
| `pnpm lint && pnpm typecheck` | Başarılı | Static quality kapısı |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 97 dosya / 370 test | Final full regression/build |
| `pnpm test:integration` | Controlled `SKIPPED dependency unavailable.` | Sandbox'ta gerçek DB/queue/storage/provider/finance-system E2E doğrulaması çalışmadı; PASS iddiası değildir |

## 6. Review kararı

P14-T01–P14-T08 kullanıcı tarafından onaylanmıştır. Nihai gate komutları başarılıdır; integration kontrolü controlled `SKIPPED dependency unavailable.` sonucundadır ve gerçek E2E PASS değildir. Kullanıcı onayı ile M14, bu belgede tanımlı açık koşullar korunarak **`Accepted — CONDITIONAL GO`** olarak kapatılmıştır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 14 Cost Intelligence — P14-T01–P14-T08"
