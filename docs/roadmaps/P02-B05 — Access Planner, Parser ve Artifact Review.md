# P02-B04/P02-B05 — Access Planner, Parser ve Artifact Review

**Program:** Scraping Platform  
**Milestone:** M2 — HTTP Engine Accepted  
**Task:** P02-B04, P02-B05  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P02-B02/P02-B03 — kullanıcı onaylı

## 1. Teslim özeti

HTTP worker artık direct/proxy erişim kararını provider-agnostic `HttpAccessPlanner` üzerinden alır. Direct access target policy tarafından açıkça izinleniyorsa `DIRECT` planı üretilir. Proxy zorunlu olup aktif manager veya proxy request yoksa terminal `PROXY_REQUIRED_UNAVAILABLE` sonucu verilir. Proxy manager acquire hatası retryable `PROXY_ACQUIRE_FAILED` olarak sınıflandırılır; başarılı veya başarısız execution sonrasında lease release çağrısı yapılır.

HTTP response başarıyla alındığında parser content type'a göre JSON, HTML/XHTML veya plain text sınıfı üretir. Raw response body queue mesajında taşınmaz; bounded body tenant/job/task/attempt scope'lu storage key ile `HttpArtifactWriter` üzerinden yazılır ve result yalnız artifact metadata, checksum, byte ölçüsü, parse summary ve güvenli response header'larını taşır.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/access-plan.ts` | Direct/proxy access plan, provider-neutral lease ve release contract |
| `src/http/response-parser.ts` | JSON/HTML/text parser, unsupported/malformed content errors ve artifact writer |
| `src/workers/http-worker.ts` | Access planner, parser, artifact writer ve result envelope entegrasyonu |
| `test/http/access-plan.test.ts` | Direct/proxy, provider failure ve lease lifecycle testleri |
| `test/http/response-parser.test.ts` | Content type, parse error, storage metadata testleri |
| `test/http/http-worker.test.ts` | Artifact reference, proxy unavailable, result correlation testleri |

## 3. Access plan sözleşmesi

| Durum | Access plan | Result/error | Retry |
|---|---|---|---:|
| Direct izinli | `{ mode: 'DIRECT' }` | HTTP client direct transport | HTTP sonucuna göre |
| Direct kapalı, proxy planı yok | Yok | `PROXY_REQUIRED_UNAVAILABLE` | Hayır |
| Proxy manager yok | Yok | `PROXY_REQUIRED_UNAVAILABLE` | Hayır |
| Proxy lease alındı | `{ mode: 'PROXY', lease }` | Proxy transport'a aktarılır | HTTP sonucuna göre |
| Provider acquire başarısız | Yok | `PROXY_ACQUIRE_FAILED` | Evet |
| Proxy transport adapter yok | Lease var, transport reject | `PROXY_TRANSPORT_NOT_CONFIGURED` | Hayır |

Proxy lease yalnız `leaseId`, provider, endpoint ve credential reference taşır. Raw proxy credential access planına veya queue envelope'ına yazılmaz. Gerçek provider adapter ve proxy endpoint'in transport'a uygulanması sonraki provider integration kapsamıdır.

## 4. Parser ve artifact davranışı

| Content type | Parser sonucu | Queue result |
|---|---|---|
| `application/json` | JSON parse, field/record count | Parse summary + artifact metadata |
| `text/html` / `application/xhtml+xml` | HTML sınıfı, bounded body | Parse summary + artifact metadata |
| `text/plain` | Text sınıfı | Parse summary + artifact metadata |
| Missing/unsupported | Parser error | `UNSUPPORTED_CONTENT_TYPE`, retry yok |
| Malformed JSON | Parser error | `INVALID_JSON_RESPONSE`, retry yok |

Artifact key formatı şöyledir:

```text
tenants/{tenantId}/jobs/{jobId}/tasks/{taskId}/attempts/{attemptId}/response.body
```

Storage adapter checksum ve size metadata üretir. Phase 1 filesystem provider path traversal korumasını uygular; production S3-compatible adapter henüz bu repository kapsamında değildir.

## 5. Güvenlik ve veri minimizasyonu

HTTP worker result envelope'ında raw response body bulunmaz; body yalnız bounded parser/artifact akışında tutulur. Response header'larından yalnız cache/content/redirect/retry/etag gibi güvenli metadata seçilir; `Set-Cookie` ve hassas header'lar dışarıda bırakılır. Artifact metadata'da raw credential, cookie veya authorization değeri tutulmaz.

Access planner worker payload'ının tenant'ını değiştirmez. Worker, envelope context'ini authoritative kabul eder ve plan tenant/project/job/task/attempt/correlation/trace alanlarını bu context ile overwrite eder. Policy, access ve parser hataları otomatik anti-bot bypass veya sınırsız retry üretmez.

## 6. Test kanıtı

Bu paket sonrasında **19 test dosyasında 95 test** başarılıdır. `pnpm lint` ve `pnpm typecheck` başarılıdır. Test kapsamı; direct/proxy kararları, proxy manager yokluğu, provider acquire failure, release callback, JSON/HTML/text parser, malformed JSON, unsupported content, checksum metadata, storage failure, artifact result reference, private target failure ve context correlation senaryolarını içerir.

## 7. Açık sınırlar

| Konu | Durum | Sonraki kapsam |
|---|---|---|
| Gerçek proxy provider | Provider interface ve lease boundary hazır; gerçek adapter yok | P02-B04 devamı / Phase 4 Proxy Intelligence |
| Proxy-aware network transport | Custom fetch implementation üçüncü access plan argümanını alabilir; default fetch proxy lease'i uygulamaz | Provider/transport adapter |
| Parser extraction | Parse summary hazır; CSS/XPath/JSONPath field extraction yok | P02-B05 devamı / Extraction Engine |
| Rate/concurrency/cache | Henüz merkezi governor yok | P02-B06 |
| Error classifier/retry budget | HTTP status mapping temel seviyede | P02-B07 |
| DNS post-resolution pinning | Contract'te zorunlu, transport hardening pending | HTTP transport hardening |
| Wire-level compression metering | Fetch decoded stream limitli; wire byte ölçümü pending | HTTP transport hardening |

## 8. Review kararı talebi

P02-B04/P02-B05 implementation paketi review'a sunulmuştur. Onay sonrasında P02-B06 ile target/tenant concurrency, rate limit ve cache policy; ardından P02-B07 ile HTTP error classifier, Retry-After ve retry budget davranışı geliştirilecektir. Final M2 gate, gerçek HTTP fixture/worker integration ve operations kanıtları toplandıktan sonra hazırlanacaktır.

## References

[1]: ./phase-2-http-engine-p02-b01-review.md "P02-B01 HTTP request planı ve outbound policy"
[2]: ./phase-2-http-engine-p02-b02-b03-review.md "P02-B02/P02-B03 HTTP client ve worker implementation"
[3]: ./phase-2-http-engine-task-board.md "Phase 2 HTTP Engine task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı"
[6]: ../src/http/access-plan.ts "Access planner implementation"
[7]: ../src/http/response-parser.ts "Response parser ve artifact implementation"
