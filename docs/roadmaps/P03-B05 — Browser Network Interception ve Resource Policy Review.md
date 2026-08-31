# P03-B05 — Browser Network Interception ve Resource Policy Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B05  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B04 — kullanıcı onaylı

## 1. Teslim özeti

Browser network policy katmanı navigation ve subresource request'lerini ortak ve provider-agnostic bir sözleşme ile kontrol eder. Her request HTTP/HTTPS protocol, host allowlist, port allowlist, private/loopback/link-local/metadata egress, resource type ve redirect policy'den geçer. Her redirect yeni bir request olarak yeniden doğrulanır ve redirect count bounded tutulur.

Response tarafında content type allowlist'i ve response byte limiti uygulanır. Bu katman gerçek Playwright route/response event'lerine bağlanabilecek karar motorudur; P03-B08'de gerçek browser adapter'ı ile network interception E2E olarak doğrulanacaktır.

> **Temel kural:** Browser navigation başarılı olsa bile policy dışı bir subresource erişimi izinli sayılmaz; her kaynak bağımsız olarak doğrulanır.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/network-policy.ts` | Request, response ve redirect karar motoru |
| `test/browser/network-policy.test.ts` | Allow, private/host/port/type denial, content/byte limit ve redirect testleri |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Request policy sözleşmesi

| Alan | Kontrol | Sonuç |
|---|---|---|
| Protocol | HTTP/HTTPS only | `BROWSER_RESOURCE_URL_INVALID` |
| Host | Target allowlist | `BROWSER_RESOURCE_HOST_NOT_ALLOWED` |
| Port | Target port allowlist | `BROWSER_RESOURCE_PORT_NOT_ALLOWED` |
| IP/hostname | Private, loopback, link-local, metadata | `BROWSER_RESOURCE_PRIVATE_BLOCKED` |
| Resource type | document/script/style/image/font/xhr/fetch/media/other | `BROWSER_RESOURCE_TYPE_NOT_ALLOWED` |
| Redirect | allow flag ve max count | `BROWSER_REDIRECT_*` |
| Response bytes | Bounded response body | `BROWSER_RESPONSE_TOO_LARGE` |
| Content type | Explicit content type allowlist | `BROWSER_RESPONSE_CONTENT_TYPE_NOT_ALLOWED` |

`BrowserNetworkPolicy` redirect counter'ı her browser attempt policy instance'ına aittir. Attempt başlangıcında reset edilir; yeni host/port/resource type için request check tekrar çalışır. Policy error'ları terminaldir ve otomatik anti-bot bypass veya sınırsız retry üretmez.

## 4. Playwright adapter bağlantı noktası

Gerçek Playwright adapter'ı aşağıdaki event akışına bağlanmalıdır:

```text
page/request event
  → BrowserNetworkPolicy.checkRequest
  → allow or abort

response event
  → BrowserNetworkPolicy.checkResponse
  → record bounded metadata or abort

redirect/navigation request
  → BrowserNetworkPolicy.checkRedirect
  → revalidate host/port/IP/resource type
```

`checkRequest` sonucu normalized safe URL ve resource type döndürür. Adapter, resolved IP ve socket destination doğrulamasını network hardening koşulu olarak ayrıca uygulamalıdır; hostname allowlist tek başına DNS rebinding riskini ortadan kaldırmaz.

## 5. Test kanıtı

Bu pakette **5 yeni network policy testi** eklendi. Testler allowlisted HTTPS navigation, private/loopback, non-allowlisted host, wrong port, unsupported resource type, unsupported content type, response byte limit, redirect revalidation, redirect count ve redirects disabled senaryolarını doğrular.

Tam backend regression çalışmasında **25 test dosyası / 122 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler policy karar motorunu fake request/response nesneleriyle doğrular; gerçek Playwright interception P03-B08 browser environment acceptance'ına bırakılmıştır.

## 6. Güvenlik ve operasyon sınırları

Browser response body bu policy katmanında queue veya log'a yazılmaz. Response byte ve content type kararı artifact/parser katmanına bounded geçiş sağlar. Sensitive response header, cookie ve authorization değeri observability veya result payload'a aktarılmamalıdır.

Private veya metadata resource request'i görüldüğünde page load başarısız olarak işaretlenebilir, ancak retry policy bunu policy violation olarak terminal tutmalıdır. Redirect host değişimi mevcut target allowlist'i genişletmez. Resource type allowlist'i yalnız güvenilir ve iş için gereken tipleri etkinleştirecek şekilde target policy ile yönetilmelidir.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Gerçek Playwright route hook | Policy adapter hazır, gerçek runtime hook pending | P03-B08 |
| DNS resolution/address pinning | Pending | Browser transport hardening |
| Artifact capture | Henüz yok | P03-B06 |
| HTTP fallback | Henüz yok | P03-B07 |
| Distributed resource budget | Process/attempt-local | Browser operations hardening |
| Response stream abort | Policy decision hazır, runtime abort adapter pending | P03-B08 |

## 8. Review kararı talebi

P03-B05 browser network interception ve resource policy paketi review'a sunulmuştur. Onay sonrasında P03-B06 screenshot, DOM, PDF ve network artifact metadata akışı implement edilecektir. Gerçek Playwright network hook, DNS/socket güvenliği ve response abort davranışı M3 gate açık koşulları olarak kalacaktır.

## References

[1]: ./phase-3-browser-engine-p03-b04-review.md "P03-B04 declarative browser action DSL"
[2]: ./phase-3-browser-engine-p03-b03-review.md "P03-B03 tenant-isolated BrowserContext/session"
[3]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
