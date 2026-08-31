# P10-T05 — Feedback, Outcome & Strategy Versioning Review

**Program:** Scraping Platform  
**Milestone / Phase:** M10 / Phase 10 — AI Strategy Engine  
**Task:** P10-T05  
**Durum:** Accepted — kullanıcı onaylı  
**Kapsam türü:** Backend-only, process-local, immutable versioning ve secret-safe impact contract

## 1. Amaç ve kabul sınırı

P10-T05, strategy rule fingerprint'leri için immutable version kaydı, proposal referanslı feedback/outcome olayları ve version bazında deterministik kalite/maliyet impact özeti sunar. Program task register'ın kabul kriterisi, her önerinin sonucu ile kalite/maliyet etkisinin görülebilmesidir.[1]

Bu paket yalnız safe numeric/enum outcome summary üretir. Model çağrısı, strategy rule mutasyonu, worker action, queue publish, provider cost charge, raw feedback text, raw target data veya karar otomasyonu yapmaz.

| Contract yüzeyi | Sağlanan davranış | Sınır |
|---|---|---|
| `createVersion` | Strategy key + rule fingerprint için immutable, sequential version oluşturur | Exact duplicate input idempotent; mevcut version değiştirilmez |
| `recordOutcome` | Proposal/version referanslı enum outcome, quality bps ve cost unit kaydeder | Raw result, token detail, invoice veya provider payload yoktur |
| `recordFeedback` | Proposal/version referanslı enum verdict ve bounded reason code kaydeder | Serbest metin feedback, prompt veya user PII kabul etmez |
| `impact` | Outcome/feedback sayıları, kalite ortalaması ve toplam cost unit döner | Read-only process-local projection; charge/budget mutation yapmaz |

## 2. Immutable strategy versioning

`src/strategy/feedback-versioning.ts`, `strategy-version/v1` input'unu kullanır. Aynı strategy key ve aynı SHA-256 rule fingerprint, mevcut version'ı idempotent döndürür. Yeni fingerprint, aynı strategy key altında sıradaki `versionNumber` ile ayrı immutable `versionId` üretir. Versionlar tenant/project scope ile ayrılır; başka scope'taki version referansı fail-closed reddedilir.

Rule implementation, model configuration veya prior version mutasyonuna izin verilmez. Registry yalnız fingerprint referansını taşır; raw rule text, prompt, model output veya provider metadata saklamaz.

## 3. Feedback, outcome ve impact görünümü

Outcome kayıtları `SUCCEEDED`, `FAILED`, `CANCELLED` veya `POLICY_BLOCKED` enum'larıyla sınırlıdır. Feedback verdict'ü `ACCEPTED`, `REJECTED` veya `NEEDS_REVIEW` olabilir. Bir `outcomeId` veya `feedbackId`, yalnız birebir aynı input ile idempotent tekrar edebilir; aynı kimlik farklı içerikle verilirse conflict üretilir.

`impact` görünümü yalnız versiona bağlı aggregate döndürür: outcome/feedback sayısı, terminal outcome dağılımı, 0–10.000 basis point kalite ortalaması ve non-negative toplam `costUnits`. Bu metrikler gözlemseldir; P10-T07'nin budget enforcement, token/latency telemetry veya gerçek charge kapsamının yerine geçmez.

| Summary alanı | Türetilme yöntemi | Gizlilik sınırı |
|---|---|---|
| `succeededCount` / `failedCount` / diğer outcome sayıları | Enum outcome kayıtlarından count | Raw task/model sonucu yok |
| `averageQualityScoreBps` | Outcome quality score'larının rounded ortalaması | Field-level/raw quality evidence yok |
| `totalCostUnits` | Caller-supplied non-negative unit toplamı | Token kullanım, fiyat veya billing record yok |
| `feedbackCount` | Bounded enum feedback kayıt sayısı | Serbest metin veya PII yok |

## 4. Güvenlik ve fail-closed davranış

Tüm scope, strategy key, proposal/version/outcome/feedback kimliği ve reason code bounded safe-id kurallarına uyar. Fingerprint SHA-256 formatında olmalıdır; zaman, integer quality score ve cost unit değerleri doğrulanır. Malformed kayıt `STRATEGY_VERSION_INVALID`, unknown version `STRATEGY_VERSION_NOT_FOUND`, cross-scope reference `STRATEGY_VERSION_SCOPE_MISMATCH`, different-content duplicate `STRATEGY_VERSION_CONFLICT` ile reddedilir.

Bu contract credential, cookie, authorization, endpoint, prompt, raw model response, raw target content, selector, HTTP response, worker ID veya provider error hiçbir zaman kabul etmez ya da output'a yansıtmaz. CAPTCHA/challenge/WAF bypass, policy override, retry veya automatic execution içermez.

## 5. Doğrulama kanıtı

Dar kapsam test paketi `test/strategy/feedback-versioning.test.ts` ile çalıştırılmıştır.

| Komut | Sonuç | Kapsam |
|---|---|---|
| `pnpm test --run test/strategy/feedback-versioning.test.ts` | Başarılı — 1 dosya / 3 test | Immutable sequential/idempotent versioning, safe outcome/feedback impact summary ve cross-scope/malformed/conflict fail-closed yolları |
| `pnpm lint && pnpm typecheck` | Başarılı | ESLint zero-warning ve strict TypeScript denetimi |
| `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` | Başarılı — 72 dosya / 295 test | Lint, strict typecheck, tüm regression suite ve production build |

## 6. Bilinçli kapsam dışları

1. Durable PostgreSQL storage, migration, API endpoint, dashboard/UI, pagination, retention veya audit export.
2. Live LLM/provider call, raw model output/prompt retention, token/latency measurement, billing veya real cost charge.
3. Strategy rule/model config mutation, proposal approval, worker dispatch, queue/outbox publish, retry/backoff veya scheduling.
4. P10-T07 per-job budget enforcement veya P10-T08 offline evaluation/controlled rollout.
5. CAPTCHA/challenge/WAF/anti-bot bypass, credential discovery, policy override veya automatic bypass retry.

## 7. Review kararı

P10-T05 kullanıcı tarafından onaylanmış ve `Accepted` olarak işaretlenmiştir. Sıradaki bounded paket P10-T06 — Prompt/Data Minimization & Untrusted Content Guardrails olacaktır.

## References

[1]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 10 AI Strategy Engine — P10-T05 kabul kriteri"
