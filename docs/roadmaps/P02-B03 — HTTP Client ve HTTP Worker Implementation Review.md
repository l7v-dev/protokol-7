# P02-B02/P02-B03 — HTTP Client ve HTTP Worker Implementation Review

**Program:** Scraping Platform  
**Milestone:** M2 — HTTP Engine Accepted  
**Task:** P02-B02, P02-B03  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P02-B01 — kullanıcı onaylı

## 1. Teslim özeti

HTTP Engine'in ilk uygulama paketi hazırlandı. `HttpClient`, immutable request planı üzerinden GET/POST request yürütür; outbound URL, host/port allowlist, method, header, body byte limiti, auth reference, cookie policy, redirect ve bounded response kontrollerini uygular. `HttpWorker`, `task.execute` envelope'ını alır, envelope'daki tenant/job/task/attempt/correlation/trace bağlamını authoritative kabul eder ve yalnız `task.succeeded` veya `task.failed` result envelope'ı üretir.

Raw authorization/cookie/secret değerleri request planına kullanıcı verisi olarak alınmaz. Hassas değerler yalnız resolver üzerinden geçici olarak request header'ına uygulanır; response tarafında yalnız güvenli metadata header'ları tutulur ve `Set-Cookie` dışarıda bırakılır.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/http/http-client.ts` | Request plan, GET/POST, auth reference, header policy, redirect, bounded body ve response metadata |
| `src/workers/http-worker.ts` | `HTTP_FETCH` task consumer, envelope context binding, success/failure result üretimi |
| `test/http/http-client.test.ts` | Client contract, limits, redirects, policy ve transport testleri |
| `test/http/http-worker.test.ts` | Worker correlation, policy failure ve non-HTTP routing testleri |
| `docs/phase-2-http-engine-p02-b01-review.md` | Onaylanan request/policy contract |

## 3. Davranış sözleşmesi

| Kontrol | Davranış | Sonuç |
|---|---|---|
| Method | Yalnız `GET`/`POST`; plan allowlist ile tekrar doğrulanır | `HTTP_METHOD_NOT_ALLOWED` |
| GET body | GET body reddedilir | `HTTP_BODY_NOT_ALLOWED` |
| URL | HTTP/HTTPS, host allowlist, port allowlist, private egress policy | `TARGET_*` veya `PRIVATE_TARGET_BLOCKED` |
| Header | Canonical allowlist; hop-by-hop ve platform header'ları override edilemez | `HEADER_NOT_ALLOWED` |
| Raw secret | Authorization/cookie header raw payload olarak verilemez | `RAW_SECRET_NOT_ALLOWED` |
| Auth reference | Secret value resolver'dan geçici alınır; bulunamazsa request yapılmaz | `AUTH_REFERENCE_NOT_FOUND` |
| Cookie | `allowCookies=false` ise resolver çağrılmadan reddedilir | `COOKIE_NOT_ALLOWED` |
| Redirect | Manual takip; her hop URL/host/port policy'den geçer; POST 303/301/302 sonrası GET'e dönüşür | `REDIRECT_*` veya policy error |
| Response | Body stream bounded okunur; decoded byte limiti uygulanır | `RESPONSE_TOO_LARGE`, `DECOMPRESSED_RESPONSE_TOO_LARGE` |
| Transport | Genel network rejection dependency error olarak sınıflandırılır | `HTTP_REQUEST_FAILED`, retryable |
| HTTP status | 2xx success; 429 ve 5xx retryable failure result | `HTTP_RATE_LIMITED`, `HTTP_SERVER_ERROR` |
| Worker context | Envelope tenant/job/task/attempt/correlation/trace alanları payload'ı override eder | Cross-tenant context değişmez |

## 4. Güvenlik ve uyum sınırı

Bu paket yalnız yetkili ve policy-allowed erişimi destekler. CAPTCHA, login barrier veya anti-bot mekanizması aşma davranışı yoktur. Policy/credential/unsupported content türleri otomatik retry edilmeyecek terminal sınıflardır; retry budget ve error classifier sonraki P02-B07 kapsamında merkezileştirilecektir.

Phase 1 egress policy hostname ve IP literal seviyesinde private/loopback/link-local/metadata hedeflerini engeller. DNS post-resolution ve socket address pinning, gerçek HTTP transport adapter'ının bir sonraki sertleştirme koşuludur; bu review'da tamamlanmış kabul edilmez.

Fetch runtime otomatik decompression yaptığı için mevcut client response body üzerinde decoded/decompressed byte limiti uygular. Wire-level compressed byte budget ve gerçek streaming transport ölçümü P02-B03'ün sonraki hardening adımıdır.

## 5. Test kanıtı

Yeni HTTP client/worker testleri; başarılı GET, POST auth reference, raw sensitive header, cookie denial, redirect allow/revalidation, POST-to-GET redirect, malformed redirect, redirect limit, port mismatch, request body limit, response body limit, invalid header value, transport rejection, worker result correlation ve non-HTTP task routing senaryolarını kapsar.

Bu paket sonrası kalite çalışmasında **17 test dosyası / 85 test** başarılıdır. `pnpm lint` ve `pnpm typecheck` de başarılıdır. Gerçek PostgreSQL/Redis integration runner'ı Phase 1'deki çevresel koşul nedeniyle bu paketin unit/contract testlerine dahil değildir.

## 6. Açık sınırlar

| Konu | Bu paketteki durum | Sonraki task |
|---|---|---|
| Proxy lease/provider | Adapter bağlanmadı; direct HTTP abstraction hazır | P02-B04 |
| Parser | Response body worker result içinde bounded metadata ile taşınıyor; parser yok | P02-B05 |
| Rate/concurrency/cache | Client seviyesinde merkezi governor yok | P02-B06 |
| Error classifier/retry budget | Worker temel status mapping yapıyor | P02-B07 |
| DNS post-resolution pinning | Policy contract'te zorunlu; transport implementasyonunda pending | HTTP transport hardening |
| Wire compressed byte limit | Fetch runtime decoded stream sınırı mevcut | Transport hardening |

## 7. Review kararı talebi

Bu paket P02-B02 ve P02-B03 için review'a sunulmuştur. Onay sonrasında P02-B04 ile HTTP Worker'ın proxy/direct access boundary'si, P02-B05 ile parser ve artifact metadata akışı geliştirilecektir. Kullanıcı review onayı gelmeden sonraki implementation task'larına geçilmeyecektir.

## References

[1]: ./phase-2-http-engine-p02-b01-review.md "P02-B01 HTTP request planı ve outbound policy"
[2]: ./phase-2-http-engine-task-board.md "Phase 2 HTTP Engine task board"
[3]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[4]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı"
[5]: ../src/http/http-client.ts "HTTP client implementation"
[6]: ../src/workers/http-worker.ts "HTTP worker implementation"
