# P10-T01 — Target Analyzer Contract Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T01  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, deterministic, non-actionable Target Analyzer contract

## 1. Amaç ve kabul sınırı

P10-T01, Target Analyzer için versioned ve policy engine tarafından doğrulanabilir bir girdi/çıktı sözleşmesi sağlar. Program task register'ın kabul kriterisi, analyzer çıktısının versioned olması ve policy engine tarafından doğrulanabilmesidir.[1]

Bu paket bir LLM entegrasyonu veya strategy executor değildir. Analyzer, yalnız caller-supplied ve raw-content içermeyen target metadata ile enum tabanlı gözlem sinyallerini normalize eder. Çıktı `allowStrategyProposal: false`, `allowWorkerAction: false` ve `allowBypass: false` değerlerini sabit taşır; dolayısıyla herhangi bir worker action veya policy bypass'a dönüşemez.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `TargetAnalyzerInput` | `target-analyzer/v1`, tenant/project/target scope, target policy metadata ve bounded signal seti | Raw HTML/JSON/XML, request/response, credential veya prompt alanı yoktur |
| `TargetAnalyzer.analyze` | Egress ve port policy doğrulamalı safe target özeti ve capability gözlemi üretir | Target fetch, browser çalıştırma, LLM çağrısı, strategy seçimi veya dispatch yapmaz |
| `TargetAnalysisPolicyResult` | Active/inactive target için açık policy durumu döner | Hiçbir durumda proposal/worker/bypass yetkisi vermez |
| Fingerprint / analysisId | Canonical scope, safe target metadata ve sorted signal setinden deterministic SHA-256 referans üretir | Seed URL path/query/fragment veya raw content output'a yansıtılmaz |

## 2. Versioned input/output modeli

`src/strategy/target-analyzer.ts`, contract version'ını `target-analyzer/v1` sabitiyle zorunlu kılar. Scope içindeki tenant, project ve target kimlikleri bounded safe-id formatında olmalıdır. Target metadata'sı seed URL, allowlisted host/port listeleri ve target statusü ile sınırlıdır. Signal seti en çok 16 benzersiz enum değeri taşıyabilir: `HTML_DOCUMENT`, `JSON_DOCUMENT`, `XML_DOCUMENT`, `STRUCTURED_DATA_PRESENT` ve `JAVASCRIPT_RENDERING_OBSERVED`.

Output; safe protocol/hostname/port, policy listelerinin yalnız sayılarını, boolean capability işaretlerini ve fingerprint'i içerir. Seed URL'nin path/query/fragment bilgisi döndürülmez. `analysisId`, scope ve fingerprintten deterministik türetilir; output version'ı da input version'ı ile aynıdır.

## 3. Policy doğrulaması ve fail-closed davranış

Analyzer, egress guard'ını kullanarak seed URL'nin yalnız HTTP(S), credential-free, non-private/non-loopback/non-link-local ve allowed host içinde olmasını zorunlu kılar.[2] Normalized port target'ın allowed port listesinde değilse `TARGET_ANALYZER_POLICY_BLOCKED` döner. Böylece analyzer output, daha sonraki policy katmanının doğrulayabileceği safe destination metadata taşır.

Target `ACTIVE` değilse egress input geçerli olsa bile output policy'si `allowed: false` ve `reason: TARGET_NOT_ACTIVE` döner. Bu bilgi yalnız gözlemseldir; transition, retry, browser fallback, proxy rotation veya worker action üretmez. Geçersiz contract version, duplicate/unrecognized signal, malformed scope/host/port fail-closed `TARGET_ANALYZER_INVALID` ile reddedilir.

| Durum | Output / hata | Action yetkisi |
|---|---|---|
| Active, egress-safe, allowed port | `TARGET_ACTIVE_AND_EGRESS_ALLOWED` | Proposal/worker/bypass: kapalı |
| Paused/archived/deleted, egress-safe | `TARGET_NOT_ACTIVE` | Proposal/worker/bypass: kapalı |
| Private/loopback, invalid protocol, credential URL veya host mismatch | `TARGET_ANALYZER_POLICY_BLOCKED` | Output üretilmez |
| Port mismatch veya malformed version/signal/scope | Policy block veya `TARGET_ANALYZER_INVALID` | Output üretilmez |

## 4. Secret ve untrusted-content sınırı

Analyzer input'u raw target content veya external instruction almaz. Output'ta request/response gövdesi, raw HTML/JSON/XML, selector, URL path/query, cookie, authorization header, session token, provider credential, prompt, model output, worker id veya error detail bulunmaz. Bu paket, dış içeriği sistem talimatı olarak ele almaz ve herhangi bir model çağrısına secret göndermez.

> P10-T01 yalnız analyzer **contract** sınırını kurar. P10-T03 LLMProvider abstraction ve P10-T04 AI strategy proposal/policy approval çalışmaları, ayrı bounded paketlerde explicit review gerektirir.

## 5. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/target-analyzer.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/target-analyzer.test.ts` | Başarılı — 1 dosya / 3 test | Versioned safe output, inactive terminal policy ve unsafe/forged/bounded input fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 68 dosya / 283 test | Lint, strict typecheck, tüm regression suite ve production build |

## 6. Bilinçli kapsam dışları

1. Herhangi bir LLM/model/provider çağrısı, prompt construction, model configuration veya token/latency/budget tüketimi.
2. Network fetch, browser execution, DOM analysis, robots fetch, proxy acquire, strategy selection/fallback veya worker dispatch.
3. Strategy proposal'ın oluşturulması, approval, persistence, queue publish, retry veya automation/scheduler.
4. PostgreSQL durable analyzer history, API endpoint, UI, model feedback/evaluation veya controlled rollout.
5. CAPTCHA/challenge/WAF/anti-bot bypass, fingerprint evasion, credential discovery, policy exception veya automatic bypass retry.

## 7. Review kararı

P10-T01 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T02 — Deterministic Strategy Rules & Fallback Priorities olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T01 kabul kriteri"
[2]: ../src/security/egress-policy.ts "Backend egress policy — safe outbound URL validation"
