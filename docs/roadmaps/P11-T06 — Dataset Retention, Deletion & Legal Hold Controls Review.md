# P11-T06 — Dataset Retention, Deletion & Legal Hold Controls Review

**Program:** Scraping Platform  
**Milestone / Phase:** M11 / Phase 11 — Dataset Platform  
**Task:** P11-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, secret-safe, non-destructive governance contract

## 1. Amaç ve kabul sınırı

P11-T06, dataset version için tenant/project-scoped retention policy, immutable retention başlangıcı, legal hold lifecycle ve deletion eligibility review sağlar. Program task register'ın kabul kriterisi, silmenin database ve object storage tarafında izlenebilir şekilde tamamlanmasıdır.[1] Bu bounded pakette gerçek silme değil, silmeye uygunluk ve block reason contract'ı uygulanmıştır.

`src/dataset/retention-governance.ts`, retention penceresi dolmuş, active legal hold içermeyen ve `dataset:delete` authorization'ı scope ile eşleşen kayıtlar için yalnız `DELETION_INTENT_READY` döndürür. Intent dahi destructive command değildir: `requiresExplicitApproval: true`, `allowDestructiveAction: false` ve `allowBypass: false` sabittir.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `configurePolicy` | Tenant/project için immutable retention gün sayısını kaydeder | Real configuration service veya policy update workflow yok |
| `registerSubject` | Dataset version retention başlangıcını bağlar | Dataset persistence/status resolution yok |
| `applyLegalHold` / `releaseLegalHold` | Legal hold'a bağlı deletion block lifecycle'ını yönetir | Legal case content veya external legal system verisi yok |
| `reviewDeletion` | Retention/hold/auth kontrolüyle non-destructive intent üretir | Database/object storage delete, queue/outbox veya retry yok |

## 2. Retention ve legal hold kararları

Retention policy 1–36.500 gün arasında bounded'dır. `retentionExpiresAt`, retention başlangıç zamanı artı configured days olarak deterministik hesaplanır. Active hold sayısı sıfır değilse expiry geçmiş olsa dahi `LEGAL_HOLD_ACTIVE` döner. Hold release sonrasında yeni deletion review ile eligibility tekrar değerlendirilir; eski intent herhangi bir destructive eylem tetiklemez.

| Koşul önceliği | Sonuç | External action |
|---|---|---|
| Authorization scope/permission uyumsuz | `AUTHORIZATION_REQUIRED` | Yok |
| Bir veya daha fazla unreleased legal hold | `LEGAL_HOLD_ACTIVE` | Yok |
| Retention expiry henüz gelmedi | `RETENTION_NOT_EXPIRED` | Yok |
| Tüm koşullar sağlandı | `DELETION_INTENT_READY / RETENTION_ELIGIBLE` | Yok; ayrı explicit approval ve executor gerekir |

Policy, subject, hold ve hold release idempotency'si exact input için korunur. Aynı identifier farklı retention/hold/release içeriğiyle tekrar kullanılmaya çalışılırsa conflict üretilir. Böylece retention başlangıcı, legal hold nedeni veya release nedeni sessizce değiştirilemez.

## 3. Tenant isolation, privacy ve no-delete sınırı

Dataset version subject'i tenant/project scope ile anahtarlanır. Başka scope üzerinden subject erişimi `DATASET_RETENTION_SCOPE_MISMATCH` veya `NOT_FOUND` ile reddedilir. Governance output yalnız ID, timestamp, aggregate active-hold count, stable reason ve fingerprint taşır; raw dataset content, object key, bucket/endpoint, retention case metni, secret, credential, cookie, authorization token veya deletion command taşımaz.

> `DELETION_INTENT_READY`, silme yapıldığı veya silme izni verildiği anlamına gelmez. Contract'ın görevi, gerçek executor öncesinde retention/legal hold/auth koşullarını fail-closed biçimde görünür kılmaktır.

Bu paket database row, storage object, lineage, audit veya backup silmez. Object storage provider çağrısı, scheduled retention sweep, retry/DLQ, queue/worker dispatch, webhook/API notification veya policy bypass uygulanmaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/dataset/retention-governance.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/dataset/retention-governance.test.ts` | Başarılı — 1 dosya / 3 test | Retention expiry sonrası non-destructive intent, active/released legal hold block lifecycle, scope/auth/subject/policy/hold conflict fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 81 dosya / 322 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. PostgreSQL/object storage gerçek delete, tombstone, crypto-shredding, backup/replica deletion veya deletion receipt persistence.
2. Durable legal hold/case integration, legal authorization workflow, multi-party approval, retention schedule/cron veya background sweeper.
3. Dataset/model/staging registry runtime integration, cross-store reconciliation, deletion retry/DLQ veya disaster-recovery validation.
4. API/UI, RBAC identity validation, event/outbox/webhook notification veya audit retention implementation.
5. Secret export, credential discovery, legal hold override, retention bypass veya automatic destructive action.

## 6. Review kararı

P11-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P11-T07 — Dataset/Record/Version Query & Export Control API olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 11 Dataset Platform — P11-T06 kabul kriteri"
