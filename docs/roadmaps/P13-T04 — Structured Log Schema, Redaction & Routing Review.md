# P13-T04 — Structured Log Schema, Redaction & Routing Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded structured logging reference contract

## 1. Amaç ve kabul sınırı

P13-T04, observability kapsamındaki log event'lerini sabit schema, redaction ve deterministic routing kuralları ile güvenli bir downstream logger'a hazırlamak için `structured-log/v1` contract'ını ekler. Phase 13 backlog'u structured log schema, redaction ve log routing teslimini tanımlar.[1] Bu paket, mevcut Fastify/Pino logger'ını veya component çağırıcılarını otomatik patch etmez; yalnız çağıranın güvenle emit edebileceği projection'ı üretir.

`src/observability/structured-logging.ts`, P13-T02'deki altı component ve dokuz operation allowlist'i ile uyumludur. Event seviyesi, outcome ve error code ilişkisi fail-closed doğrulanır. Başarılı operasyon yalnız `INFO`; policy block yalnız `WARN` + `POLICY_BLOCKED`; failure yalnız `ERROR` + allowlisted failure code olarak kayda dönüşebilir.

| Outcome | Level / error code kuralı | Deterministic route |
|---|---|---|
| `SUCCESS` | Yalnız `INFO`; error code yok | `OPERATIONS` |
| `BLOCKED` | Yalnız `WARN` + `POLICY_BLOCKED` | `SECURITY` |
| `FAILURE` | Yalnız `ERROR` + `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`, `TIMEOUT` veya `VALIDATION_FAILED` | `FAILURES` |

## 2. Schema, trace uyumu ve redaction

Her safe record; sözleşme sürümü, doğrulanmış ISO zamanı, sabit level/event/component/operation/outcome, tenant scope ve opsiyonel doğrulanmış P13-T01 trace id/span id/correlation id içerir. Schema raw hedef URL'si, raw job/task/attempt id'si, request/response body, queue payload, extraction record değeri, storage key, credential, cookie, token, authorization veya ham hata metni için alan tanımlamaz.

Attribute girişi `unknown` kabul edilse de output yalnız beş sayısal/boolean anahtara indirgenir: `durationMs`, `httpStatusCode`, `recordsCount`, `redactedFieldCount` ve `retryable`. Merkezi `redactSecrets` fonksiyonu önce secret-bearing key'leri maskeler; sonra allowlist dışındaki tüm attribute'lar tamamen düşürülür. Record, değer ya da `[REDACTED]` placeholder taşımaz; yalnız `droppedAttributeCount` sayısal kanıtını taşır.

| Attribute | Geçerli aralık / tip | Output davranışı |
|---|---|---|
| `durationMs` | Integer, 0–300.000 | Sayısal olarak korunur |
| `httpStatusCode` | Integer, 100–599 | Sayısal olarak korunur |
| `recordsCount` | Integer, 0–100.000 | Sayısal olarak korunur |
| `redactedFieldCount` | Integer, 0–10.000 | Sayısal olarak korunur |
| `retryable` | Boolean | Olduğu gibi korunur |
| Her başka key/değer | Allowlist dışı veya tür/sınır dışı | Output'tan düşürülür; drop sayacına eklenir |

> Contract yalnız safe projection üretir; log sink'i seçmez, ağa veri göndermez, kalıcı log store'a yazmaz, dashboard/alert tetiklemez ve log erişim yetkisi vermez.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/structured-logging.test.ts`, route seçimlerini, secret-bearing/arbitrary attribute drop davranışını ve invalid component-operation, scope, trace, outcome-level-error-code kombinasyonlarının fail-closed reddini kapsar.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/structured-logging.test.ts` | Başarılı — 1 dosya / 3 test | Deterministic route, secret/raw değer non-leak ve validation red yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 86 dosya / 337 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Pino/Fastify veya worker/proxy/extraction/storage source'larına automatic logger instrumentation injection.
2. Log sink network I/O, Kafka/SIEM/OTLP/ELK/Loki/Grafana bağlantısı, durable persistence, retention, encryption, indexleme veya search API.
3. Dashboard, alert/notification, incident/on-call routing, SLO hesaplama veya frontend/UI. P13-T05 dashboard işi Scope Excluded olarak kalır.
4. Raw URL, payload/body, header, cookie, credential, token, session, storage key, record value, raw error/message/stack veya serbest label capture.
5. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override ya da automatic bypass retry.

## 5. Review kararı

P13-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek log sink/SIEM/Loki/ELK/OTLP, Postgres/Redis/BullMQ/S3/provider veya distributed service E2E doğrulaması ya da production readiness iddiası değildir. P13-T05 frontend/dashboard operasyon yüzeyi kullanıcı talimatıyla Scope Excluded olarak kalır. Sıradaki backend-only bounded paket P13-T06 — Alerting olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T04 kabul kriteri"
