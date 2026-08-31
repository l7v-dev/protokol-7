# P10-T03 — LLMProvider Abstraction & Model Configuration Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T03  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, provider-neutral, secret-safe, non-invocation configuration contract

## 1. Amaç ve kabul sınırı

P10-T03, strategy core'unu belirli bir model sağlayıcısına bağlamadan model catalog discovery ve tenant/project-scoped model configuration katmanını tanımlar. Program task register'ın kabul kriterisi, model değişiminin strategy core'u değiştirmemesidir.[1]

Bu paket model çağrısı yapmaz. `LlmProvider` yalnız `listModels()` catalog yüzeyini tanımlar; prompt, chat completion, tool call, network invocation veya provider credential API'si bilerek eklenmemiştir. Böylece model seçimi/configuration ile AI execution sınırı ayrılmış kalır.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `LlmProvider` | Provider id ve async model descriptor catalog discovery arayüzü | Completion/inference methodu yoktur |
| `LlmModelDescriptor` | Provider/model kimliği ile structured output, tools, vision, reasoning capability özeti | Price, API key, endpoint veya prompt taşımaz |
| `ModelConfigurationRegistry` | Tenant/project-scoped config kaydı, catalog model bind ve resolve işlemi | Process-local; persistence, secret vault veya remote provider call yoktur |
| `ResolvedModelConfiguration` | Safe model metadata, strict schema requirement ve model fingerprint | Worker action/prompt persistence/network tools kesin olarak kapalıdır |

## 2. Provider-neutral model configuration

`src/strategy/llm-provider.ts`, `llm-model-config/v1` version'ını zorunlu kılar. Configuration; `configurationId`, tenant/project scope, provider/model id, use case, enabled state, bounded `maxOutputTokens` ve structured-output requirement içerir. Provider registry, config'i yalnız daha önce kayıtlı catalog'da bulunan modelle bağlar. Structured output istenirse descriptor'ın `structuredOutput: true` capability'si zorunludur.

Resolved config, raw configuration'ın yalnız güvenli subsetini döndürür. Capability object, `modelFingerprintSha256` ve aşağıdaki değişmez güvenlik bayraklarıyla birlikte gelir:

| Alan | Sabit değer | Anlamı |
|---|---:|---|
| `strictSchemaRequired` | `true` | Sonraki execution katmanında strict structured output zorunluluğu |
| `allowPromptContentPersistence` | `false` | Prompt/raw input retention izni yok |
| `allowNetworkTools` | `false` | Modelin network tool/action yetkisi yok |
| Worker/action izni | Çıktıda yok | Configuration, worker command üretmez |

`StaticLlmCatalogProvider`, yalnız test/dev için process-local catalog adapter'ıdır. Network ve model invocation yapmaz; gerçek catalog kaynağı veya provider integrasyonu değildir.

## 3. Tenant isolation, validation ve fail-closed davranış

Configuration anahtarı tenant, project ve configuration id birleşiminden türetilir. Aynı configuration id başka tenant/project altında varsa resolve çağrısı `MODEL_CONFIG_SCOPE_MISMATCH` ile reddedilir. Disabled config `MODEL_CONFIG_DISABLED`; kayıtlı olmayan provider/model `MODEL_NOT_AVAILABLE`; duplicate config/provider `MODEL_CONFIG_CONFLICT`; malformed version/id/token limit `MODEL_CONFIG_INVALID`; required structured-output capability'si olmayan model `MODEL_CAPABILITY_MISMATCH` hatası verir.

Tüm hata mesajları kullanıcı alanlarının raw değerini veya credential bilgisini yansıtmaz. Config ve resolved output'ta API key, bearer token, endpoint URL, prompt, raw target content, response, tool result ya da provider error payload bulunmaz.

> Canlı model catalog'ı ve model çağrısı için kaynak model listesi çalışma anında doğrulanmalıdır. Bu bounded paket, herhangi bir belirli canlı model kimliğine veya fiyat/feature varsayımına dayanmaz ve live catalog çağrısı gerçekleştirmez.[2]

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/llm-provider.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/llm-provider.test.ts` | Başarılı — 1 dosya / 3 test | Provider-neutral catalog bind, safe/non-actionable resolve, unavailable/capability/duplicate/disabled ve cross-scope fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 70 dosya / 289 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Gerçek provider SDK/HTTP integration, API key management, secret vault, live catalog fetch veya model invocation.
2. Prompt construction, raw content transfer, completion parsing, tool/function calling, streaming veya response persistence.
3. Strategy proposal oluşturma, policy approval, worker dispatch, queue/outbox publish, retry/backoff veya automation.
4. Model cost, token/latency telemetry veya per-job budget enforcement; bunlar P10-T07 kapsamındadır.
5. CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery, policy override veya herhangi bir external action.

## 6. Review kararı

P10-T03 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T04 — AI Strategy Proposal & Policy Approval Flow olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T03 kabul kriteri"
[2]: /home/ubuntu/skills/builtin-llm-models/SKILL.md "Built-in LLM catalog guidance — live catalog verification"
