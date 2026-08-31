# M10 — AI Strategy Engine Acceptance Gate

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Kapsam:** P10-T01–P10-T08  
**Durum:** Accepted — kullanıcı onaylı, `CONDITIONAL GO`  
**Gate önerisi:** Koşullar korunmak üzere `CONDITIONAL GO`

## 1. Gate özeti

M10, versioned target analysis, deterministic strategy rules, provider-neutral model configuration, explicit policy approval, feedback/outcome versioning, untrusted-content guardrails, per-job budget control ve offline evaluation/rollout criteria contract'larını backend-only olarak kapsar. Phase 10 task register'ın exit gate'i **AI Strategy Guardrailed** olarak tanımlanmıştır.[1]

P10-T08 ile eklenen `offline-strategy-evaluation/v1` contract'ı candidate strategy version'ını deterministic baseline ile caller-supplied safe offline case metadata üzerinden karşılaştırır. Candidate match, baseline regression, drift ve unsafe policy case ölçümleri public/secret-free aggregate olarak hesaplanır. Rollout çıktısı yalnız `ELIGIBLE_FOR_MANUAL_CANARY` veya `HOLD` önerisidir; her iki durumda da `allowDeployment: false` ve `allowWorkerAction: false` kalır.

> M10 kapsamında hiçbir gerçek model/provider çağrısı, target fetch, browser/proxy execution, queue publish, worker dispatch, deployment veya controlled canary rollout gerçekleştirilmemiştir. `CONDITIONAL GO`, yalnız deterministic process-local contract kanıtını ifade eder.

## 2. P10-T08 offline evaluation ve rollout kanıtı

| Kontrol | Deterministic fixture sonucu | Güvenlik sınırı |
|---|---:|---|
| Candidate vs baseline | Candidate `10.000 bps`, baseline `7.500 bps` match | Raw target/model content kullanılmaz |
| Candidate regression | `0 bps` | Toleransı aşarsa `HOLD` |
| Candidate drift | `0 bps` başarılı fixture | Toleransı aşarsa `HOLD` |
| Unsafe policy case | `0` başarılı fixture | Analyzer/prompt/budget policy zayıflarsa `HOLD` |
| Canary recommendation | En çok `500 bps` için `ELIGIBLE_FOR_MANUAL_CANARY` | Explicit approval zorunlu; deploy/action izni yok |
| Unsafe fixture | `HOLD` | Deployment/worker action daima kapalı |

`pnpm test:ai-strategy-gate` harness'ı yukarıdaki baseline comparison, manual-only canary recommendation ve unsafe policy hold kontrollerini çalıştırır. Harness yalnız sabit test fixture metadata'sı kullanır; real dataset, provider response veya production rollout değildir.

## 3. M10 contract kabul yüzeyi

| Task | Kanıt | Durum |
|---|---|---|
| P10-T01 | Versioned, policy-verifiable Target Analyzer contract | Accepted |
| P10-T02 | Deterministic strategy/fallback priority rules | Accepted |
| P10-T03 | Provider-neutral LLM catalog abstraction/model configuration | Accepted |
| P10-T04 | Non-dispatching proposal + explicit policy approval record | Accepted |
| P10-T05 | Immutable strategy versioning ve feedback/outcome impact summary | Accepted |
| P10-T06 | Prompt/data minimization ve untrusted-content guardrails | Accepted |
| P10-T07 | Per-job AI token/latency/invocation budget disable control | Accepted |
| P10-T08 | Offline baseline comparison, drift/safety hold ve manual-only rollout criteria | Accepted |

## 4. Security ve operational boundaries

M10 output'ları raw prompt, target content, model completion, credential, cookie, authorization, token, provider endpoint, queue payload veya worker command taşımaz. P10-T06, untrusted data'yı sistem talimatından ayırır, secret-benzeri text değerlerini redacts eder ve tool/network/prompt persistence yetkisini kapatır. P10-T04 approval kaydı dahi action authorization değildir. P10-T07 bütçe tüketiminde sonraki AI strategy admission'ını fail-closed kapatır.

CAPTCHA/challenge/WAF/anti-bot bypass, stealth/fingerprint evasion, credential discovery, policy override veya automatic bypass retry M10 kapsamı dışındadır ve contract'lar bu eylemler için yetki üretmez.

## 5. Conditional GO açık koşulları

| Açık koşul | Neden gate dışında | Tamamlama kanıtı |
|---|---|---|
| Curated, versioned ve temsil kabiliyeti değerlendirilmiş offline evaluation dataset | Mevcut harness yalnız static test fixture metadata'sıdır | Dataset provenance/version, coverage, privacy review ve benchmark report |
| Live provider catalog/model invocation integration | P10-T03 yalnız provider-neutral catalog contract'ıdır | Secret-safe adapter contract/integration testleri ve live catalog doğrulaması |
| Durable proposal/version/outcome/budget persistence | M10 registry'leri process-local reference'tır | Transactional storage, migration, tenant isolation ve reconciliation kanıtı |
| Atomic distributed budget reservation | Local accounting multi-worker yarışını çözmez | Concurrent worker/fencing/rollback integration testleri |
| Authenticated human policy approval ve audit retention | Approval contract local ve UI/API'sizdir | RBAC, immutable audit, retention ve authorization testleri |
| Controlled canary execution/monitoring/rollback | P10-T08 önerisi non-deployingdir | Explicit operator approval, SLO/alert, rollback/runbook ve monitored rollout evidence |
| Provider/token/latency/billing E2E | Mevcut limits caller-supplied numeric observation'dır | Provider meter reconciliation ve finance/control evidence |

## 6. Nihai kalite kapısı

| Komut | Sonuç | Kanıt niteliği |
|---|---|---|
| `pnpm test:ai-strategy-gate` | Başarılı | P10-T08 deterministic fixture acceptance; no deployment/action |
| `pnpm lint && pnpm typecheck` | Başarılı | Static quality kapısı |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 75 dosya / 304 test | Final full regression/build | 
| `pnpm test:integration` | Controlled `SKIPPED dependency unavailable.` | Sandbox'ta gerçek provider/DB/queue E2E yoktur; PASS iddiası değildir |

## 7. Review kararı

P10-T08 kullanıcı tarafından onaylanmıştır. M10, bu belgedeki açık koşullar korunmak üzere `Accepted — CONDITIONAL GO` olarak kapatılmıştır. Sıradaki bounded paket Phase 11 Dataset Platform kapsamından başlatılacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 — AI Strategy Engine, P10-T01–P10-T08"
