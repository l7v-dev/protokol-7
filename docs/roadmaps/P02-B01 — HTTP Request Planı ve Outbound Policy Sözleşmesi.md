# P02-B01 — HTTP Request Planı ve Outbound Policy Sözleşmesi

**Program:** Scraping Platform  
**Milestone:** M2 — HTTP Engine Accepted  
**Task:** P02-B01  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Owner:** Security Lead  
**Bağımlılık:** GATE-P01-M1 — `CONDITIONAL GO`, kullanıcı onaylı

## 1. Karar özeti

HTTP Worker, dış çağrıya çıkmadan önce immutable bir request planı üretir ve bu planı security policy, tenant scope, target snapshot ve attempt deadline ile doğrular. Plan yalnızca yürütülebilir referanslar ve sınırlı request metadata taşır; raw credential, cookie, authorization header değeri veya session state planın içine yazılmaz.

> **Temel kural:** Policy tarafından reddedilen bir hedef için HTTP bağlantısı başlatılmaz ve hata otomatik retry edilmez.

Phase 1'de route seviyesinde bulunan hostname egress kontrolü HTTP Worker sınırında genişletilecektir. Her redirect yeni URL olarak parse edilir, host/port/protocol ve resolved IP policy'den yeniden geçirilir. DNS resolution ile socket connection arasındaki adres tutarlılığı gerçek HTTP client implementasyonunda zorunlu kontrol olarak uygulanacaktır.

## 2. Request plan sözleşmesi

```ts
export type HttpMethod = 'GET' | 'POST';

export type AuthReference = {
  referenceId: string;
  kind: 'HEADER' | 'COOKIE' | 'BASIC_AUTH';
};

export type HttpRequestPlan = {
  tenantId: string;
  projectId: string;
  targetId: string;
  jobId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  method: HttpMethod;
  url: string;
  host: string;
  port: number;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  authReferences: AuthReference[];
  timeout: {
    connectMs: number;
    responseMs: number;
    totalMs: number;
  };
  limits: {
    requestBodyBytes: number;
    responseBytes: number;
    decompressedBytes: number;
    redirectCount: number;
  };
  policy: {
    allowedHosts: string[];
    allowedPorts: number[];
    allowRedirects: boolean;
    allowedMethods: HttpMethod[];
    allowedHeaderNames: string[];
    allowCookies: boolean;
    denyPrivateNetworks: boolean;
  };
  correlationId: string;
  traceId: string;
};
```

`HttpRequestPlan` worker tarafından yeniden yazılamaz. Worker yalnızca execution sonucu üretir; tenant, project, target, job, task, attempt, correlation ve trace alanları gelen envelope/context ile aynı kalır.

## 3. Policy evaluation sırası

| Sıra | Kontrol | Reddedilme kodu | Retry |
|---:|---|---|---:|
| 1 | Tenant/attempt scope ve plan bütünlüğü | `INVALID_EXECUTION_CONTEXT` | Hayır |
| 2 | URL parse, HTTP/HTTPS protocol | `TARGET_URL_INVALID`, `TARGET_PROTOCOL_NOT_ALLOWED` | Hayır |
| 3 | URL username/password yokluğu | `TARGET_CREDENTIALS_IN_URL` | Hayır |
| 4 | Host allowlist ve port allowlist | `TARGET_HOST_NOT_ALLOWED`, `TARGET_PORT_NOT_ALLOWED` | Hayır |
| 5 | Hostname private/loopback/link-local/metadata kontrolü | `PRIVATE_TARGET_BLOCKED` | Hayır |
| 6 | DNS resolve edilmiş her IP için egress kontrolü | `PRIVATE_TARGET_BLOCKED` | Hayır |
| 7 | Method ve request body boyutu | `HTTP_METHOD_NOT_ALLOWED`, `REQUEST_BODY_TOO_LARGE` | Hayır |
| 8 | Header name/value policy ve secret reference | `HEADER_NOT_ALLOWED`, `RAW_SECRET_NOT_ALLOWED` | Hayır |
| 9 | Deadline, concurrency ve rate budget | `HTTP_BUDGET_EXCEEDED`, `RATE_LIMITED` | `RATE_LIMITED` bütçeli |
| 10 | Proxy/direct access kararının policy ile uyumu | `ACCESS_PLAN_NOT_ALLOWED` | Hayır |

Aynı sıra initial URL ve her redirect için uygulanır. Redirect yeni bir host, port, protocol veya resolved IP getiriyorsa önceki URL için verilmiş izin otomatik olarak genişlemez.

## 4. Method, header, cookie ve auth sınırları

MVP HTTP Engine yalnız `GET` ve `POST` destekler. `POST` request body için ayrı byte limiti uygulanır; body limit aşımı bağlantı başlatılmadan reddedilir. `Transfer-Encoding` veya kontrol karakteri içeren belirsiz header davranışları client'a bırakılmaz.

Header allowlist canonical lowercase isimlerle tutulur. `Host`, `Content-Length`, `Connection`, `Transfer-Encoding`, `Proxy-Authorization` ve platform tarafından yönetilen tracing header'ları kullanıcı payload'ından override edilemez. Authorization/cookie gibi hassas değerler yalnız `AuthReference` ile çözülür; reference'ın secret value'su log, queue, audit, error detail veya result içine yazılmaz.

Cookie desteği policy'de açıkça `allowCookies=true` olmadan etkinleşmez. Cookie jar tenant/job/attempt sınırında ephemeral tutulur, worker kapanışında silinir ve başka tenant context'ine aktarılmaz. Phase 2'de kalıcı session storage kapsam dışıdır.

## 5. Redirect ve DNS güvenliği

