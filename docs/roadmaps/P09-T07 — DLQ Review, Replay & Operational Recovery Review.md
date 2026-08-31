# P09-T07 — DLQ Review, Replay & Operational Recovery Review

**Program:** Scraping Platform  
**Milestone / Phase:** M9 / Phase 9 — Job Orchestration  
**Task:** P09-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, fail-closed recovery reference contract

## 1. Amaç ve kabul sınırı

Bu paket, dead-letter kayıtlarını tenant/job sınırında review edilebilir hale getirir; explicit operatör onayı gerektiren idempotent replay intent ve secret-safe operational recovery audit sağlar. Program task register'ın P09-T07 kabul kriterisi, DLQ replay'in idempotent ve auditli olmasıdır.[1]

> Contract **replay intent** üretir; message dispatch, queue write, otomatik retry, policy bypass veya real operational recovery yürütmez. Intent üzerindeki `dispatchAllowed` ve `allowBypass` alanları sabit biçimde `false` döner.

| Contract yüzeyi | Sağlanan davranış | Fail-closed sınır |
|---|---|---|
| `DlqRecoveryRegistry.register` | Safe DLQ metadata kaydını tenant/job scope ile kaydeder | Aynı dead-letter kimliği, geçersiz kimlik/zaman/failure class ve kapasite aşımı reddedilir |
| `review` | Zaman/kimlik sıralı DLQ review listesi sağlar | Sadece çağrılan tenant/job scope'un kayıtlarını döndürür |
| `createReplayIntent` | Explicit operator approval sonrası deterministic replay intent üretir | Yalnız `TRANSIENT` ve `UNKNOWN` class replay değerlendirilebilir; intent dispatch etmez |
| `recordRecovery` / `auditEvents` | Bir onaylı replay intent için recovery kaydı ve safe audit sağlar | Replay-DLQ eşleşmesi olmadan recovery kaydı yapılamaz |

## 2. DLQ review modeli

`src/orchestrator/dlq-recovery.ts` DLQ kaydında sadece `deadLetterId`, original message referansı, message type, opsiyonel task/attempt referansı, failure class/code ve failure zamanı tutar. Raw queue payload, request/response, URL, selector, credential, cookie, authorization header, session token veya raw provider error bu kayıt modelinde bulunmaz.

Kayıt, failure class'a göre ilk review statusünü deterministik belirler. `TRANSIENT` ve `UNKNOWN` kayıtları `PENDING_REVIEW`; `VALIDATION`, `POLICY`, `AUTHORIZATION`, `ANTI_BOT` ve `CANCELLED` kayıtları `REPLAY_BLOCKED` olur. Böylece CAPTCHA/challenge, WAF/anti-bot, policy veya authorization engelleri replay veya bypass için kullanılmaz.

| Failure class | İlk review durumu | Replay intent | Gerekçe |
|---|---|---|---|
| `TRANSIENT` | `PENDING_REVIEW` | Explicit approval sonrası değerlendirilebilir | Geçici altyapı/iletişim kaynaklı hata sınıfı |
| `UNKNOWN` | `PENDING_REVIEW` | Explicit approval sonrası değerlendirilebilir | Otomatik retry yerine insan review gerekir |
| `VALIDATION` | `REPLAY_BLOCKED` | Reddedilir | Girdi/contract hatası replay ile çözülmez |
| `POLICY` | `REPLAY_BLOCKED` | Reddedilir | Policy block terminaldir |
| `AUTHORIZATION` | `REPLAY_BLOCKED` | Reddedilir | Authorization block terminaldir |
| `ANTI_BOT` | `REPLAY_BLOCKED` | Reddedilir | Challenge/CAPTCHA/WAF bypass yoktur |
| `CANCELLED` | `REPLAY_BLOCKED` | Reddedilir | İptal kararını replay geçersiz kılamaz |

## 3. Replay intent ve idempotency

Replay intent için `operatorId`, `reasonCode` ve `approvedAt` zorunludur. İlk uygun çağrı, tenant/job/dead-letter scope'u ile source referansının SHA-256 fingerprintinden stable idempotency key ve `replayId` türetir. Aynı record için sonraki çağrı yeni intent üretmez; önceki intent'i döndürür ve `REPLAY_INTENT_REUSED` audit olayı üretir.

Intent, original message id, message type, safe scope/referanslar, source fingerprint, idempotency key özeti ve onay metadata'sı taşır. Queue payload, target URL, credentials, raw request/results veya replay dispatch instruction içermez. `dispatchAllowed: false` ve `allowBypass: false` sabitleri, bu contract'ın broker/retry/bypass yetkisi olmadığını açıklar.

## 4. Operational recovery audit

Audit olayları `REPLAY_INTENT_CREATED`, `REPLAY_INTENT_REUSED`, `REPLAY_BLOCKED` ve `RECOVERY_RECORDED` ile sınırlandırılmıştır. Her olay tenant/job/dead-letter scope'u, failure classification/code, zaman ve varsa replay/operator referansını taşır. Recovery kaydı yalnız eşleşen onaylı replay intent ile yapılabilir; invalid/cross-scope referans `DLQ_SCOPE_MISMATCH` ile fail-closed reddedilir.

Lifecycle sözleşmesinin duplicate teslim/transition idempotency ve recovery yaklaşımı bu sınırın temelini oluşturur.[2] Ancak bu paket, gerçek worker recovery veya lease revocation uygulamaz.

## 5. Doğrulama kanıtı

Dar kapsam test paketi `test/orchestrator/dlq-recovery.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/orchestrator/dlq-recovery.test.ts` | Başarılı — 1 dosya / 3 test | Deterministic safe review, approval-gated idempotent intent, policy/auth/anti-bot block ve invalid/cross-scope yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 67 dosya / 280 test | Lint, strict typecheck, tüm regression suite ve production build |

## 6. Bilinçli kapsam dışları

Bu paket, durable veya canlı queue recovery sistemi değildir. Aşağıdakiler özellikle uygulanmamıştır:

1. Redis/BullMQ veya dead-letter queue'dan gerçek kayıt okuma, yazma, move/retry ya da purge.
2. Replay intent'in queue'ya publish edilmesi, worker başlatılması, retry scheduling veya backoff.
3. Otomatik replay, otomatik repair, otomatik policy exception, CAPTCHA/WAF/anti-bot bypass, fingerprint evasion veya credential discovery.
4. Durable DLQ/replay/audit persistence, PostgreSQL migration, API endpoint, notification, scheduler veya frontend/UI.
5. Distributed idempotency, cross-node locking, DLQ retention/pagination, multi-queue ordering veya real operational incident response.

## 7. Review kararı

P09-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P09-T08 — Orchestration Load, Chaos-lite & Acceptance Gate olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 9 task register — P09-T07 kabul kriteri"
[2]: ../../scraping-platform-docs/docs/backend/phase-0-m0-lifecycle-contract.md "Phase 0 lifecycle contract — idempotency ve recovery semantics"
