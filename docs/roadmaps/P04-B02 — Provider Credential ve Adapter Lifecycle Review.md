# P04-B02 — Provider Credential ve Adapter Lifecycle Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B02  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B01 — kullanıcı onaylı

## 1. Teslim özeti

Provider credential lifecycle, opaque `ProviderCredentialReference` ve adapter callback sınırıyla uygulandı. Platform core yalnız `tenantId`, `providerId`, `referenceId` ve monoton version bilgisini görür. Raw username, password, token, client secret veya provider authorization material yalnız credential resolver'dan çözülüp adapter operation callback'i süresince memory'de tutulur.

`ProviderCredentialManager`, resolver çağrısından önce tenant/provider/reference scope doğrular; material bulunamaz veya scope eşleşmezse generic `PROVIDER_CREDENTIAL_INVALID` hatası döner. Credential değeri error message, audit metadata, queue, log, trace veya artifact'e taşınmaz.

> **Temel kural:** Credential hiçbir zaman platform domain nesnesi haline gelmez; yalnız provider adapter invocation sınırında geçici secret material olarak yaşar.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/contracts.ts` | Provider capability, acquire/lease, health ve provider error contract'ı |
| `src/proxy/credentials.ts` | Credential reference, resolver, withCredential scope guard ve in-memory test resolver |
| `test/proxy/credentials.test.ts` | Active resolve, scope denial, missing/invalid, revoke/rotate ve raw secret redaction |
| `docs/phase-4-proxy-intelligence-task-board.md` | Phase 4 task durumu ve kanıt kaydı |

## 3. Credential sözleşmesi

| Alan | Kural |
|---|---|
| `tenantId` | Caller auth tenant context ile birebir eşleşir |
| `providerId` | Lease/provider adapter ile birebir eşleşir |
| `referenceId` | Opaque external secret identifier; raw secret değildir |
| `version` | Rotation lineage için pozitif monoton version |
| material | Resolver callback scope'unda transient; core'a return edilmez |
| revoke | Eski reference resolve edilemez |
| rotate | Yeni version active, eski version revoked |
| error | Generic safe code; secret value içermez |

`withCredential` callback'i provider adapter lifecycle'ının tek secret-visible noktasıdır. Callback sonrası JavaScript string'leri güvenli biçimde wipe edilemediği için production resolver ve adapter kısa ömürlü material, no-log policy ve process isolation kullanmalıdır; bu sınırlama dokümante edilmiştir.

## 4. Scope ve lifecycle davranışı

| Olay | Sonuç |
|---|---|
| Active + doğru tenant/provider | Adapter operation çalışır |
| Farklı tenant | Operation başlamadan terminal invalid credential |
| Farklı provider | Operation başlamadan terminal invalid credential |
| Missing reference | Terminal `PROVIDER_CREDENTIAL_INVALID` |
| Version < 1 veya boş reference | Terminal invalid credential |
| Revoke sonrası resolve | Material dönmez |
| Rotate | Yeni version active; önceki version revoked |
| Adapter error | Error caller'a iletilir; secret değeri normalize edilmez |

Credential reference, proxy lease veya provider health nesnesine raw secret eklenmez. Provider endpoint credential içerse bile safe lease yalnız endpoint host/port, lease ID, expiry, provider/class/geo ve meter reference taşır.

## 5. Security ve operations

Secret resolver external vault/KMS/API adapter'ına bağlanabilir; bu paket in-memory resolver'ı yalnız deterministic test double olarak kullanır. Production'da credential reference access audit edilmeli, revocation cache invalidation ile hızla yayılmalı ve rotation sırasında active lease policy açıkça belirlenmelidir.

Proxy egress policy credential scope ile sınırlı değildir; proxy üzerinden yapılan target navigation, redirect, subresource ve private IP kontrolleri devam eder. Credential invalid veya provider policy refusal anti-bot bypass için tekrar tekrar denenmez.

## 6. Test kanıtı

Bu pakette **4 yeni credential lifecycle testi** eklendi. Testler active scoped resolve, missing/invalid reference, cross-tenant/provider denial, cookie/secret-like material'ın error'lara taşınmaması, revoke ve versioned rotate davranışlarını doğrular.

Tam backend regression çalışmasında **29 test dosyası / 134 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler in-memory resolver kullanır; gerçek vault/KMS/provider adapter integration M4 gate koşuludur.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| External secret provider | Interface/resolver boundary hazır | Provider deployment hardening |
| Provider adapter | Ortak contract hazır, vendor adapter yok | P04-B03/P04-B08 |
| Catalog/geo policy | Henüz yok | P04-B03 |
| Lease/sticky/rotation | Contract alanları hazır | P04-B04 |
| Credential revocation propagation | In-memory baseline | Security/operations hardening |
| Memory zeroization | JS limitation dokümante | Runtime/process hardening |

## 8. Review kararı talebi

P04-B02 provider credential ve adapter lifecycle paketi review'a sunulmuştur. Onay sonrasında P04-B03 proxy catalog, proxy class/geo requirement ve policy model implementation paketi hazırlanacaktır. Gerçek provider credentials hiçbir ortamda bu review paketi içine alınmayacaktır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b01-review.md "P04-B01 ProxyProvider interface ve capability model"
[2]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
