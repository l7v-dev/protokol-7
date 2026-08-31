# P03-B01 — Browser Runtime, Context ve Worker Lifecycle Sözleşmesi

**Program:** Scraping Platform  
**Milestone:** M3 — Browser Engine Accepted  
**Task:** P03-B01  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** GATE-P02-M2 — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Karar özeti

Browser Engine, HTTP Engine'ın yetersiz kaldığı policy-allowed senaryolar için ayrı bir worker runtime olarak tasarlanır. Runtime Playwright/Chromium instance'ını process sınırında yönetir; her attempt için yeni ve ephemeral bir `BrowserContext` oluşturulur. Context, page ve browser lifecycle'ı başarı, hata, timeout, cancellation ve worker crash yollarında deterministik biçimde kapatılır.

> **Temel kural:** Tenant'lar arasında BrowserContext, page, cookie jar, localStorage, session state, proxy lease veya artifact buffer paylaşılmaz.

Bu task runtime ve sözleşme baseline'ıdır; gerçek browser pool, declarative actions, network interception ve artifact capture sonraki task'larda ayrı review paketleriyle uygulanacaktır.

## 2. Worker sözleşmesi

```ts
export type BrowserTaskPayload = {
  taskType: 'BROWSER_FETCH';
  targetUrl: string;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  totalTimeoutMs: number;
  maxPages: number;
  maxActions: number;
  allowHosts: string[];
  allowBrowser: boolean;
  allowCookies: boolean;
  sessionReferenceId?: string;
  proxyReferenceId?: string;
  actions: DeclarativeBrowserAction[];
};

export interface BrowserWorkerHandler {
  readonly type: 'BROWSER_FETCH';
  readonly version: string;
  canHandle(payload: BrowserTaskPayload): boolean;
  execute(context: BrowserExecutionContext, payload: BrowserTaskPayload): Promise<BrowserTaskResult>;
  cancel(attemptId: string): Promise<void>;
  health(): Promise<BrowserHealthStatus>;
}
```

`BrowserExecutionContext` authoritative tenant, project, target, job, run, task, attempt, correlation, trace ve deadline alanlarını taşır. Browser worker payload'dan tenant context değiştiremez ve job lifecycle state'ini doğrudan güncelleyemez; yalnız result envelope üretir.

## 3. Runtime lifecycle

| Adım | İşlem | Zorunlu kontrol |
|---:|---|---|
| 1 | Worker task envelope parse | Schema version, task type, tenant/attempt context |
| 2 | Browser capacity acquire | Process/pool/page limit ve deadline |
| 3 | BrowserContext create | Ephemeral context, tenant scope, no shared storage |
| 4 | Session/proxy reference resolve | Raw secret yok; policy ve reference health |
| 5 | Page create | Max page ve resource budget |
| 6 | Navigation/action execution | Declarative action allowlist, timeout, cancellation |
| 7 | Network/resource interception | Host, protocol, content type, response bytes |
| 8 | Artifact capture | Tenant-scoped storage, checksum, bounded bytes |
| 9 | Result envelope | Safe summary, artifact reference, correlation/trace |
| 10 | Cleanup | Page, context, lease ve capacity release |

Her adımda oluşan exception normalize edilerek `BROWSER_*` error taxonomy'sine çevrilir. Cleanup exception'ı original execution sonucunu maskelemez; cleanup durumu ayrıca metric/audit alanında gözlemlenir.

## 4. BrowserContext isolation

Context başına yeni cookie jar, localStorage, sessionStorage, cache partition ve permission state oluşturulur. Context bilgisi yalnız tek attempt boyunca yaşar; task tamamlandığında veya timeout olduğunda browser context kapatılır. Persistent user data directory kullanılacaksa attempt ve tenant scope'lu benzersiz path zorunlu tutulur ve cleanup sonrası silinir.

Session state Phase 3'te varsayılan olarak ephemeral'dır. İzinli credential/session reference kullanılsa bile raw cookie, access token, password veya authorization header değeri queue, log, trace, result veya browser artifact'e yazılmaz. Session reference başka tenant'a aitse worker erişimi reddeder.

## 5. Timeout, capacity ve crash davranışı

