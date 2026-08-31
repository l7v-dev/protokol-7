# P13-T07 — Telemetry Retention, Access & Completeness Review

**Program:** Scraping Platform  
**Milestone / Phase:** M13 / Phase 13 — Observability  
**Task:** P13-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, bounded, non-destructive telemetry governance reference contract

## 1. Amaç ve kabul sınırı

P13-T07, telemetry retention, erişim ve completeness kontrolü için `telemetry-governance/v1` contract'ını ekler. Phase 13 backlog'undaki kabul ölçütü, telemetry erişiminin role göre sınırlanması ve completeness'in ölçülmesidir.[1] Contract, P13-T01–P13-T06 observability yüzeyleri için saf karar/projection üretir; telemetry sink'ini, kalıcı store'u veya kullanıcı oturumunu yönetmez.

`src/observability/telemetry-governance.ts`, dört sabit telemetry signal'ı tanımlar: `TRACE`, `METRIC`, `STRUCTURED_LOG` ve `ALERT_DECISION`. Her değerlendirme tenant/project scope doğrulamasından geçer. Scope eşleşmiyorsa erişim kararının sonucu fail-closed `SCOPE_MISMATCH` olur.

| Signal | Retention policy | Kaynak contract |
|---|---:|---|
| `TRACE` | 14 gün | P13-T01 / P13-T02 |
| `METRIC` | 30 gün | P13-T03 |
| `STRUCTURED_LOG` | 30 gün | P13-T04 |
| `ALERT_DECISION` | 90 gün | P13-T06 |

Retention review, yalnız `RETENTION_ACTIVE` veya `RETENTION_EXPIRED` kararını ve expiry zamanını döndürür. `allowsDestructiveAction` sabit olarak `false` değerindedir; bu paket telemetry silmez, purge emri üretmez veya legal hold bypass etmez.

## 2. Role-based access ve completeness

Access kararı, serbest permission ya da kullanıcı/contact kimliği taşımaz. Kapalı role sözlüğü yalnız belirli signal türlerine erişim izni üretir; gerçek access token doğrulama, session kurma veya data fetch bu contract'ın dışındadır.

| Role | İzinli telemetry signal'ları |
|---|---|
| `OBSERVABILITY_READER` | `METRIC`, `ALERT_DECISION` |
| `SRE_OPERATOR` | `TRACE`, `METRIC`, `STRUCTURED_LOG`, `ALERT_DECISION` |
| `SECURITY_AUDITOR` | `STRUCTURED_LOG`, `ALERT_DECISION` |
| `DATA_QUALITY_READER` | `METRIC`, `ALERT_DECISION` |

Completeness kontrolü her dört signal için exactly-once boolean observation ister. Eksik veya `false` observation, yalnız kapalı signal isimleriyle `missingSignals` alanında görünür. Raw trace/log/metric/alert content, payload, URL, job/task/attempt identifier, record, credential, token, cookie, authorization veya ham hata mesajı giriş/çıkışta yer almaz.

| Fail-closed koşul | Sonuç |
|---|---|
| Geçersiz tenant/project safe identifier | `TELEMETRY_GOVERNANCE_INVALID` |
| Geçersiz signal veya role | `TELEMETRY_GOVERNANCE_INVALID` |
| Geçersiz/ters zaman sırası | `TELEMETRY_GOVERNANCE_INVALID` |
| Observation sayısının dört olmaması | `TELEMETRY_GOVERNANCE_INVALID` |
| Duplicate veya boolean olmayan observation | `TELEMETRY_GOVERNANCE_INVALID` |

> Bu contract karar üretir; herhangi bir telemetry verisini silmez, retrieve etmez, export etmez veya saklamaz. Gerçek authorization enforcement, sink retention job'ı ve telemetry store erişimi ayrı, açıkça onaylı bir implementation paketi gerektirir.

## 3. Doğrulama kanıtı

Dar kapsam test paketi `test/observability/telemetry-governance.test.ts`, fixed retention expiry, non-destructive outcome, role/scope isolation, missing signal projection ve malformed governance input red yollarını doğrulamıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/observability/telemetry-governance.test.ts` | Başarılı — 1 dosya / 3 test | Retention, role/scope access ve bounded completeness kontrolü |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 88 dosya / 343 test | Lint, strict typecheck, tam regression suite ve production build kalite kapısı |

## 4. Bilinçli kapsam dışları

1. Telemetry purge/silme, sink retention job'ı, legal hold, durable policy storage, database/Redis/S3 write veya distributed scheduling.
2. Gerçek RBAC/auth token/session kontrolü, telemetry query/read API, tenant data fetch, data export veya cross-tenant access.
3. Grafana/dashboard, UI, P13-T05 frontend/dashboard işi, alert dispatch veya on-call integration.
4. Raw trace/log/metric/alert content, payload, URL, job/task/attempt id, record, secret, credential, token, cookie, authorization, raw error veya serbest label capture.
5. Policy/auth/anti-bot/CAPTCHA/WAF bypass, fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 5. Review kararı

P13-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Bu sonuç yalnız process-local, deterministic reference contract ve sandbox regression/build doğrulamasını kanıtlar; gerçek telemetry sink retention, RBAC/session enforcement, database/Redis/S3, distributed service E2E doğrulaması veya production readiness iddiası değildir. Sıradaki bounded paket P13-T08 — Observability Acceptance & Incident Drill olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 13 — Observability, P13-T07 kabul kriteri"
