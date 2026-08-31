# P03-B04 — Declarative Browser Action DSL Review

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B04  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P03-B03 — kullanıcı onaylı

## 1. Teslim özeti

Browser action yürütmesi declarative ve allowlisted bir DSL olarak eklendi. `DeclarativeActionExecutor`, kullanıcıdan gelen bilinmeyen action payload'larını önce runtime schema ve policy ile doğrular; yalnız `goto`, `waitForSelector`, `scroll`, `click` ve `fill` action'larını kabul eder. `eval`, arbitrary JavaScript, CDP, shell, file-system ve unrestricted network action'ları action type olarak desteklenmez.

Her action için timeout, toplam action sayısı, total execution deadline, selector boyutu, scroll amount ve fill value byte sınırı uygulanır. Action execution yalnız page adapter sözleşmesi üzerinden yapılır; raw action payload veya fill değeri result summary'de tekrar yayınlanmaz.

> **Temel kural:** Kullanıcı action planı browser runtime'a ayrıcalıklı kod olarak değil, bounded ve doğrulanabilir data olarak girer.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/browser/actions.ts` | Action type, validation, timeout/cancellation ve page adapter execution |
| `test/browser/actions.test.ts` | Valid execution, eval/private URL/selector denial, limits, missing adapter, timeout ve cancellation |
| `docs/phase-3-browser-engine-task-board.md` | Phase 3 task durumu ve kanıt kaydı |

## 3. Desteklenen action sözleşmesi

| Action | Zorunlu alan | Sınır |
|---|---|---|
| `goto` | `url` | HTTP/HTTPS egress ve host allowlist |
| `waitForSelector` | `selector` | Non-empty, max 500 karakter, action timeout |
| `scroll` | `amount` | Non-negative integer, `maxScrollAmount` |
| `click` | `selector` | Selector allowlist, action timeout |
| `fill` | `selector`, `value` | Selector allowlist, `maxFillValueBytes` |

Action plan `maxActions`, `maxActionTimeoutMs` ve `totalTimeoutMs` değerlerini pozitif ve geçerli tam sayılar olarak zorunlu kılar. Action-specific timeout plan maximum'unu aşamaz. Selector null byte veya aşırı uzun değer içeriyorsa plan reddedilir.

## 4. Error ve cancellation davranışı

| Olay | Error code | Retryability |
|---|---|---:|
| Action payload invalid | `BROWSER_ACTION_PLAN_INVALID` | Hayır |
| Action type allowlist dışı | `BROWSER_ACTION_NOT_ALLOWED` | Hayır |
| URL egress policy dışı | `BROWSER_ACTION_NOT_ALLOWED` | Hayır |
| Page adapter capability yok | `BROWSER_ACTION_UNSUPPORTED` | Hayır |
| Action timeout | `BROWSER_ACTION_TIMEOUT` | Evet, üst budget ile |
| External cancellation/total timeout | `BROWSER_ACTION_CANCELLED` | Evet, üst budget ile |
| Page adapter execution failure | `BROWSER_ACTION_FAILED` | Evet, üst budget ile |

Action executor external `AbortSignal` ile cancellation kabul eder. Total timer veya caller signal abort olduğunda yeni action başlatılmaz. Adapter operation'ı signal sözleşmesine alır; timeout oluştuğunda runtime'ın kendi cancellation mekanizmasıyla page operation durdurulmalıdır.

## 5. Güvenlik ve veri minimizasyonu

`goto` action'ı Phase 1 egress policy ile HTTP/HTTPS, credential URL, host allowlist ve private target kontrollerinden geçer. Redirect ve subresource network kontrolleri P03-B05 kapsamında page/network adapter'a uygulanacaktır.

`fill` değerleri page adapter'a geçici olarak verilir; action result yalnız index, type ve duration taşır. Action plan, secret veya session token içeriğini loglamaz ve queue result'a koymaz. Kullanıcı action planı sistem talimatı veya browser privilege olarak yorumlanmaz.

## 6. Test kanıtı

Bu pakette **5 yeni test** eklendi. Testler valid action execution order, page adapter çağrıları, eval-like action rejection, disallowed URL, unsafe selector, action/scroll/fill/timeout limits, missing adapter capability, action timeout ve pre-aborted signal davranışlarını doğrular.

Tam backend regression çalışmasında **24 test dosyası / 117 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler page adapter fake'i kullanır; gerçek Playwright action execution P03-B08 browser environment acceptance'ında doğrulanacaktır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Playwright page adapter | DSL interface hazır, gerçek adapter pending | P03-B08 |
| Network interception | Henüz yok | P03-B05 |
| Screenshot/DOM/PDF capture | DSL `capture` action'ı henüz eklenmedi | P03-B06 |
| Form secret policy | Value result/log'dan çıkarılıyor; secret reference resolver ayrı | Security hardening |
| Browser-to-HTTP fallback | Henüz yok | P03-B07 |
| Action retry execution | Error retryability üst worker budget'ına bırakıldı | P03-B08 |

## 8. Review kararı talebi

P03-B04 declarative browser action DSL ve timeout implementation paketi review'a sunulmuştur. Onay sonrasında P03-B05 network interception, resource/redirect policy ve content limitleri implement edilecektir. Gerçek browser runtime/action adapter ve failure injection M3 gate'e kadar açık koşul olarak kalacaktır.

## References

[1]: ./phase-3-browser-engine-p03-b03-review.md "P03-B03 tenant-isolated BrowserContext/session"
[2]: ./phase-3-browser-engine-p03-b02-review.md "P03-B02 BrowserPool capacity ve cleanup"
[3]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