| Bütçe | Başlangıç değeri | Aşım sonucu |
|---|---:|---|
| Navigation timeout | Target planı | `BROWSER_NAVIGATION_TIMEOUT` |
| Action timeout | Action başına | `BROWSER_ACTION_TIMEOUT` |
| Total attempt timeout | Attempt planı | `BROWSER_TOTAL_TIMEOUT` |
| Max pages | Pool/attempt policy | `BROWSER_PAGE_LIMIT` |
| Max actions | Action planı | `BROWSER_ACTION_LIMIT` |
| Artifact bytes | Storage policy | `BROWSER_ARTIFACT_TOO_LARGE` |
| Resource bytes | Network policy | `BROWSER_RESOURCE_TOO_LARGE` |
| Pool capacity | Runtime config | `BROWSER_CAPACITY_EXHAUSTED` |

Worker process crash olduğunda aktif attempt lease/heartbeat mekanizması tarafından `WORKER_LOST` veya `TIMEOUT` olarak yeniden değerlendirilmelidir. Browser worker result idempotent message key ile üretilir; aynı attempt sonucu iki kez uygulanmamalıdır.

## 6. Declarative execution sınırı

Phase 3 action DSL yalnız tanımlı ve bounded action türlerini kabul eder. Başlangıçta `goto`, `waitForSelector`, `scroll`, `click`, sınırlı `fill` ve `capture` türleri değerlendirilebilir. `eval`, arbitrary JavaScript, shell, file system, raw CDP command ve unrestricted network request action'ları kabul edilmez.

Selector, URL, timeout, scroll amount, form value ve capture kind runtime schema ile doğrulanır. Action listesi toplam sayısı, her action süresi ve total attempt deadline ile çevrilir. Kullanıcı içeriği browser/system instruction olarak yorumlanmaz.

## 7. Health ve observability

Browser runtime aşağıdaki düşük cardinality alanları üretmelidir: worker state, browser version, pool capacity, active contexts, active pages, action result class, navigation result class, duration, blocked resource count, artifact bytes, crash count ve cleanup failure count. URL query, cookie, session value, authorization header, page body ve selector-derived sensitive data loglanmaz.

Health check browser binary availability, launch latency, pool capacity ve graceful close durumunu raporlar. Readiness, browser launch edilemiyorsa veya kapasite circuit'i açık ise başarısız olur; liveness process'in event loop ve worker supervisor durumunu ölçer.

## 8. Test baseline'ı

| Test grubu | Zorunlu senaryolar |
|---|---|
| Runtime | Browser launch/close, version, repeated context create/dispose |
| Isolation | İki tenant'ın cookie/storage/cache/session state ayrımı |
| Limits | Navigation/action/total timeout, page/action/artifact/resource limit |
| DSL | Allowed actions, unsupported eval/CDP/shell rejection |
| Cleanup | Success, error, cancellation, timeout ve crash sonrası cleanup |
| Security | Private redirect/resource, credential redaction, context scope |
| Reliability | Capacity exhaustion, worker lost, duplicate result ve lease release |
| Operations | Health/readiness, metrics, structured log ve rollback fixture |

Playwright/Chromium binary sandbox'ta bulunmuyorsa unit test doubles ve explicit skip davranışı kullanılabilir; bu durum gerçek browser E2E başarısı olarak raporlanmaz. Gerçek browser acceptance için browser binary, OS dependencies ve isolated worker runtime gerekir.

## 9. Açık kararlar

| Konu | P03-B01 kararı | İleri task |
|---|---|---|
| Browser engine | Playwright/Chromium abstraction | P03-B02 |
| Pool model | Bounded process/context/page capacity | P03-B02 |
| Session model | Ephemeral, tenant/attempt scoped | P03-B03 |
| Actions | Declarative allowlist, no eval | P03-B04 |
| Proxy | Provider-neutral reference/lease | P03-B05/P04 |
| Artifact | Private storage metadata | P03-B06 |
| HTTP fallback | Policy/budget controlled | P03-B07 |
| Real browser binary | Environment prerequisite, not yet proven | P03-B08 |

## 10. Review kararı talebi

P03-B01 runtime, context isolation ve worker lifecycle sözleşmesi review'a sunulmuştur. Onay sonrasında P03-B02 browser pool/capacity ve crash recovery implementasyonu hazırlanacaktır. Bu task onaylanmadan browser runtime kodu ve action DSL kapsamı genişletilmeyecektir.

## References

[1]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[2]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Browser Engine kabul seviyesi"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 3 Browser Engine task register"
[4]: ../phase-2-m2-http-engine-gate.md "Phase 2 M2 HTTP Engine gate"
[5]: ./phase-3-browser-engine-task-board.md "Phase 3 Browser Engine task board"
