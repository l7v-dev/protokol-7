# P04-B04 — Proxy Lease, Sticky Session ve Rotation Lifecycle Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B04  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B03 — kullanıcı onaylı

## 1. Teslim özeti

Proxy lease lifecycle, `ProxyLeaseManager` ile provider adapter ve catalog state arasında merkezi hale getirildi. Acquire sonucu tenant/project/target/job/task/attempt scope'u ile doğrulanır; provider'ın yanlış scope veya provider ID ile döndürdüğü lease kabul edilmez. Lease başarıyla alındığında internal registry'ye clone olarak yazılır ve yalnız safe lease metadata'sı dışarı döndürülür.

Sticky session binding, raw session value yerine tenant/target/job ve caller sticky key üzerinden SHA-256 identifier ile tutulur. Aynı scope'ta aktif sticky lease varsa provider'a yeni acquire gönderilmez. Lease release, quarantine, expiry ve rotation sticky binding'i temizler veya yeni lease'e taşır; operation'lar idempotent olacak şekilde tasarlanmıştır.

> **Temel kural:** Proxy lease bir attempt kaynağıdır; expiry, quarantine veya release sonrası aynı lease yeniden kullanılamaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/lease-manager.ts` | Acquire/release/quarantine/expire/rotate, sticky binding ve audit event |
| `src/proxy/contracts.ts` | Provider ID, proxy ID ve lease lifecycle error taxonomy |
| `test/proxy/lease-manager.test.ts` | Sticky reuse, cross-tenant denial, expiry, quarantine, rotation, provider scope mismatch ve unsupported rotation |
| `docs/phase-4-proxy-intelligence-task-board.md` | Phase 4 task durumu ve kanıt kaydı |

## 3. Lease lifecycle

| İşlem | Kontrol | Sonuç |
|---|---|---|
| Acquire | Provider exists, returned scope/provider match, active and non-expired | Active lease registry |
| Sticky acquire | Same tenant/target/job/sticky key and active lease | Existing lease clone |
| Release | Tenant + lease scope | Provider release, `RELEASED`, sticky removal |
| Expire | `expiresAt <= now` | `EXPIRED`, sticky removal |
| Quarantine | Tenant + lease scope + reason | Provider quarantine, `QUARANTINED`, sticky removal |
| Rotate | Same tenant/attempt, provider supports rotate | Old release, new active lease |
| Wrong scope | Tenant/lease mismatch | `PROXY_LEASE_NOT_FOUND` or `PROXY_STICKY_SCOPE_MISMATCH` |

Lease object endpoint credential içermez. Güvenli metadata provider ID/version, proxy ID, endpoint host/port, class, geo, lease ID, expiry, status ve meter reference ile sınırlıdır. Raw username/password/token provider callback'inden lease manager'a geçmez.

## 4. Sticky ve rotation policy

Sticky binding yalnız request'te `stickyKey` varsa oluşturulur. Binding key tenant, target, job ve caller key hash'inden türetilir; farklı tenant aynı raw value kullansa bile namespace ayrıdır. Expiry, release veya quarantine binding'i kaldırır. Provider rotate desteği yoksa rotation isteği `PROXY_ROTATION_UNSUPPORTED` terminal hatasıyla durur.

Rotation aynı tenant ve attempt scope'unda yürütülür. Provider'dan dönen rotated lease provider ID ve scope ile tekrar doğrulanır. Eski lease registry'de `RELEASED` olur; rotated lease yeni ID ve expiry ile active registry'ye girer. Provider'ın yanlış tenant, project, job veya attempt ile döndürdüğü result kabul edilmez.

## 5. Quarantine ve recovery

Provider failure, target failure, policy, suspected abuse veya manual reason ile quarantine yapılabilir. Quarantine provider adapter'a bildirilir, lease yeni acquire için kullanılamaz ve sticky binding kaldırılır. Provider quarantine failure çağıranı durdurur; platform silent reuse yapmaz.

Expiry reconciliation `expire(now)` ile bounded ve deterministic'tir. Expired lease provider release yerine local state'te `EXPIRED` işaretlenir; provider-specific cleanup P04-B08/operations adapter'ında ayrıca uygulanmalıdır. Orphan lease recovery için persistent lease store, heartbeat ve worker restart reconciliation sonraki hardening koşuludur.

## 6. Audit ve observability

Acquire, release, expire, quarantine ve rotate olayları audit event listesine lease ID, provider ID, tenant ID, attempt ID, reason ve timestamp ile yazılır. Event'lerde endpoint credential, sticky raw value, cookie, authorization veya session secret bulunmaz. Production'da bu event'ler tenant-scoped audit/usage storage'a idempotent olarak aktarılmalıdır.

## 7. Test kanıtı

Bu pakette **5 yeni lease lifecycle testi** eklendi. Testler active sticky reuse, ikinci browser/provider acquire suppression, cross-tenant release denial, idempotent release, expiry ve sticky cleanup, quarantine, same-attempt rotation, provider scope mismatch ve rotation capability denial davranışını doğrular.

Tam backend regression çalışmasında **31 test dosyası / 143 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler fake provider ve in-memory lease registry kullanır; persistent lease store, real provider heartbeat ve external quarantine API M4 gate koşuludur.

## 8. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Catalog reservation | Catalog eligibility baseline | P04-B05/P04-B06 |
| Persistent lease store | In-memory registry | Storage/operations hardening |
| Heartbeat/restart recovery | Expiry method baseline | M4 gate/Orchestration hardening |
| Real provider lease | Provider contract/fake provider | P04-B08/P16 |
| Health score | Henüz yok | P04-B05 |
| Cost attribution | Meter reference baseline | P04-B07 |

## 9. Review kararı talebi

P04-B04 lease, sticky session, rotation, expiry ve quarantine lifecycle paketi review'a sunulmuştur. Onay sonrasında P04-B05 provider/proxy health score ve başarı oranı hesaplama katmanı hazırlanacaktır. Gerçek provider lease, persistent store ve heartbeat/recovery M4 gate'te ayrıca doğrulanacaktır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b03-review.md "P04-B03 proxy catalog ve geo/class policy"
[2]: ./phase-4-proxy-intelligence-p04-b02-review.md "P04-B02 provider credential lifecycle"
[3]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
