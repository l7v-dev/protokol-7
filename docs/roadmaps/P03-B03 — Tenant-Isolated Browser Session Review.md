# P03-B03 — Tenant-Isolated Browser Session Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B03  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B02 — kullanıcı onaylı

## 1. Teslim özeti

Browser session yönetimi `TenantSessionManager` ve `TenantBrowserContextService` ile pool lease sınırına bağlandı. Session reference yalnız `tenantId` ve reference ID ile çözülür; dönen material başka tenant'a aitse uygulanmadan `BROWSER_SESSION_SCOPE_MISMATCH` ile reddedilir. Cookie ve extra HTTP header değerleri yalnız ephemeral context'e uygulanır, queue/log/trace/artifact veya pool state'ine yazılmaz.

Context'e session uygulaması başarısız olursa alınmış browser lease release edilir. Bu sayede yarım veya yanlış scoped session ile browser context açık kalmaz. Cookie kullanımı target policy'de kapalıysa resolver çağrısından önce reddedilir; böylece gereksiz secret çözümlemesi de yapılmaz.

> **Temel kural:** Session reference bir tenant'a aitse yalnız o tenant'ın aktif attempt context'inde geçici olarak kullanılabilir; başka tenant context'ine kopyalanamaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/session.ts` | Tenant session resolver, scope/policy checks ve context apply lifecycle |
| `src/browser/pool.ts` | Browser context cookie/header API adapter boundary |
| `test/browser/session.test.ts` | Apply, missing reference, cross-tenant, cookie policy, forbidden header ve lease rollback testleri |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Session material sözleşmesi

| Alan | Kural |
|---|---|
| `tenantId` | Reference material tenant context ile birebir eşleşmelidir |
| `cookies` | Yalnız `allowCookies=true` ve ephemeral context ile uygulanır |
| `headers` | Caller allowlist'inde olan, browser forbidden olmayan header'lar |
| `referenceId` | Raw value değil opaque reference; resolver sınırında çözülür |
| `session state` | Pool veya queue'da kalıcı tutulmaz |
| `failure` | Missing/scope/policy/apply sınıflı explicit error |

Forbidden browser header'ları `host`, `content-length`, `connection`, `transfer-encoding`, `proxy-authorization`, `cookie` ve `set-cookie` olarak korunur. Cookie session, extra header olarak yeniden yazılamaz; header allowlist'i ayrıca uygulanır.

## 4. Lifecycle ve rollback

| Aşama | Başarı | Hata |
|---|---|---|
| Pool acquire | Lease alınır | Pool error döner |
| Reference resolve | Tenant-scoped material | `BROWSER_SESSION_NOT_FOUND` veya `BROWSER_SESSION_SCOPE_MISMATCH` |
| Policy check | Cookie/header izinli | `BROWSER_SESSION_NOT_ALLOWED` |
| Context apply | Cookie/header ephemeral context'e uygulanır | `BROWSER_SESSION_APPLY_FAILED` |
| Execution | Browser action'a geçilir | Caller cleanup başlatır |
| Apply failure cleanup | — | Lease release zorunlu ve idempotent |

Session apply error'ı oluştuğunda context lease geri bırakılır. Gerçek Playwright context close işlemi P03-B02 pool lifecycle'ı üzerinden tamamlanır. Session resolver'ın cache'lenmesi bu fazda yapılmaz; aynı reference için secret material her attempt'te policy ve tenant scope ile yeniden değerlendirilmelidir.

## 5. Güvenlik ve veri minimizasyonu

Raw cookie ve authorization değerleri yalnız context API çağrısına geçici olarak verilir. Error message reference ID veya safe code taşıyabilir; secret value içeremez. Session material persistent storage'a yazılmayacağı için audit ve observability yalnız reference ID hash'i veya güvenli metadata ile yapılmalıdır.

Tenant context worker envelope'dan gelir ve session resolver'a aynen aktarılır. Payload içindeki farklı tenant ID authoritative kabul edilmez. Session policy kapalıysa secret resolver çağrılmadığından access minimization korunur.

## 6. Test kanıtı

Bu pakette **4 yeni tenant session test** eklendi. Testler tenant-scoped cookie/header apply, missing reference, cross-tenant material, cookie disabled pre-check, forbidden/non-allowlisted header ve session apply failure sonrasında lease release davranışını doğrular.

Tam backend regression çalışmasında **23 test dosyası / 112 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler fake browser context/pool adapter kullanır; gerçek Playwright session state isolation henüz browser binary ile çalıştırılmamıştır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Gerçek Playwright storage state | Context adapter API hazır, gerçek adapter pending | P03-B08 |
| Secret provider | Opaque resolver sözleşmesi hazır, gerçek vault/API yok | Security/provider phase |
| Declarative actions | Henüz yok | P03-B04 |
| Network interception | Henüz yok | P03-B05 |
| Persistent session | Kapsam dışı; ephemeral zorunlu | İleri güvenlik kararı |
| Distributed session revocation | Kapsam dışı | Security hardening |

## 8. Review kararı talebi

P03-B03 tenant-isolated BrowserContext/session policy paketi review'a sunulmuştur. Onay sonrasında P03-B04 declarative page action DSL ve timeout sınırları implement edilecektir. Gerçek browser adapter, session state ve credential provider integration M3 gate'e kadar açık koşul olarak kalacaktır.

## References

[1]: ./phase-3-browser-engine-p03-b01-review.md "P03-B01 Browser runtime, context ve lifecycle"
[2]: ./phase-3-browser-engine-p03-b02-review.md "P03-B02 BrowserPool capacity ve cleanup"
[3]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
