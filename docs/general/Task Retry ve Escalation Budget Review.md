# P05-T05 — Job/Task Retry ve Escalation Budget Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T05  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P05-T04 — review onaylı

## 1. Teslim özeti

P05-T05, retry ve strategy escalation tüketimini tenant/job/task scope'unda sınırlayan `ScopedBudgetRegistry` katmanını ekler. Retry ve escalation ayrı budget türleri olarak tutulur; aynı job içindeki retry tüketimi escalation budget'ını azaltmaz. Budget limiti ilk kullanım sonrasında immutable kabul edilir ve aynı scope için yeni limit gönderilirse configuration conflict üretilir.

HTTP worker retryable failure sırasında scoped retry budget tüketir. Budget mevcutsa result payload'ına kalan birim sayısı eklenir; limit dolduğunda `RETRY_BUDGET_EXCEEDED` terminal sonucu üretilir. Strategy escalation için controller API'si hazırdır; P05-T06 güvenli strategy escalation akışında bu budget'ı tüketmelidir.

> **Temel kural:** Retry veya escalation budget aşımı, policy dışı provider rotation, browser bypass, sınırsız requeue veya anti-bot challenge denemesi başlatmaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/budget.ts` | Tenant/job/task scoped retry ve escalation counter, decision ve validation |
| `src/http/http-client.ts` | `retryBudget`, `retryAttempt` ve `escalationBudget` plan alanları |
| `src/http/reliability.ts` | Default/injectable scoped registry, retry/escalation consume API |
| `src/workers/http-worker.ts` | Retry budget tüketimi, remaining metadata ve exhaustion sonucu |
| `test/http/budget.test.ts` | Retry/escalation ayrımı, tenant isolation, exhaustion ve immutable config |
| `test/http/http-worker.test.ts` | Retryable response ve sonraki retry'da terminal budget exhaustion |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T05 board durumu |

## 3. Budget contract

| Alan | Kural |
|---|---|
| `tenantId` | Zorunlu isolation scope |
| `jobId` | Zorunlu job attribution |
| `taskId` | Task-level budget için opsiyonel; verilirse key'e katılır |
| `kind` | `RETRY` veya `ESCALATION` |
| `maxUnits` | İlk kullanımda kaydedilen non-negative immutable limit |
| `key` | Opsiyonel güvenli partition key; tenant prefix ile izole edilir |
| decision | `allowed`, code, consumed, remaining, maxUnits |

Budget key, tenant + kind + custom key veya job/task scope bileşiminden üretilir. Farklı tenant aynı job/task/key değerlerini kullansa bile counter paylaşmaz. `maxUnits=0` açıkça terminal exhaustion üretir; implicit unlimited budget yoktur.

## 4. Retry worker davranışı

Retryable classifier sonucu geldiğinde worker önce scoped retry budget tüketir. Tüketim başarılıysa mevcut P05-T03 delay metadata'sı (`retryDelayMs`, `retryDelaySource`) korunur ve `retryBudgetRemaining` eklenir. Tüketim reddedilirse worker `RETRY_BUDGET_EXCEEDED` ve `retryable=false` döndürür; yeni delay veya requeue metadata'sı eklemez.

Aynı worker/job/task için birinci retry budget birimi tüketildikten sonra sonraki retry terminalleşir. Bu karar process-local reference registry üzerinde deterministiktir. Dağıtık worker ortamında aynı garantinin Postgres atomic increment/unique scope veya eşdeğer merkezi counter ile sağlanması gerekir.

## 5. Escalation budget sınırı

`HttpReliabilityController.consumeEscalationBudget` ayrı `ESCALATION` counter tüketir. Bu API P05-T06 strategy layer tarafından kullanıldığında escalation sayısı job/task budget'ı içinde kalmalıdır. P05-T05 kendi başına HTTP→browser, direct→proxy veya provider değişimi gerçekleştirmez; yalnız güvenli orchestration kararı için bounded resource sağlar.

Escalation budget'ın tükenmesi `ESCALATION_BUDGET_EXCEEDED` kararıdır. Bu karar terminal strategy result'a çevrilmeli, anti-bot/authentication/policy barrier'ını aşmak için yeni engine veya provider denenmemelidir.

## 6. Security ve cost kontrolü

Budget decision output yalnız tenant/job/task scope, counter ve code alanlarını taşır. Raw URL, response body, authorization, cookie, credential, provider secret veya target query budget state'ine yazılmaz. Budget key caller tarafından verilse dahi tenant prefix olmadan global paylaşım yapılmaz.

P05-B07 cost event'leri budget tüketiminden bağımsız immutable kalır. Budget exhaustion sonrasında yeni proxy/provider usage oluşmamalıdır; oluşmuş event'ler overwrite edilmez. Retry cost, proxy cost ve ileride strategy/LLM cost attribution'ı aynı job/attempt scope'unda ayrı kategoriler olarak raporlanmalıdır.

## 7. Test kanıtı

`test/http/budget.test.ts` içinde **6 test** bulunmaktadır. Testler retry unit tüketimi, exhaustion sonrası over-consume olmaması, retry/escalation ayrımı, tenant/custom key isolation, immutable `maxUnits` configuration, snapshot/clear ve zero-limit validation davranışlarını doğrular.

`test/http/http-worker.test.ts` içinde retryable response'un kalan budget metadata'sı ve aynı job/task için sonraki retry'nin terminalleşmesi doğrulanır. P05-T05 özel testleri lint ve strict typecheck ile başarılıdır. Son tam backend regression sonucu **38 test dosyası / 183 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 8. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Retry budget | Worker'a bağlı process-local scoped counter | Distributed persistence/integration |
| Escalation budget | Controller API hazır; strategy caller yok | P05-T06 |
| Atomicity | In-memory reference implementation | Postgres/Redis atomic counter |
| Budget persistence | Database write yok | M5 gate |
| Cost escalation alarmı | Budget decision var; dashboard yok | P05-T07 |
| Load/chaos | Local deterministic tests | P05-T08 |

## 9. Review kararı talebi

P05-T05 job/task retry ve escalation budget paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T06 güvenli strategy escalation akışı hazırlanacaktır. Bu paket yalnız bounded budget enforcement sağlar; production distributed guarantee veya anti-bot bypass sağlamaz.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance policy"
[4]: ./phase-5-reliability-engine-p05-t03-review.md "P05-T03 backoff/jitter/Retry-After"
[5]: ./phase-5-reliability-engine-p05-t04-review.md "P05-T04 circuit breaker/quarantine"
[6]: ./phase-4-proxy-intelligence-p04-b07-review.md "P04-B07 cost metering"
[7]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