Redirect takip edilecekse maksimum redirect sayısı plan içinde sabitlenir. Her `Location` değeri absolute URL'e normalize edilir; scheme downgrade, credential içeren redirect, allowlist dışı host/port ve private resolved IP reddedilir. Redirect döngüsü `REDIRECT_LIMIT_EXCEEDED` ile terminal olur.

Hostname policy tek başına yeterli kabul edilmez. Gerçek HTTP client aşamasında hostname resolve edilir, tüm A/AAAA sonuçları private/loopback/link-local/metadata policy'den geçirilir ve bağlantı yalnız onaylanan adres üzerinden kurulur. Rebinding riskini azaltmak için request boyunca resolve edilmiş adres ve bağlantı adresi karşılaştırılır.

## 6. Timeout ve response limitleri

| Limit | Sorumluluk | Aşım davranışı |
|---|---|---|
| Connect timeout | TCP/TLS bağlantısı | `CONNECT_TIMEOUT`, retry taxonomy kararına gider |
| Response timeout | İlk response header'ına kadar | `RESPONSE_TIMEOUT` |
| Total timeout | Tüm request/redirect/body akışı | `TOTAL_TIMEOUT` |
| Request body bytes | POST payload | Bağlantı öncesi `REQUEST_BODY_TOO_LARGE` |
| Compressed response bytes | Wire byte bütçesi | `RESPONSE_TOO_LARGE` |
| Decompressed response bytes | Açılmış content bütçesi | `DECOMPRESSED_RESPONSE_TOO_LARGE` |
| Redirect count | URL hop bütçesi | `REDIRECT_LIMIT_EXCEEDED` |

Response body sınırsız belleğe alınmaz. Client response stream'i limitleri izleyerek tüketir; parser'a yalnız kabul edilen content type ve boyuttaki içerik verilir. Limit aşımında raw response kısmi veri olarak publish edilmez.

## 7. Content type ve sonuç sözleşmesi

Phase 2 başlangıç desteği `text/html`, `application/json`, `application/xhtml+xml` ve sınırlı `text/plain` içindir. `Content-Type` missing veya desteklenmeyen ise response metadata saklanabilir, ancak parser aşamasına geçilmez ve `UNSUPPORTED_CONTENT_TYPE` terminal sonucu üretilir.

| Result class | Örnek kodlar | Varsayılan işlem |
|---|---|---|
| `SUCCESS` | `HTTP_2XX` | Parser/artifact aşamasına ilerle |
| `REDIRECTED_SUCCESS` | `HTTP_REDIRECTED_2XX` | Son URL ve hop metadata'sını kaydet |
| `RATE_LIMITED` | `HTTP_429` | Retry-After ve budget ile bekle |
| `CLIENT_ERROR` | `HTTP_4XX` | Default terminal; credential/policy alt sınıflandırılır |
| `SERVER_ERROR` | `HTTP_5XX` | Sınırlı retry budget |
| `TIMEOUT` | connect/response/total timeout | Budget varsa backoff |
| `POLICY_VIOLATION` | private, disallowed host, unsafe redirect | Terminal, retry yok |
| `UNSUPPORTED_CONTENT` | unsupported/malformed content | Terminal, retry yok |

## 8. Observability ve redaction

Her HTTP attempt `tenantId`, `projectId`, `jobId`, `taskId`, `attemptId`, `correlationId`, `traceId`, method, normalized host, status class, duration, response bytes, redirect count ve result class ile ölçümlenir. URL query içinde secret olabilecek değerler loglanmaz; raw header/cookie/body loglanmaz. Error detail yalnız safe code, status class ve bounded metadata içerir.

Önerilen düşük cardinality metrikleri şunlardır: `http_requests_total{method,status_class,result_class}`, `http_request_duration_ms{method,result_class}`, `http_response_bytes_total{content_type}`, `http_policy_denials_total{reason}`, `http_rate_limited_total{target_scope}` ve `http_timeouts_total{kind}`. Hostname, URL path, tenant ve job ID metric label olarak kullanılmaz.

## 9. Test matrisi

| Grup | Zorunlu senaryolar |
|---|---|
| Policy | HTTP/HTTPS allow, FTP reject, private IPv4/IPv6, metadata, URL credential, host/port mismatch |
| Method/body | GET/POST allow, unsupported method, body limit, forbidden header, cookie disabled |
| Redirect | Allowlisted redirect, host mismatch, protocol downgrade, credential redirect, loop, limit |
| Response | 2xx, 3xx, 4xx, 429 + Retry-After, 5xx, content type, compressed/decompressed limits |
| Timeout | Connect, first-byte/response, total deadline, cancellation |
| Security | Raw secret rejection, tenant context immutability, DNS private resolution, no retry on policy |
| Reliability | Retry budget, bounded backoff, duplicate result idempotency, metrics/log redaction |

## 10. Review kararları ve sonraki task bağlantısı

Bu task, HTTP Engine'in güvenlik ve request contract baseline'ıdır. Onay sonrasında P02-B02; client, method, header/cookie auth reference ve deterministic mock server fixture'larını implement edecektir. P02-B03 redirect, compression, content type ve response limits'i ekleyecek; P02-B04 proxy/direct access boundary'sini bağlayacaktır.

Phase 2'de gerçek proxy provider veya browser fallback uygulanmayacaktır. DNS post-resolution kontrolü için kullanılan resolver/client abstraction'ı provider ve browser fazlarında da tekrar kullanılabilir olmalıdır.

## References

[1]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[2]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve HTTP Engine kabul kriterleri"
[3]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 2 HTTP Scraping Engine task register"
[4]: ./phase-1-m1-gate.md "Phase 1 M1 gate"
[5]: ../src/security/egress-policy.ts "Phase 1 egress policy implementasyonu"
[6]: ../src/security/redaction.ts "Phase 1 secret redaction implementasyonu"
