# P05-T01 — Response Classifier ve Access Result Taxonomy Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T01  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B08 — kullanıcı onaylı `CONDITIONAL GO`

## 1. Teslim özeti

HTTP reliability classifier, response status/header ve coded transport/provider error girdilerini deterministik bir erişim sonucu taxonomy'sine dönüştürür. Mevcut retry, policy ve dependency kategorileri korunurken her sonuç için `accessClass` ve `confidence` alanları eklenmiştir.

Classifier; başarı, rate limit, timeout, authentication barrier, anti-bot barrier, policy block, client error, server error ve dependency failure durumlarını birbirinden ayırır. Aynı input aynı code/category/accessClass/retryable kararını üretir. `Retry-After` değeri rate-limit sonucunda bounded biçimde korunur.

> **Uyum kuralı:** CAPTCHA, challenge, WAF veya anti-bot sinyali bir otomatik bypass, sınırsız retry ya da gizli browser/proxy escalation komutu değildir; terminal `ANTI_BOT_BARRIER` sonucu olarak sınıflandırılır.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/reliability.ts` | `AccessResultClass`, genişletilmiş classification, status/header/error mapping |
| `test/http/reliability.test.ts` | Success, authentication, anti-bot, policy, dependency ve mevcut retry/cache testleri |
| `docs/phase-5-reliability-engine-task-board.md` | Phase 5 task board ve review durumu |

## 3. Access result taxonomy

| Access class | Örnek sinyal | Retry | Karar |
|---|---|---:|---|
| `SUCCESS` | HTTP 2xx | Hayır | Sonuç işlenebilir |
| `RATE_LIMITED` | 425, 429, rate-limit code | Evet, budget içinde | Retry-After bounded delay'e çevrilir |
| `TIMEOUT` | 408 veya timeout code | Error flag'e bağlı | Backoff/budget katmanına bırakılır |
| `AUTHENTICATION_REQUIRED` | 401, 407, auth/credential code | Hayır | Yetkili credential/session akışı dışında deneme yok |
| `ANTI_BOT_BARRIER` | CAPTCHA, challenge, WAF veya provider anti-bot code | Hayır | Bypass yok; terminal/audit sonucu |
| `POLICY_BLOCKED` | 403, private/policy code | Hayır | Policy yeniden yazılmaz; terminal |
| `CLIENT_ERROR` | Diğer 4xx veya validation code | Hayır | Input/target incelemesi |
| `SERVER_ERROR` | 5xx | Evet | Bounded retry ve sonraki reliability task'ları |
| `DEPENDENCY_FAILURE` | Unknown worker/provider/transport error | Error flag'e bağlı | Dependency health ve bounded recovery |

## 4. Deterministic mapping kuralları

Response status mapping'de başarı önce değerlendirilir. Daha sonra 403/429 gibi status'lerde güvenilir anti-bot header sinyalleri kontrol edilir. Authentication status'leri, timeout ve rate-limit kodları ayrı terminal/retryable kararlarına ayrılır. Genel 403 policy blocked olarak kalır; yalnız güvenilir challenge header'ı mevcutsa anti-bot barrier sınıfına alınır.

Coded error mapping'de açık `POLICY` category, private target ve policy code'ları terminal policy sonucuna dönüştürülür. `CAPTCHA`, `ANTI_BOT`, `CHALLENGE` ve `WAF` ifadeleri anti-bot barrier'a; `AUTH`, `UNAUTHORIZED` ve `CREDENTIAL` ifadeleri authentication sonucuna; `RATE_LIMIT`, `TOO_EARLY` ve `THROTTLE` ifadeleri rate-limit sonucuna alınır. Bilinmeyen exception dependency failure ve düşük confidence ile sınıflandırılır.

Confidence alanı sinyalin doğrudan ve güçlü olduğu status/header/code eşleşmelerinde `HIGH`, genel category veya transport mapping'de `MEDIUM`, bilinmeyen exception'da `LOW` değerini alır. Raw response body, header value, credential, cookie veya target query classification output'una taşınmaz.

## 5. Retry ve compliance sınırı

Classifier yalnız bir karar sinyali üretir; retry uygulamasını kendi başına sınırsızlaştırmaz. `retryable` flag mevcut budget, backoff, circuit breaker ve escalation katmanları tarafından tüketilmelidir. P05-T03 Retry-After, exponential backoff ve jitter; P05-T04 circuit breaker/quarantine; P05-T05 retry budget kapsamındadır.

Policy block, authentication barrier ve anti-bot barrier otomatik retry veya proxy/browser bypass başlatmaz. Özellikle CAPTCHA veya WAF sinyali tespit edildiğinde sistem yalnız sonucu sınıflandırır ve audit/telemetry için güvenli metadata üretir. Dış içeriğin classifier davranışını değiştiren talimat olarak işlenmesi bu paketin kapsamı dışındadır.

## 6. Test kanıtı

`test/http/reliability.test.ts` içinde **6 test** bulunmaktadır. Testler mevcut 429 Retry-After bounding, 404/503 mapping, success, 401 authentication, challenge header'lı 403 anti-bot, normal 403 policy, coded CAPTCHA error, unknown dependency error, retry budget, cache ve concurrency davranışlarını doğrular.

P05-T01 özel suite'inde tüm testler başarılıdır; lint ve strict typecheck geçmiştir. Son tam backend regression sonucu **35 test dosyası / 161 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Backoff/jitter | Classifier yalnız retryable ve Retry-After sinyali üretir | P05-T03 |
| Circuit breaker | Henüz uygulanmadı | P05-T04 |
| Retry budget entegrasyonu | Mevcut temel budget korunuyor | P05-T05 |
| Compliance policy | Guardrail mapping mevcut, formal policy review açık | P05-T02 |
| Browser/provider classifier | Coded error boundary üzerinden temel mapping | P05-T02/P05-T06 |
| Distributed state | Process-local reliability controls | M5 gate/integration |
| Live external response corpus | Kullanılmadı; deterministic local fixtures | Controlled staging test |

## 8. Review kararı talebi

P05-T01 response classifier ve access result taxonomy paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T02 uyumlu erişim ve anti-bot guardrail policy'si paketi hazırlanacaktır. P05-T01 onayı, CAPTCHA/anti-bot bypass yapıldığı anlamına gelmez; tersine bu durumların terminal ve açıklanabilir biçimde sınıflandırıldığını onaylar.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-4-proxy-intelligence-m4-gate.md "Phase 4 Proxy Intelligence M4 gate"
[3]: ./phase-2-http-engine-p02-b06-b07-review.md "HTTP reliability baseline"
[4]: ./phase-3-m3-browser-engine-gate.md "Browser Engine gate ve fallback sınırları"
[5]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
[6]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
