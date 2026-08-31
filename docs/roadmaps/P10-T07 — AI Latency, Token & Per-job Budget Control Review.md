# P10-T07 — AI Latency, Token & Per-job Budget Control Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T07  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, deterministic, process-local, non-invocation AI budget contract

## 1. Amaç ve kabul sınırı

P10-T07, tenant/job scope'unda AI invocation sayısı, input token, output token ve latency için bağımsız limitler tanımlar; limitler aşıldığında sonraki AI strategy admission'ını fail-closed devre dışı bırakır. Program task register'ın kabul kriterisi, job başına latency, token ve maliyet görünürlüğü ile limit aşımlarında güvenli disable davranışıdır.[1]

`src/strategy/ai-budget.ts`, gerçek model çağrısı veya faturalama yerine deterministic admission, usage accounting ve aggregate summary sağlar. `costUnits` veya provider price hesabı yapılmaz; P10-T05'in gözlemsel cost-unit görünümü ile P10-T07'nin budget enforcement yüzeyi bilinçli olarak ayrıdır.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `admit` | Bounded requested input/output token tahminini mevcut job bütçesiyle karşılaştırır | Reservation, queue dispatch veya model invocation yapmaz |
| `record` | Usage id, input/output token ve latency metriğini idempotent kaydeder | Raw prompt/completion, provider response veya billing detail saklamaz |
| `snapshot` | Limit, consumed, remaining ve AI strategy enable state özetini döndürür | Process-local; durable/distributed counter değildir |
| Disable control | Invocation/token/latency limitinde sonraki admission'ı reddeder | Mevcut/harici worker'ı durdurmaz veya retry başlatmaz |

## 2. Per-job budget modeli

Budget scope yalnız `tenantId` ve `jobId` içerir. Her scope için `maxInvocations`, `maxInputTokens`, `maxOutputTokens` ve `maxLatencyMs` ilk kullanımda sabitlenir. Aynı scope altında farklı limit verilmesi `AI_BUDGET_CONFIGURATION_CONFLICT` ile reddedilir; böylece in-flight veya geçmiş accounting üzerindeki limit sessizce değiştirilemez.

Usage kaydında `usageId` idempotency anahtarıdır. Aynı `usageId` birebir aynı metric ile tekrar edilirse snapshot değişmez; aynı kimlik farklı metric/time ile verilirse `AI_BUDGET_USAGE_CONFLICT` üretilir. Bu yapı tekrar denemelerinde double-counting riskini bounded process-local contract seviyesinde azaltır.

| Limit / sayaç | Admission etkisi | Limitte disable nedeni |
|---|---|---|
| Invocation count | Kalan invocation `0` ise yeni AI strategy admission reddedilir | `INVOCATION_BUDGET_EXHAUSTED` |
| Input tokens | Talep kalan input tokenı aşarsa admission reddedilir | `INPUT_TOKEN_BUDGET_EXHAUSTED` |
| Output tokens | Talep kalan output tokenı aşarsa admission reddedilir | `OUTPUT_TOKEN_BUDGET_EXHAUSTED` |
| Aggregate latency | Kaydedilen cumulative latency limitte/üstündeyse sonraki admission reddedilir | `LATENCY_BUDGET_EXHAUSTED` |

Latency, model çağrısından sonra bilinebilen bir observation'dır. Bu nedenle record sonrası limitte/üstünde olduğu saptanırsa registry yeni AI strategy admission'ını kapatır; mevcut çağrıyı iptal ettiği veya provider meter/billing doğruladığı iddia edilmez.

## 3. Gizlilik, security ve no-action sınırı

Summary yalnız scope, numeric limit/sayaçlar, remaining değerleri, boolean enable state ve stable disable reason içerir. Prompt, raw target content, model completion, credential, bearer token, endpoint, model/provider response, error payload, user identity, worker id veya queue metadata kabul edilmez veya döndürülmez.

Budget contract'ı model çağrısı, API key kullanımı, provider faturalaması, queue publish, worker dispatch, retry/backoff, policy override veya automation içermez. CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery veya budget aşımını bypass eden fallback sunulmaz.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/ai-budget.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/ai-budget.test.ts` | Başarılı — 1 dosya / 3 test | Deterministic admission/summary, invocation limitinde safe disable ve changed-limit/malformed/cross-scope fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 74 dosya / 301 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Real LLM/provider invocation, live token usage doğrulaması, streamed latency, provider price catalog veya actual billing/charge.
2. Durable PostgreSQL/Redis counter, atomic distributed reservation, multi-worker race/fencing, reconciliation veya spend export.
3. Queue/worker cancellation, admission reservation/settlement, retry/backoff, scheduler veya automatic cost remediation.
4. Prompt/content storage, model response telemetry, PII observability veya dashboard/API/UI.
5. CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery, policy override veya automatic bypass retry.

## 6. Review kararı

P10-T07 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T08 — Offline Evaluation, Drift & Controlled Rollout olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T07 kabul kriteri"
