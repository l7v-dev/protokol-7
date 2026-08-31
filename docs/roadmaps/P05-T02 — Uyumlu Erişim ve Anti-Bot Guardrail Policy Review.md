# P05-T02 — Uyumlu Erişim ve Anti-Bot Guardrail Policy Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T02  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P05-T01 — review onaylı

## 1. Teslim özeti

P05-T02, erişim sonuçlarını uyum ve güvenlik açısından kararlandıran shared compliance policy katmanını ekler. Policy; başarılı erişimi izinli, transient sonucu yalnız bounded retry adayı, authentication/policy/client/anti-bot bariyerlerini ise terminal olarak işaretler. Karar yalnız bir recommendation üretir; browser fallback, proxy rotation veya hedef policy değişikliği gerçekleştirmez.

`BrowserFallbackPolicy`, aynı never-bypass code sınırını shared `isNeverBypassCode` fonksiyonundan kullanır. Böylece authentication, policy, rate-limit, credential, CAPTCHA, challenge ve anti-bot sonuçları browser'a geçiş veya gizli escalation için kullanılamaz.

> **Değiştirilemez kural:** CAPTCHA, challenge, WAF veya anti-bot bariyeri çözmeye, atlatmaya veya başka bir engine/provider üzerinden gizlemeye yönelik otomasyon yoktur.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/security/compliance-policy.ts` | Shared compliance action/reason kararları ve never-bypass code boundary |
| `src/browser/fallback.ts` | Shared never-bypass policy entegrasyonu |
| `test/security/compliance-policy.test.ts` | Success, bounded retry, terminal barriers ve legacy/new code testleri |
| `test/browser/fallback.test.ts` | Genişletilmiş browser bypass negative matrix |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T02 task board durumu |

## 3. Compliance decision contract

| Access class | Action | Browser fallback | Proxy rotation | Retry |
|---|---|---:|---:|---:|
| `SUCCESS` | `ALLOW` | Hayır | Hayır | Hayır |
| `RATE_LIMITED` / `TIMEOUT` / `SERVER_ERROR` / transient dependency | `RETRY_BOUNDED` | Hayır | Hayır | Yalnız input `retryable=true` ise |
| `AUTHENTICATION_REQUIRED` | `TERMINAL_BLOCK` | Hayır | Hayır | Hayır |
| `ANTI_BOT_BARRIER` | `TERMINAL_BLOCK` | Hayır | Hayır | Hayır |
| `POLICY_BLOCKED` | `TERMINAL_BLOCK` | Hayır | Hayır | Hayır |
| `CLIENT_ERROR` | `TERMINAL_BLOCK` | Hayır | Hayır | Hayır |

Terminal reason'lar `AUTHENTICATION_REQUIRED`, `ANTI_BOT_BARRIER`, `POLICY_BLOCKED` ve `CLIENT_ERROR` olarak normalize edilir. Raw response body, credential, cookie, authorization değeri veya challenge payload'ı decision output'una alınmaz.

## 4. Never-bypass code boundary

Shared `isNeverBypassCode` fonksiyonu legacy HTTP kodlarını ve P05-T01 classifier kodlarını kapsar: `HTTP_CLIENT_ERROR`, `HTTP_AUTH_REQUIRED`, `HTTP_PROXY_AUTH_REQUIRED`, `HTTP_POLICY_BLOCKED`, `HTTP_RATE_LIMITED`, `PRIVATE_TARGET_BLOCKED`, `POLICY_VIOLATION`, `CREDENTIAL_ERROR`, `CAPTCHA`, `CAPTCHA_REQUIRED`, `ANTI_BOT` ve `HTTP_ANTI_BOT_BARRIER`.

Browser fallback yalnız content insufficiency sınıflarını (`HTTP_CONTENT_INSUFFICIENT`, `HTTP_JAVASCRIPT_REQUIRED`, `HTTP_EMPTY_CONTENT`, `UNSUPPORTED_CONTENT_TYPE`) ve açık fallback budget'ı varsa değerlendirebilir. Authentication, policy, rate-limit veya anti-bot sonucu hiçbir browser fallback ile aşılmaz. Bu policy, HTTP-first/browser fallback kararlarının M2/M3 guardrail'leriyle uyumludur.

## 5. Failure ve retry sınırı

Compliance policy retry uygulamaz; `RETRY_BOUNDED` yalnız sonraki backoff, circuit breaker ve retry budget katmanlarının tüketebileceği bir sinyaldir. `retryable=true` olmayan rate-limit veya dependency sonucu terminal olarak değerlendirilir. P05-T03 Retry-After, exponential backoff ve jitter; P05-T04 circuit breaker/quarantine; P05-T05 retry budget kapsamındadır.

Policy violation, private target, unauthorized authentication, credential error veya anti-bot barrier için otomatik provider rotation, browser escalation veya sınırsız retry yoktur. Policy kararı, hata sınıfı ve safe reason telemetry/audit için kullanılabilir; dış response içeriği talimat olarak işlenmez.

## 6. Test kanıtı

P05-T02 için `test/security/compliance-policy.test.ts` içinde **4 test**, güncellenmiş `test/browser/fallback.test.ts` içinde **4 test** bulunmaktadır. Testler successful allow, bounded retry, authentication/anti-bot/policy/client terminal block, legacy/new never-bypass code'ları, browser fallback budget ve safe content fallback ayrımını doğrular.

P05-T02 özel testleri, lint ve strict typecheck başarılıdır. Son tam backend regression sonucu **36 test dosyası / 165 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Retry-After/backoff | Classifier bounded signal üretiyor | P05-T03 |
| Circuit breaker/quarantine | Uygulanmadı | P05-T04 |
| Retry/escalation budget | Temel retry budget mevcut | P05-T05 |
| Formal legal/compliance sign-off | Policy kodu ve negative test hazır; kurumsal sign-off ayrıca gerekli | P05-T08 |
| Browser network hook | Browser policy mevcut; runtime production hook koşullu | M3 inherited condition |
| Distributed policy state | Process-local | M5 gate/integration |

## 8. Review kararı talebi

P05-T02 uyumlu erişim ve anti-bot guardrail policy paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T03 exponential backoff, jitter ve Retry-After desteği hazırlanacaktır. P05-T02 onayı, herhangi bir anti-bot challenge'ın aşıldığı anlamına gelmez; yalnızca bu durumların terminal ve bypass'sız olarak ele alındığını onaylar.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-2-http-engine-p02-b06-b07-review.md "HTTP reliability ve retry baseline"
[4]: ./phase-3-m3-browser-engine-gate.md "Browser fallback ve inherited conditions"
[5]: ./phase-4-proxy-intelligence-m4-gate.md "Proxy Intelligence guardrail'leri"
[6]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[7]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
