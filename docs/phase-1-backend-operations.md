# Phase 1 Backend Operations Runbook

**Program:** Scraping Platform  
**Milestone:** M1 — Core Platform MVP  
**Kapsam:** Backend-only  
**Baseline:** GATE-P00-M0 — GO WITH CONDITIONS

## 1. Çalıştırma sırası

Geliştirme ortamında önce PostgreSQL ve Redis bağlantı bilgileri `.env` üzerinden tanımlanır. Ardından dependency kurulumu, migration, kalite kapıları ve server başlatma sırası uygulanır.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test --run
pnpm build
pnpm dev
```

`/health/live` process'in ayakta olduğunu, `/health/database` PostgreSQL bağlantısını, `/health/queue` Redis bağlantısını ve `/api/v1/health/ready` API scope readiness baseline'ını gösterir.

## 2. Ortam politikası

| Ortam | Auth | Storage | Database | Queue | Not |
|---|---|---|---|---|---|
| Local | `test` veya `header` | `memory` veya `filesystem` | Local PostgreSQL | Local Redis | Geliştirici smoke amaçlı |
| Staging | `external` | S3-compatible | Managed PostgreSQL | Managed Redis | Gerçeğe yakın contract/E2E |
| Production | `external` | S3-compatible | Managed PostgreSQL | Managed Redis | Test/header auth yasak |

Production process'i `AUTH_MODE=external` olmadan başlamaz. `STORAGE_MODE=s3` bu repository sürümünde explicit olarak uygulanmamıştır; yanlışlıkla memory/filesystem fallback yapılmaz.

## 3. Migration işletimi

Migration dosyaları sıralı ve versioned'dır. `pnpm db:migrate` uygulanmış version'ları `schema_migrations` tablosundan okur ve yalnız yeni migration'ları transaction içinde çalıştırır. Migration başarısız olursa ilgili transaction rollback edilir; migration version kaydı oluşturulmaz.

Canlı ortamda migration çalıştırmadan önce backup doğrulaması, bağlantı erişimi ve release/change kaydı kontrol edilir. Uygulanmış migration dosyası değiştirilmez; yeni değişiklik yeni version dosyası olarak eklenir.

## 4. Health ve smoke kontrolleri

| Kontrol | Beklenen sonuç | Failure yorumu |
|---|---|---|
| `GET /health/live` | `200`, `data.status=ok` | Process veya listener sorunu |
| `GET /health/database` | `200`, `data.check=postgres` | `503 DEPENDENCY_UNAVAILABLE` ise DB erişim sorunu |
| `GET /health/queue` | `200`, `data.check=redis` | `503 DEPENDENCY_UNAVAILABLE` ise Redis erişim sorunu |
| `pnpm test:smoke` | Tüm smoke testleri geçer | Uygulama contract/policy regression'ı |
| `pnpm lint && pnpm typecheck && pnpm build` | Sıfır hata | Release adayı kalite kapısını geçemedi |

## 5. Güvenlik olayında ilk müdahale

Raw credential, authorization header, cookie, session veya provider secret log/audit/queue/object storage içinde görülürse olay **SEV-1 security incident** olarak açılır. İlgili secret derhal revoke/rotate edilir, etkilenen tenant ve kaynak scope'u belirlenir, erişim logları korunur ve replay/retry durumu kontrol edilir. Olay kaydına raw secret yazılmaz; yalnız secret türü, etkilenen referans ve redaction kanıtı yazılır.

Private/metadata hedefe dış çağrı tespit edilirse iş durdurulur, hedef egress policy ile denylist'e alınır, attempt/job state'i korunur ve SSRF incelemesi açılır. Bu durum otomatik retry edilmez.

## 6. Queue ve outbox olayları

Outbox `PUBLISHING` kayıtları stale kalırsa publisher reconciliation çalıştırılır. Redis kesintisinde outbox kaydı silinmez; publish başarısızlığı `PENDING` ve ileri `available_at` ile retry edilir. DLQ/replay işlemi yalnız yetkili service/operator rolü ile ve change kaydı altında yapılır.

Duplicate queue mesajı beklenen at-least-once davranıştır. `messageId`, idempotency key ve domain state guard'ları sayesinde ikinci etki oluşturulmamalıdır. Duplicate sonucu domain state'i değiştiriyorsa olay açılır.

## 7. Rollback

Kod release'i rollback edilebilir; database migration rollback'i otomatik varsayılmaz. Önce ilgili API/worker deployment'ları önceki image/artifact sürümüne döndürülür. Schema geriye uyumlu değilse ileri migration ile compatibility restore edilir veya onaylı manuel recovery planı uygulanır.

Rollback sonrası `/health/live`, `/health/database`, `/health/queue`, smoke suite ve outbox pending/retry metriği kontrol edilir. Başarısız rollback denemesi incident kaydına eklenir.

## 8. Değişiklik ve onay standardı

Her production değişikliği task ID, owner, reviewer, risk, rollback planı ve doğrulama kanıtı taşımalıdır. Migration, queue envelope, security policy ve lifecycle değişiklikleri en az iki teknik reviewer ve ilgili domain owner onayı olmadan merge edilmez.

## References

[1]: ./phase-1-backend-task-board.md "Phase 1 backend task board"
[2]: ../../scraping-platform-docs/docs/backend/phase-0-m0-deployment-operations.md "M0 deployment and operations baseline"
[3]: ../../scraping-platform-docs/docs/backend/phase-0-m0-backend-security.md "M0 backend security baseline"
[4]: ../../scraping-platform-docs/docs/backend/phase-0-m0-reliability-policy.md "M0 reliability policy"
