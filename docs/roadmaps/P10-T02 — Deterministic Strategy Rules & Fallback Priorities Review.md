# P10-T02 — Deterministic Strategy Rules & Fallback Priorities Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T02  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, pure deterministic, non-actionable strategy recommendation contract

## 1. Amaç ve kabul sınırı

P10-T02, aynı Target Analyzer output'u, policy flags ve failure input'u için her zaman aynı strategy recommendation'ını üreten deterministic bir kural contract'ı sağlar. Program task register'ın kabul kriterisi, aynı koşulların aynı strategy kararını üretmesidir.[1]

Bu paket yalnız recommendation üretir. Model çağrısı, browser açma, proxy rotation, target fetch, budget mutation, worker dispatch, retry scheduling veya policy mutation yapmaz. Her output'ta `requiresPolicyApproval: true`, `allowWorkerAction: false` ve `allowBypass: false` sabittir.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `DeterministicStrategyRules.recommend` | Versioned analyzer output + policy + opsiyonel failure üzerinden candidate/reason üretir | Kararı execute etmez veya state tutmaz |
| Primary selection | JavaScript rendering gözleminde policy izinliyse `BROWSER_RENDER`; aksi halde `HTTP_DIRECT` | Bu bir proposal/recommendation'dır; worker action değildir |
| Content fallback | Bounded safe content failure code'larında browser candidate önerir | Authorization/policy/anti-bot/CAPTCHA için asla önermez |
| Transient fallback | Safe transient access class ve izin ile `PROXY_ROTATION` candidate önerir | Rotation gerçekleştirmez; budget harcamaz |
| Terminal behavior | Analyzer policy block veya compliance terminal durumunda `NONE` döner | Bypass, stealth, fingerprint evasion veya automatic retry yoktur |

## 2. Deterministic öncelik sırası

`src/strategy/strategy-rules.ts`, `strategy-rules/v1` input'unu kabul eder ve stable bir `priorityOrder` üretir. Eligible fallback sırası her zaman önce `BROWSER_RENDER`, sonra `PROXY_ROTATION` şeklindedir. Ancak candidate yalnız ilgili güvenli koşul oluştuğunda döner; sıralama, execution yetkisi veya policy override anlamına gelmez.

Başlangıç önerisinde `JAVASCRIPT_RENDERING_OBSERVED` capability signal'i ile browser rendering policy izni birlikteyse `BROWSER_RENDER`; diğer durumda `HTTP_DIRECT` üretilir. Failure durumunda önce never-bypass code kontrolü yapılır. `HTTP_JAVASCRIPT_REQUIRED`, `HTTP_CONTENT_INSUFFICIENT`, `HTTP_EMPTY_CONTENT` ve `UNSUPPORTED_CONTENT_TYPE` dışındaki failure code'ları browser content fallback için kullanılmaz.

| Koşul | Candidate | Reason |
|---|---|---|
| Analyzer policy `allowed: false` | `NONE` | `ANALYZER_POLICY_BLOCKED` |
| Failure yok, JS rendering gözlemi ve browser policy izni var | `BROWSER_RENDER` | `JAVASCRIPT_RENDERING_OBSERVED` |
| Failure yok, diğer geçerli analyzer output | `HTTP_DIRECT` | `DEFAULT_HTTP` |
| Safe content insufficiency + browser izin/availability | `BROWSER_RENDER` | `SAFE_CONTENT_FALLBACK` |
| Safe retryable transient class + proxy rotation izni | `PROXY_ROTATION` | `SAFE_TRANSIENT_PROXY_ROTATION` |
| Terminal compliance / never-bypass code | `NONE` | `COMPLIANCE_TERMINAL` |
| Uygun fallback yok | `NONE` | `NO_ALLOWED_FALLBACK` |

## 3. Güvenlik, policy ve anti-bypass sınırı

Terminal `POLICY_BLOCKED`, `AUTHENTICATION_REQUIRED`, `ANTI_BOT_BARRIER` ve client-error kararları, mevcut compliance policy ile fail-closed ele alınır.[2] `CAPTCHA_REQUIRED` gibi never-bypass code'lar compliance değerlendirmesinden önce `NONE / COMPLIANCE_TERMINAL` sonucuna götürür. Böylece content fallback yalnız explicit safe content code'larına daraltılır; WAF/challenge/CAPTCHA, credential veya policy engelini aşmak için kullanılamaz.

Contract yalnız analyzer output'unun safe özetini ve failure code/access class/retryable metadata'sını kullanır. Raw request/response, HTML/JSON, URL, selector, cookie, authorization, credential, proxy endpoint, prompt, model output veya worker detail almaz ve döndürmez.

> P10-T02 strategy **rules** katmanıdır. LLMProvider abstraction P10-T03'te; policy approval ve worker action dönüşümü P10-T04'te, ayrı bounded review paketleri olarak ele alınacaktır.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/strategy-rules.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/strategy-rules.test.ts` | Başarılı — 1 dosya / 3 test | Equal-input determinism, safe content/transient fallback ve terminal anti-bypass/invalid input yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 69 dosya / 286 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. LLM/model/provider çağrısı, prompt, model configuration veya model output parsing.
2. Browser launch, network fetch, proxy acquisition/rotation, credential handling veya target policy değişikliği.
3. Strategy decision persistence, approval workflow, worker action, queue/outbox publish, retry/backoff veya scheduling.
4. Token, latency, per-job cost/budget enforcement; bunlar P10-T07 kapsamındadır.
5. CAPTCHA/challenge/WAF/anti-bot bypass, stealth/fingerprint evasion, automatic policy exception veya automatic bypass retry.

## 6. Review kararı

P10-T02 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T03 — LLMProvider Abstraction & Model Configuration olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T02 kabul kriteri"
[2]: ../src/security/compliance-policy.ts "Compliance terminal ve never-bypass kararları"
