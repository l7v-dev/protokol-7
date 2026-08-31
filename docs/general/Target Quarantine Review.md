# P05-T04 — Circuit Breaker ve Provider/Target Quarantine Review

**Program:** Scraping Platform  
**Milestone:** M5 — Reliability Controls Accepted  
**Task:** P05-T04  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P05-T03 — review onaylı

## 1. Teslim özeti

P05-T04, provider ve target scope'unda tenant-isolated circuit breaker ile quarantine registry ekler. Breaker `CLOSED`, `OPEN` ve `HALF_OPEN` state'leriyle bounded failure kontrolü yapar. Failure threshold aşıldığında trafik durdurulur ve scope otomatik olarak `CIRCUIT_BREAKER` kaynağıyla geçici quarantine edilir. Reset timeout sonrasında yalnızca tek half-open probe çalıştırılır; probe başarılı olursa breaker kapanır, başarısız olursa yeniden açılır.

HTTP reliability controller, target scope'unda operation öncesi breaker preflight uygular. HTTP server/rate-limit/timeout/dependency sonucu ve retryable transport/provider exception failure olarak kaydedilir. Breaker açık veya quarantine durumunda operation çağrılmaz; controller alternatif provider/target seçmez.

> **Temel kural:** Circuit breaker güvenli biçimde trafiği durdurur; otomatik, policy dışı provider rotation veya anti-bot bypass yapmaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/circuit-breaker.ts` | Provider/target circuit state, reset, half-open probe ve quarantine registry |
| `src/http/reliability.ts` | Target breaker preflight, status/exception failure recording ve success reset |
| `test/http/circuit-breaker.test.ts` | Threshold, open/quarantine, half-open, manual quarantine, expiry ve isolation |
| `test/http/reliability.test.ts` | HTTP response/transport exception → target breaker entegrasyonu |
| `docs/phase-5-reliability-engine-task-board.md` | P05-T04 board durumu |

## 3. State machine

| State | Giriş | İzin verilen davranış | Çıkış |
|---|---|---|---|
| `CLOSED` | Başlangıç veya başarılı probe | Operation çalışabilir | Threshold failure ile `OPEN` |
| `OPEN` | Failure threshold veya failed half-open probe | Operation çalışmaz | Reset timeout ile `HALF_OPEN` |
| `HALF_OPEN` | Reset timeout sonrasında ilk probe | Tek probe çalışır | Success ile `CLOSED`, failure ile `OPEN` |
| `QUARANTINED` | Auto circuit veya manual quarantine | Scope operation'dan dışlanır | Expiry/manuel clear; breaker state ayrıca korunur |

Auto quarantine `resetTimeoutMs` sonrasında expire olur. Manual quarantine expiry'siz oluşturulabilir ve yalnız doğru tenant + resource scope'unda geçerlidir. Manual quarantine, `recordSuccess` tarafından otomatik olarak silinmez; operatör clear kararı gerekir.

## 4. Scope ve tenant isolation

Circuit key şu bileşimden oluşur: `tenantId`, resource kind (`PROVIDER` veya `TARGET`) ve resource ID. Aynı provider veya target farklı tenant'ta failure nedeniyle bloklanmaz. Snapshot ve quarantine output'ları yalnız güvenli scope/status/counter/timestamp alanlarını içerir; credential, endpoint, response body, cookie veya authorization değeri taşımaz.

HTTP controller mevcut plan'daki `tenantId + targetId` ile target breaker'a bağlanır. Provider adapter veya orchestration katmanı aynı registry'yi provider scope'unda kullanabilir. Registry kendisi alternatif resource seçmediği için provider selection ve lease policy sınırları korunur.

## 5. Failure sınıfları ve davranış

| Failure sınıfı | Breaker kaydı | Retry davranışı |
|---|---:|---|
| HTTP 5xx | Evet | P05-T03 delay + P05-T05 budget ile bounded |
| HTTP 429/425 | Evet | Retry-After/backoff ile bounded; policy bypass yok |
| HTTP 408/timeout | Evet | Backoff/budget ile bounded |
| Retryable transport/provider exception | Evet | Caller policy'si içinde bounded |
| HTTP 2xx | Success reset | Retry yok |
| HTTP 401/407 | Hayır | Terminal authentication |
| HTTP 403/policy | Hayır | Terminal policy |
| CAPTCHA/challenge/WAF | Hayır | Terminal anti-bot; bypass yok |
| Client/validation error | Hayır | Terminal |

HTTP response'ta server/rate-limit/timeout/dependency failure görüldüğünde operation sonrası `recordFailure` çağrılır. Exception durumunda classifier sonucu retryable dependency/timeout ise aynı kayıt yapılır ve exception yeniden fırlatılır; worker mevcut error taxonomy ve retry budget akışını tüketir.

## 6. Quarantine yönetimi

`quarantine` API'si manual veya circuit kaynaklı reason code ile kayıt oluşturur. `clearQuarantine` tenant/resource scope'u ve isteğe bağlı source filtresiyle çalışır. Expired quarantine access sırasında temizlenir. Circuit kaynaklı auto quarantine başarıyla kapanan probe sonrasında temizlenir; manual quarantine açık kalabilir.

`assertAllowed` başarısız olduğunda `CircuitBreakerError` döner. Error code `RESOURCE_QUARANTINED`, `CIRCUIT_OPEN` veya `CIRCUIT_HALF_OPEN_BUSY` olabilir ve reset/expiry bilgisi `retryAfterMs` olarak bounded biçimde taşınır. Bu hata yeni provider seçmez, browser fallback başlatmaz ve hedef policy'sini değiştirmez.

## 7. Test kanıtı

`test/http/circuit-breaker.test.ts` içinde **5 test** bulunmaktadır. Testler failure threshold ile open/auto-quarantine, reset timeout sonrası tek half-open probe, başarılı probe ile close, manual quarantine tenant/resource isolation, terminal scope validation ve expiry cleanup davranışlarını doğrular.

`test/http/reliability.test.ts` içinde HTTP 503 response ve retryable transport exception'ın target breaker'a kaydedilip sonraki operation'ın çağrılmadığı doğrulanır. P05-T04 özel suite'i lint ve strict typecheck ile başarılıdır. Son tam backend regression sonucu **37 test dosyası / 176 test** başarılıdır; `pnpm lint`, `pnpm typecheck`, `pnpm test --run` ve `pnpm build` geçmiştir.

## 8. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Provider integration | Registry provider scope destekliyor; HTTP controller target scope'a bağlı | P05-T08/provider staging |
| Distributed state | Process-local Map | M5 gate/integration |
| Queue scheduling | Breaker error retryAfter üretir; merkezi scheduler yok | P05-T05/P05-T06 |
| Retry budget | Mevcut temel budget | P05-T05 |
| Health threshold integration | Health registry ayrı sinyal üretir | P05-T07/P05-T08 |
| Persistence/audit | DB repository ve distributed audit açık | M5 gate |
| Load/chaos | Local deterministic tests | P05-T08 |

## 9. Review kararı talebi

P05-T04 circuit breaker ve provider/target quarantine paketi review'a sunulmuştur. Kullanıcı onayı sonrasında P05-T05 job/task retry budget ve escalation budget paketi hazırlanacaktır. Bu paketin amacı unsafe failover veya anti-bot bypass değil, failure threshold aşıldığında kontrollü trafik kesintisi ve açıklanabilir recovery sinyali üretmektir.

## References

[1]: ./phase-5-reliability-engine-task-board.md "Phase 5 Reliability Engine task board"
[2]: ./phase-5-reliability-engine-p05-t01-review.md "P05-T01 response classifier"
[3]: ./phase-5-reliability-engine-p05-t02-review.md "P05-T02 compliance guardrail policy"
[4]: ./phase-5-reliability-engine-p05-t03-review.md "P05-T03 backoff/jitter/Retry-After"
[5]: ./phase-4-proxy-intelligence-m4-gate.md "Proxy Intelligence M4 gate"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 5 task register"
[7]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP roadmap ve faz planı"
