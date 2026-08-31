# P03-B02 — Browser Pool, Capacity ve Crash Recovery Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B02  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B01 — kullanıcı onaylı

## 1. Teslim özeti

Browser runtime için provider-agnostic `BrowserPool` implementasyonu eklendi. Pool, runtime launch adapter'ından browser process alır; browser başına context kapasitesini, context başına page kapasitesini ve toplam browser process kapasitesini sınırlar. İlk browser context kapasitesi dolduğunda ve `maxBrowsers` izin veriyorsa yeni browser process açılır.

Her acquire çağrısı benzersiz context lease üretir. Lease tenant, project, job, task ve attempt context options'ını browser adapter'a aktarır; page lease'leri ayrı tutulur ve release işlemleri idempotent'tir. Context creation başarısız olursa browser reset/close edilir. Pool shutdown aktif context'leri kapatır, browser process'lerini graceful close eder ve ikinci close çağrısını güvenli biçimde yoksayar.

> **Temel kural:** Pool kapasitesi paylaşılabilir olsa da BrowserContext, page veya session state tenant'lar arasında paylaşılmaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/pool.ts` | Browser runtime adapter, pool capacity, context/page lease ve cleanup |
| `test/browser/pool.test.ts` | Isolation, multi-process capacity, page limit, launch/context failure ve shutdown testleri |
| `docs/phase-3-browser-engine-p03-b01-review.md` | Onaylanan runtime/context/lifecycle sözleşmesi |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Capacity sözleşmesi

| Kaynak | Konfigürasyon | Aşım davranışı |
|---|---|---|
| Browser process | `maxBrowsers` | `BROWSER_CAPACITY_EXHAUSTED`, retryable |
| Browser başına context | `maxContextsPerBrowser` | Uygun process aranır; yoksa yeni process veya capacity error |
| Context başına page | `maxPagesPerContext` | `BROWSER_PAGE_LIMIT`, terminal |
| Context lease | `leaseId` | Release idempotent; inactive lease page açamaz |
| Pool lifecycle | `close()` | Aktif context/page kaynakları kapanır; tekrar close güvenlidir |

Pool process-local'dir. Phase 3 ilk implementation'ında distributed browser capacity veya Redis lease kullanılmaz; çoklu worker deployment için worker-level capacity ve orchestration policy sonraki hardening kapsamıdır.

## 4. Failure ve recovery davranışı

| Olay | Error code | Retryability | Cleanup |
|---|---|---:|---|
| Browser launch failure | `BROWSER_LAUNCH_FAILED` | Evet | Runtime process oluşmadı |
| Context creation failure | `BROWSER_CONTEXT_FAILED` | Evet | Browser reset ve close denenir |
| Process/context kapasitesi dolu | `BROWSER_CAPACITY_EXHAUSTED` | Evet | Lease verilmez |
| Page kapasitesi dolu | `BROWSER_PAGE_LIMIT` | Hayır | Mevcut page lease'leri korunur |
| Inactive context page request | `BROWSER_CONTEXT_FAILED` | Hayır | Lease zaten released |
| Shutdown | — | — | Context ve browser graceful close |

Browser process crash sinyali runtime adapter tarafından üst katmana bildirildiğinde aktif context'lerin lease state'i invalid hale getirilerek `WORKER_LOST` veya `BROWSER_RUNTIME_LOST` result taxonomy'sine bağlanmalıdır. Bu pool baseline'ı launch/context failure ve cleanup'ı kapsar; gerçek Chromium crash injection P03-B08 acceptance'ında doğrulanacaktır.

## 5. Tenant ve session isolation

Pool `BrowserContextOptions` içindeki tenant/project/job/task/attempt alanlarını kopyalayarak adapter'a aktarır. Pool bu alanları başka bir lease ile birleştirmez. Session, cookie, storage state ve permission isolation'ı gerçek Playwright adapter'ının yeni context oluşturmasıyla sağlanacaktır; pool hiçbir persistent context reuse etmeyecektir.

Raw credential, session token, cookie veya proxy secret pool state'inde tutulmaz. Context options yalnız reference ID taşıyabilir; secret resolution P03-B03 kapsamında ephemeral ve tenant-scoped yapılacaktır.

## 6. Test kanıtı

Browser pool paketi için **5 yeni test** eklendi. Testler iki tenant için ayrı context'leri, ilk browser context kapasitesi dolduğunda ikinci browser process açılmasını, page capacity rejection, page/context release idempotency, launch failure, context creation failure ve shutdown cleanup davranışını doğrular.

Tam backend regression çalışmasında **22 test dosyası / 108 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Bu testler fake runtime adapter kullanır; Playwright/Chromium binary'si sandbox'ta doğrulanmış değildir.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Gerçek Playwright/Chromium adapter | Interface hazır, binary/provider adapter pending | P03-B08 environment acceptance |
| Distributed pool capacity | Process-local | Worker/orchestrator hardening |
| Browser crash signal | Runtime contract'e bırakıldı | P03-B08 failure injection |
| Tenant session state | Context options boundary hazır | P03-B03 |
| Declarative actions | Henüz yok | P03-B04 |
| Network interception | Henüz yok | P03-B05 |
| Screenshot/PDF/DOM artifact | Henüz yok | P03-B06 |

## 8. Review kararı talebi

P03-B02 browser pool, capacity ve cleanup implementation paketi review'a sunulmuştur. Onay sonrasında P03-B03 tenant-isolated context, session policy ve credential reference management paketi hazırlanacaktır. Gerçek browser runtime availability, performance ve crash recovery M3 gate'e kadar açık koşul olarak kalacaktır.

## References

[1]: ./phase-3-browser-engine-p03-b01-review.md "P03-B01 Browser runtime, context ve worker lifecycle"
[2]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
