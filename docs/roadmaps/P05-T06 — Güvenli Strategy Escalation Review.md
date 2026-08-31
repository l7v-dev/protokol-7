# P05-T06 — Güvenli Strategy Escalation Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T06  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P05-T05 — review onaylı

## 1. Teslim özeti

P05-T06, HTTP failure sonucundan güvenli bir sonraki strategy recommendation üreten `StrategyEscalationPolicy` katmanını ekler. Policy yalnız karar ve budget metadata'sı döndürür; browser fallback, proxy rotation, lease acquire, provider seçimi veya target policy değişikliği gerçekleştirmez.

Escalation sırası compliance ile başlar. Authentication, policy, client ve anti-bot barrier sonuçları terminaldir. HTTP content insufficiency, browser izni ve fallback budget varsa `ESCALATE_BROWSER`; transient retryable server/rate-limit/timeout/dependency sonucu browser uygun değilse ve proxy rotation izni varsa `ROTATE_PROXY` önerilebilir. Her öneri ayrı `ESCALATION` budget tüketir.

> **Değiştirilemez kural:** Strategy escalation bir bypass mekanizması değildir. CAPTCHA, WAF, challenge, authentication veya policy block sonucunda başka engine/provider üzerinden gizli geçiş önerilmez.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/strategy-escalation.ts` | Compliance + fallback + escalation budget karar policy'si |
| `src/http/http-client.ts` | Strategy izinleri, fallback budget ve escalation budget plan alanları |
| `src/workers/http-worker.ts` | Retryable/terminal failure payload'ına recommendation metadata'sı |
| `test/http/strategy-escalation.test.ts` | Browser, proxy rotation, terminal, budget ve isolation testleri |
| `test/http/http-worker.test.ts` | 503 → bounded proxy rotation recommendation entegrasyonu |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T06 board durumu |

## 3. Karar matrisi

| Failure/strategy koşulu | Recommendation | Budget | Açıklama |
|---|---|---:|---|
| HTTP content insufficiency + browser izinli + fallback budget > 0 | `ESCALATE_BROWSER` | Escalation tüketir | Güvenli content recovery; anti-bot değil |
| Transient retryable + proxy rotation izinli | `ROTATE_PROXY` | Escalation tüketir | Orchestrator'ın yeni lease/provider policy'sine bırakılır |
| Authentication required | `TERMINAL_BLOCK` | Tüketmez | Credential bypass yok |
| Policy blocked/private target | `TERMINAL_BLOCK` | Tüketmez | Egress policy değiştirilemez |
| Anti-bot/CAPTCHA/challenge | `TERMINAL_BLOCK` | Tüketmez | Bypass veya hidden escalation yok |
| Current strategy `BROWSER` | `NO_ESCALATION` | Tüketmez | Aynı strateji tekrarına izin yok |
| Hiçbir güvenli strategy uygun değil | `NO_ESCALATION` | Tüketmez | Caller terminal/retry policy'sini uygular |
| Escalation budget exhausted | `BUDGET_EXHAUSTED` | Tüketmez | Sınırsız engine/provider denemesi yok |

## 4. Budget ve tenant isolation

Policy, P05-T05 `ScopedBudgetRegistry` ile `tenantId`, `jobId`, opsiyonel `taskId`, kind=`ESCALATION` ve configured key üzerinden çalışır. Browser ve proxy rotation aynı job/task escalation budget'ını paylaşır; bu sayede iki farklı strategy'nin toplam geçiş sayısı bounded kalır.

Karar output'u `action`, `reason`, `consumesBudget`, `budgetRemaining` ve safe compliance summary taşır. Raw URL, response body, cookie, authorization, credential, provider endpoint veya target query decision state'ine yazılmaz. Policy kendisi alternatif provider veya proxy seçmediği için lease/catalog sınırları ayrı kalır.

## 5. HTTP worker entegrasyonu

HTTP worker failure payload'ına `strategyEscalation` metadata'sı yalnız plan'da escalation budget tanımlıysa eklenir. 503 gibi transient retryable response için `allowProxyRotation=true` ve budget bulunduğunda `ROTATE_PROXY` recommendation döner; worker bu recommendation'ı icra etmez. Orchestrator, circuit breaker, proxy selection ve lease policy'lerini tekrar doğrulamadan rotation başlatmamalıdır.

Retry budget exhaustion gerçekleşirse `RETRY_BUDGET_EXCEEDED` terminal sonucu döner ve escalation recommendation tüketilmez. Non-retryable authentication/policy/anti-bot sonucu escalation budget olsa dahi terminal compliance recommendation ile sonuçlanır.

## 6. Anti-bot ve policy guardrail'leri

Shared `AccessCompliancePolicy` ilk karardır. `ANTI_BOT_BARRIER`, `AUTHENTICATION_REQUIRED`, `POLICY_BLOCKED` ve `CLIENT_ERROR` action'ları `TERMINAL_BLOCK` olur. Browser fallback shared never-bypass code listesiyle content insufficiency dışındaki authentication, rate-limit, policy, credential ve anti-bot sonuçlarını reddeder.

P05-T06 herhangi bir CAPTCHA solve, WAF/challenge bypass, fingerprint evasion, unauthorized credential discovery veya private-target access uygulamaz. Açıkça izin verilen content insufficiency browser fallback'i bile ayrı fallback budget, escalation budget ve network policy kontrollerine bağlıdır.

## 7. Test kanıtı

`test/http/strategy-escalation.test.ts` içinde **5 test** bulunmaktadır. Testler safe browser fallback, transient proxy rotation, authentication/policy/anti-bot terminal block, current browser strategy final, escalation exhaustion, no allowed strategy ve tenant isolation davranışlarını doğrular.

`test/http/http-worker.test.ts` içinde 503 failure'ın strategy recommendation olarak dönmesi doğrulanır. Son tam backend regression sonucu **39 test dosyası / 189 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 8. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Strategy execution | Policy recommendation üretir; execution orchestrator'da yok | M5 integration |
| Browser worker integration | HTTP worker metadata üretir; browser worker/queue caller yok | M3 inherited condition |
| Provider rotation | Recommendation var; catalog/lease yeniden seçim caller'a ait | Proxy integration |
| Escalation persistence | Process-local registry | Postgres/Redis atomic state |
| Circuit interaction | P05-T04 ayrı target breaker preflight yapar | M5 integration |
| Audit/metrics | Safe metadata var; dashboard yok | P05-T07 |
| Legal/compliance sign-off | Teknik guardrail testleri var; kurumsal onay ayrıca gerekli | P05-T08 |

## 9. Review kararı talebi

P05-T06 güvenli strategy escalation paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T07 reliability dashboard ve incident runbook güncellemesi hazırlanacaktır. Bu paketin onayı, yalnız bounded recommendation ve bypass'sız compliance karar akışını kapsar; canlı provider rotation veya browser execution başarısı iddiası değildir.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance guardrail policy"
[4]: ./phase-5-reliability-engine-p05-t03-review.md "P05-T03 backoff/jitter/Retry-After"
[5]: ./phase-5-reliability-engine-p05-t04-review.md "P05-T04 circuit breaker/quarantine"
[6]: ./phase-5-reliability-engine-p05-t05-review.md "P05-T05 retry/escalation budget"
[7]: ./phase-4-proxy-intelligence-m4-gate.md "Proxy Intelligence M4 gate"
[8]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
