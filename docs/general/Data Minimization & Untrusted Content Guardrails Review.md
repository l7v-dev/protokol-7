# P10-T06 — Prompt/Data Minimization & Untrusted Content Guardrails Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T06  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, deterministic, fail-closed guarded prompt-preparation contract

## 1. Amaç ve kabul sınırı

P10-T06, dış içeriğin model/prompt katmanına taşınmadan önce bounded, redacted ve instruction-isolated hale getirilmesi için guarded prompt envelope contract'ı sağlar. Program task register'ın kabul kriterisi, dış içeriğin sistem talimatı olarak işlenmemesi ve secret değerlerin model çağrısına gitmemesidir.[1]

Bu paket, `guarded-prompt/v1` input'undan yalnız guarded envelope üretir. Hiçbir LLM/provider çağrısı, network/tool execution, prompt persistence, worker action, queue publish veya strategy mutation yapmaz.

> `UNTRUSTED_DATA` her zaman yalnız veri olarak etiketlenir. Instruction-like ifadeler execution yetkisi veya system instruction oluşturmaz; bunlar yalnız sayısal `instructionLikeSignalCount` olarak gözlemlenir.

| Contract yüzeyi | Sağlanan davranış | Fail-closed sınır |
|---|---|---|
| `PromptGuardrails.build` | Versioned scope/config/source/purpose input'undan bounded envelope üretir | Invalid scope/version/config policy reddedilir |
| Secret redaction | Authorization, Bearer token, cookie, credential, password, secret, session, token ve API-key benzeri text değerlerini maskeler | Raw matched value envelope'a girmez |
| Data minimization | Untrusted input 12.000 karakter ile sınırlıdır; safe metadata dışında raw context eklenmez | Oversize input `PROMPT_GUARD_INPUT_TOO_LARGE` ile reddedilir |
| Capability lock | Strict schema zorunluluğu; tools/network/persistence kapalıdır | Envelope action ya da execution izni taşımaz |

## 2. Guarded envelope ve configuration boundary

`src/strategy/prompt-guardrails.ts`, ancak `llm-model-config/v1` resolved configuration subset'i strict schema gerektiriyor, prompt persistence'a izin vermiyor ve network tools'u kapatıyorsa envelope üretir. Configuration tenant/project scope'u prompt scope'u ile eşleşmelidir. Bu sayede önceki P10-T03 configuration sınırını zayıflatan bir prompt input kabul edilmez.

Output'ta model/configuration referansı, deterministic prompt fingerprint, source id, sanitized untrusted data, text uzunluğu ve redaction/instruction-signal sayıları bulunur. `strictSchemaRequired: true`, `allowTools: false`, `allowNetwork: false` ve `persistPromptContent: false` değişmezdir.

| Output alanı | Anlamı | Bilerek taşımadığı veri |
|---|---|---|
| `untrustedData` | Sanitized ve bounded data block | Raw secret values veya execution authority |
| `redactedSecretCount` | Maskelenen textual secret eşleşmesi sayısı | Secret'ın adı/değeri/kaynağı |
| `instructionLikeSignalCount` | Untrusted data içindeki instruction-benzeri tokenların sayısı | Herhangi bir instruction'ın icrası veya yorumu |
| `promptFingerprintSha256` | Canonical guarded input referansı | Raw log/audit content saklama izni |
| Capability lock alanları | Model execution boundary için zorunlu kısıtlar | Tool/network/worker action yetkisi |

## 3. Secret redaction ve untrusted content isolation

Redaction deseni, `authorization: Bearer …` dahil olmak üzere key/value veya Bearer token formatlarını `[REDACTED]` ile değiştirir. Dış data içinde “ignore”, “override”, “reveal”, “execute”, “browse”, “call tools”, “system instruction” veya “developer message” gibi instruction-benzeri ifadeler bulunduğunda bunlar data block içinde kalır ve signal counter'a yansır. Sistem instruction sabittir: UNTRUSTED_DATA'nın instruction değil veri olduğu, action/secret reveal/browse/tool/policy change/bypass yapılamayacağı ve yalnız strict-schema output döndürüleceği belirtilir.

Mevcut controlled AI extraction adapter'ın untrusted content'i data olarak ele alma ve sensitive input redaction yaklaşımı ile uyumludur.[2] P10-T06 bu davranışı strategy-domain prompt preparation seviyesinde bağımsız ve test edilebilir bir contract'a taşır.

## 4. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/prompt-guardrails.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/prompt-guardrails.test.ts` | Başarılı — 1 dosya / 3 test | Secret/Bearer redaction, injection-like data isolation, deterministic fingerprint/no action permission ve oversize/policy-weakened/cross-scope fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 73 dosya / 298 test | Lint, strict typecheck, tüm regression suite ve production build |

## 5. Bilinçli kapsam dışları

1. Gerçek model/provider çağrısı, prompt send, completion parse, streaming, tools veya network execution.
2. Durable prompt/audit storage, telemetry export, data retention/deletion, API endpoint veya UI.
3. Raw HTML/JSON/response ingestion, artifact retrieval, context RAG/retrieval veya external instruction verification.
4. Strategy proposal approval, worker dispatch, queue publish, retry/backoff, budget enforcement veya scheduling.
5. CAPTCHA/challenge/WAF/anti-bot bypass, prompt-based policy override, credential discovery, secret exfiltration veya automatic bypass retry.

## 6. Review kararı

P10-T06 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T07 — AI Latency, Token & Per-job Budget Control olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T06 kabul kriteri"
[2]: ../src/extraction/ai-extraction.ts "Controlled AI extraction — untrusted data ve sensitive input boundary"
