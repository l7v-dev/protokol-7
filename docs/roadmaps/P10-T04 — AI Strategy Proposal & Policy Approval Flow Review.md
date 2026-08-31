# P10-T04 — AI Strategy Proposal & Policy Approval Flow Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T04  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, non-dispatching proposal and approval contract

## 1. Amaç ve kabul sınırı

P10-T04, deterministik recommendation ile Analyzer ve model configuration referanslarını versioned bir strategy proposal altında bağlar; proposal'ın worker action'a dönüşmesinden önce explicit policy kararı zorunlu tutar. Program task register'ın kabul kriterisi, model/strategy önerisinin policy onayı olmadan worker action'a dönüşmemesidir.[1]

> `POLICY_APPROVED` kararı dahi bir execution talimatı değildir. Karar output'u kesin olarak `actionAllowed: false` ve `allowBypass: false` döner; queue publish, worker dispatch, retry, browser/proxy çalıştırma veya target policy mutasyonu bu contract'ta yoktur.

| Contract yüzeyi | Sağlanan davranış | Fail-closed sınır |
|---|---|---|
| `StrategyProposalRegistry.create` | Analyzer, resolved model config ve deterministic recommendation referansından proposal üretir | Analyzer policy/linked scope/recommendation koşulları sağlanmazsa proposal oluşmaz |
| Proposal idempotency | Canonical scope/reference/candidate/reason/confidence fingerprint'inden proposal id türetir | Aynı input mevcut proposal'ı döndürür; duplicate proposal yaratmaz |
| `decide` | Explicit `APPROVE` veya `REJECT`, approver/reason/time ile kararı kaydeder | İlk karar dışındaki farklı karar conflict; onay worker action değildir |
| `auditEvents` | Proposal oluşturma ve policy kararlarını secret-safe audit event olarak döner | Raw model output/prompt/payload/credential/audit detail taşımaz |

## 2. Proposal lifecycle ve bağlı contract doğrulaması

`src/strategy/proposal-approval.ts`, `strategy-proposal/v1` altında yalnız actionable olmayan recommendation candidate'larını (`HTTP_DIRECT`, `BROWSER_RENDER`, `PROXY_ROTATION`) proposal'a dönüştürür. `NONE` candidate, analyzer policy block, scope mismatch, version mismatch veya confidence sınırı ihlalinde `STRATEGY_PROPOSAL_POLICY_BLOCKED` üretir. Bu kontrol, policy-onaysız/no-action kararının proposal olarak yanlışlıkla devam etmesini engeller.

Proposal oluşturma için aşağıdaki bağlantılar doğrulanır:

| Bağlı kaynak | Doğrulanan koşul |
|---|---|
| Target Analyzer | `target-analyzer/v1`; tenant/project/target scope eşleşmesi; `analysis.policy.allowed: true` |
| Model configuration | `llm-model-config/v1`; tenant/project scope eşleşmesi; yalnız configuration referansı |
| Strategy rules | `strategy-rules/v1`; analysis id eşleşmesi; mandatory policy approval; action/bypass kapalı |
| Proposal input | Bounded scope/id ve 0–10.000 basis point confidence |

Proposal `PENDING_POLICY` durumuyla oluşturulur. Explicit policy kararında `POLICY_APPROVED` veya `POLICY_REJECTED` terminal decision record üretilir. Aynı decision input'u idempotent olarak önceki kararı döndürür; farklı karar/approver/reason conflict olarak reddedilir.

## 3. Güvenlik, tenant isolation ve audit

Proposal anahtarı tenant, project, target, job ve proposal id birleşiminden türetilir. Başka scope'tan aynı proposal id ile karar verme denemesi `STRATEGY_PROPOSAL_SCOPE_MISMATCH` ile reddedilir. Audit event yalnız scope, proposal id, candidate, action, reason code, zaman ve varsa approver id içerir.

Raw target content, URL, request/response, selector, prompt, model output, API key, endpoint, bearer token, credential, cookie, authorization, proxy address, worker detail ya da queue payload proposal veya audit yüzeyine dahil edilmez. Proposal approval akışı CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery, policy override, automatic retry veya action dispatch sağlamaz.

| Audit action | Ne zaman üretilir | Taşımadığı hassas veri |
|---|---|---|
| `PROPOSAL_CREATED` | İlk canonical proposal oluşturulunca | Prompt/model output/raw target veri |
| `POLICY_APPROVED` | Explicit approval kaydedilince | Worker command, queue payload, credential |
| `POLICY_REJECTED` | Explicit reject kaydedilince | Raw policy note veya target payload |

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/proposal-approval.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/proposal-approval.test.ts` | Başarılı — 1 dosya / 3 test | Proposal idempotency/no secret, explicit approval audit/no action authority ve policy-blocked/NONE/cross-scope/conflict yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 71 dosya / 292 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. LLM/model çağrısı, live provider catalog, prompt construction, model response parsing veya tool call.
2. Actual policy engine persistence, authorization integration, human UI, notification veya external approval workflow.
3. Worker action, queue/outbox publish, retry/backoff, browser launch, proxy rotation, HTTP fetch veya target mutation.
4. Durable proposal/decision/audit storage, multi-node concurrency, revision history, pagination veya TTL/retention.
5. CAPTCHA/challenge/WAF/anti-bot bypass, stealth/fingerprint evasion, credential discovery, policy override veya automatic bypass retry.

## 6. Review kararı

P10-T04 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T05 — Feedback, Outcome & Strategy Versioning olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T04 kabul kriteri"
