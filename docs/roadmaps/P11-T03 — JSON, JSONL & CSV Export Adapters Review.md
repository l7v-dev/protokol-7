# P11-T03 — JSON, JSONL & CSV Export Adapters Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T03  
**Durum:** In Review — explicit kullanıcı onayı bekleniyor  
**Kapsam türü:** Backend-only, bounded, AsyncIterable tabanlı, secret-safe export serialization contract

## 1. Amaç ve kabul sınırı

P11-T03, yetkilendirilmiş ve caller-supplied dataset record kaynağını belleğe bütünüyle almadan JSON, JSONL veya CSV text chunk'larına dönüştüren `AsyncIterable` tabanlı export adapter contract'ı sağlar. Program task register'ın kabul kriterisi, büyük dataset'in memory taşmadan export edilmesi ve formatın doğrulanmasıdır.[1]

Bu paket source iterable üzerinde incremental ilerler; source'u materialize etmez, storage/database okumaz, dosya oluşturmaz, HTTP response/delivery yapmaz veya completion event üretmez. Dataset publish durumunun doğrulanması ve export authorization, P11-T04/P11-T07 kapsamına bırakılmıştır.

| Format | Chunk davranışı | Format kuralı |
|---|---|---|
| `JSON` | Başta `[`; her record için gerekli virgülle object chunk; sonda `]` | Geçerli JSON array |
| `JSONL` | Her record için tek JSON object + `\n` | Her satır bağımsız JSON object |
| `CSV` | Bir header chunk'ı; her record için CRLF sonlu satır | Virgül, çift tırnak ve newline RFC-uyumlu escape edilir |

## 2. Bounded streaming ve şema sınırı

`src/dataset/export-adapters.ts`, export request'inde tenant/project scope, dataset version id, format, fixed columns ve `maxRecords` ister. Record'lar yalnız scalar `string | number | boolean | null` değerleri taşıyabilir. Her record, fixed column listesi dışındaki key'ler nedeniyle schema drift olarak reddedilir; output column sırası caller request'inde deterministik olarak tanımlıdır.

Record sayısı en fazla 100.000, column sayısı en fazla 100 ve tek record serialized boyutu en fazla 64 KiB ile bounded tutulur. Source, `maxRecords` sonrasına element üretirse export `DATASET_EXPORT_RECORD_LIMIT_EXCEEDED` ile durur. Bu, full dataset'in in-memory array olarak toplanmasına dayanmayan streaming-oriented bir contract'tır.

## 3. Secret-safe serialization

Sensitive column isimleri (`authorization`, `cookie`, `credential`, `password`, `secret`, `token`, `session`, `apiKey` vb.) request doğrulamasında reddedilir. Record içinde ekstra veya sensitive key bulunduğunda record fail-closed reddedilir. Allowed string değerlerde authorization/Bearer token/cookie/password/API-key biçimindeki text parçaları `[REDACTED]` ile maskelenir.

Adapter export içeriğini, user/worker credential'ını, endpoint'i, queue payload'ını veya delivery durumunu saklamaz. JSON/JSONL/CSV chunk üretimi network, S3, e-posta/webhook delivery, provider/model çağrısı, queue publish veya automatic retry davranışı içermez.

| Hata koşulu | Sonuç |
|---|---|
| Invalid scope/version/export id/format/column listesi | `DATASET_EXPORT_INVALID` |
| Sensitive column veya record schema drift | `DATASET_EXPORT_RECORD_INVALID` |
| Oversized record | `DATASET_EXPORT_RECORD_INVALID` |
| Source `maxRecords` sınırını aşar | `DATASET_EXPORT_RECORD_LIMIT_EXCEEDED` |

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/export-adapters.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/export-adapters.test.ts` | Başarılı — 1 dosya / 3 test | JSON/JSONL/CSV serialization ve CSV escape, lazy source consumption/secret redaction, sensitive column/schema drift/record-limit/scope fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 78 dosya / 313 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Actual HTTP/download stream, file/object storage write, S3 delivery, API response header, signed URL veya completion event.
2. Dataset publish-status/authorization kontrolü, tenant RBAC, export job lifecycle, rate limit veya quota.
3. Parquet, remote delivery, compression, encryption, pagination cursor, resumable export veya retry/backoff.
4. Raw dataset record storage, dedupe/upsert, retention/deletion, audit persistence veya UI.
5. Credential discovery, secret export, policy bypass veya automatic external action.

## 6. Review kararı

P11-T03 nihai tam kalite kapısından başarıyla geçerek explicit kullanıcı review'ına sunulmuştur. Kullanıcı `onaylandı` demeden P11-T04 — Parquet, API & S3 Delivery Capabilities paketi başlatılmayacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T03 kabul kriteri"
