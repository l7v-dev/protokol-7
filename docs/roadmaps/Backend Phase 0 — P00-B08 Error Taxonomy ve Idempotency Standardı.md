# Backend Phase 0 — P00-B08 Error Taxonomy ve Idempotency Standardı

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B08 — Error taxonomy, HTTP mapping ve idempotency standardını tanımla  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B07 — Accepted  
**Owner:** Backend Lead

## 1. Amaç

Bu belge, API, Orchestrator ve worker katmanlarında oluşan hataların ortak bir sınıflandırma ve işleme standardına bağlanmasını sağlar. Hata kodu; kullanıcıya gösterilecek mesajdan, retry kararından, alarm seviyesinden ve incident yönlendirmesinden ayrı bir stable contract olarak ele alınır.

İkinci amaç, aynı kullanıcı niyeti veya aynı queue event'i tekrar işlendiğinde çift Job, çift Attempt, çift Dataset kaydı veya çift maliyet oluşmasını engellemektir.

## 2. Hata envelope

Tüm API hataları aşağıdaki biçimi kullanmalıdır:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "İstek doğrulanamadı.",
    "requestId": "req_01J...",
    "traceId": "trace_01J...",
    "retryable": false,
    "severity": "INFO",
    "details": [
      {
        "field": "seedUrl",
        "reason": "invalid_url"
      }
    ]
  }
}
```

`message` dış kullanıcıya güvenle gösterilebilecek açıklamadır. `details` içinde secret, SQL, stack trace, provider token, internal hostname, private IP veya başka tenant bilgisi bulunmaz. Teknik ayrıntı log/trace tarafında aynı `requestId` ve `traceId` ile bulunur.

## 3. Hata boyutları

| Boyut | Açıklama |
|---|---|
| `code` | Stable makine tarafından işlenebilir hata kimliği |
| `category` | `VALIDATION`, `AUTH`, `POLICY`, `DEPENDENCY`, `EXECUTION`, `DATA`, `INTERNAL` |
| `retryable` | Retry policy'nin temel girdisi |
| `severity` | `INFO`, `WARN`, `ERROR`, `CRITICAL` |
| `scope` | `REQUEST`, `TASK`, `ATTEMPT`, `JOB`, `SYSTEM` |
| `owner` | Hata çözümünden sorumlu backend workstream |
| `reason` | Provider/target/policy veya uygulama kaynak nedeni |
| `correlation` | Request/job/task/attempt/trace ilişkisi |

## 4. API hata taxonomy'si

### 4.1 İstemci, auth ve policy hataları

| Kod | HTTP | Retryable | Scope | Açıklama |
|---|---:|:---:|---|---|
| `VALIDATION_ERROR` | 400 | Hayır | REQUEST | Body, query, path veya schema geçersiz |
| `MALFORMED_JSON` | 400 | Hayır | REQUEST | JSON parse edilemedi |
| `UNAUTHENTICATED` | 401 | Hayır | REQUEST | Kimlik yok/geçersiz |
| `TOKEN_EXPIRED` | 401 | Hayır | REQUEST | Oturum veya token süresi dolmuş |
| `FORBIDDEN` | 403 | Hayır | REQUEST | Actor resource action yetkisine sahip değil |
| `RESOURCE_NOT_FOUND` | 404 | Hayır | REQUEST | Kaynak yok veya tenant dışı |
| `IDEMPOTENCY_CONFLICT` | 409 | Hayır | REQUEST | Aynı key farklı payload ile kullanıldı |
| `STATE_CONFLICT` | 409 | Duruma bağlı | RESOURCE | Kaynak geçerli state'te command kabul etmiyor |
| `POLICY_VIOLATION` | 422 | Hayır | TASK/JOB | Target, tenant, budget veya execution policy ihlali |
| `TARGET_NOT_ALLOWED` | 422 | Hayır | TASK | URL/host/port erişim allowlist dışında |
| `BUDGET_EXCEEDED` | 422 | Hayır | JOB | Maliyet veya attempt budget tükendi |
| `API_RATE_LIMITED` | 429 | Evet | REQUEST | API actor/tenant rate limit aşıldı |

### 4.2 Dependency ve sistem hataları

| Kod | HTTP | Retryable | Scope | Açıklama |
|---|---:|:---:|---|---|
| `DEPENDENCY_UNAVAILABLE` | 503 | Evet | SYSTEM | Database, queue, storage veya provider hazır değil |
| `DATABASE_TIMEOUT` | 503 | Sınırlı | REQUEST/TASK | Database operation deadline aştı |
| `QUEUE_UNAVAILABLE` | 503 | Evet | COMMAND | Queue publish/consume yapılamıyor |
| `STORAGE_UNAVAILABLE` | 503 | Evet | ATTEMPT | Artifact veya export storage yazılamıyor |
| `PROVIDER_UNAVAILABLE` | 503 | Evet | ATTEMPT | Provider health/connection başarısız |
| `INTERNAL_ERROR` | 500 | Belirsiz | SYSTEM | Beklenmeyen ve sınıflandırılmamış hata |
| `CONFIGURATION_ERROR` | 500 | Hayır | SYSTEM | Runtime config eksik/geçersiz |
| `NOT_IMPLEMENTED` | 501 | Hayır | REQUEST | Sözleşmede var, bu release'te aktif değil |

`500 INTERNAL_ERROR` dışarıya verilen son sınıf olmalıdır; iç logda root cause ve error fingerprint bulunmalıdır. `retryable` değeri belirsizse otomatik retry yapılmaz; owner incelemesi gerekir.

## 5. Execution ve extraction hata taxonomy'si

Bu hatalar API response'a doğrudan dönmek yerine Job/Task/Attempt result olarak kaydedilir; API bunları güvenli summary olarak gösterir.

| Kod | Retryable varsayılanı | Etki | Varsayılan işlem |
|---|:---:|---|---|
| `INVALID_URL` | Hayır | Task | URL normalize/validation başarısız |
| `DNS_RESOLUTION_FAILED` | Evet | Attempt | Bütçeli backoff |
| `CONNECT_TIMEOUT` | Evet | Attempt | Bütçeli retry |
| `RESPONSE_TIMEOUT` | Evet | Attempt | Bütçeli retry |
| `RESPONSE_TOO_LARGE` | Hayır | Attempt | Güvenli terminal |
| `UNSUPPORTED_CONTENT_TYPE` | Hayır | Attempt | Parser durur |
| `REDIRECT_POLICY_VIOLATION` | Hayır | Attempt | Yeni host policy dışı |
| `HTTP_401_UNAUTHORIZED` | Hayır | Attempt | Credential/policy review |
| `HTTP_403_BLOCKED` | Sınırlı | Attempt | Classifier + policy |
| `HTTP_404_NOT_FOUND` | Hayır | Attempt | Kaynak yok; crawl policy'ye göre skip |
| `HTTP_429_RATE_LIMITED` | Evet | Attempt/Target | Retry-After ve rate limit |
| `HTTP_5XX_SERVER_ERROR` | Sınırlı | Attempt | Backoff + circuit check |
| `CAPTCHA_DETECTED` | Hayır | Attempt/Job | Otomatik bypass yok; escalation |
| `BROWSER_CRASHED` | Sınırlı | Attempt | Context cleanup + worker health |
| `BROWSER_ACTION_TIMEOUT` | Sınırlı | Attempt | Action budget ve retry |
| `PROXY_LEASE_FAILED` | Evet | Attempt | Provider health/alternative policy |
| `PROXY_QUOTA_EXCEEDED` | Hayır | Job/Provider | Budget/quota escalation |
| `PARSER_ERROR` | Hayır | Attempt | Artifact korunur; extraction durur |
| `SELECTOR_NOT_FOUND` | Hayır | Record/Attempt | Field diagnostic ve quality impact |
| `JSON_PATH_NOT_FOUND` | Hayır | Record/Attempt | Field diagnostic ve quality impact |
| `NORMALIZATION_ERROR` | Hayır | Record | Field invalid |
| `SCHEMA_INVALID` | Hayır | Record/Batch | Invalid record staging |
| `QUALITY_BELOW_THRESHOLD` | Hayır | Job | Publish policy uygulanır |
| `LLM_INVALID_OUTPUT` | Sınırlı | Attempt | Strict parse/retry budget |
| `LLM_BUDGET_EXCEEDED` | Hayır | Job | AI fallback durur |
| `ARTIFACT_WRITE_FAILED` | Evet | Attempt | Storage retry/abort |
| `DATASET_PUBLISH_FAILED` | Evet | Job/Version | Transaction rollback/abort |

## 6. Retryability kararı

Retryability yalnızca `retryable=true` alanından okunmamalı; hata code, attempt sayısı, job budget, target policy, provider health, cancellation ve maliyet bütçesi birlikte değerlendirilmelidir.

```text
if cancellation_requested: terminal(CANCELLED)
if policy_violation: terminal(POLICY_VIOLATION)
if budget_exceeded: terminal(BUDGET_EXCEEDED)
if retryable && attempt_no < max_attempts && job_budget_available:
    schedule_with_backoff()
else:
    terminal_or_dlq()
```

Retry edilebilir durumlarda aynı stratejiyle sınırsız tekrar yasaktır. Strategy değişikliği gerekiyorsa bu, yeni effective strategy snapshot ve strategy event ile kaydedilir.

## 7. HTTP mapping kuralları

| Koşul | Dış response | İç kayıt |
|---|---|---|
| Body/query hatası | `400 VALIDATION_ERROR` | Request log; job oluşmaz |
| Auth yok | `401 UNAUTHENTICATED` | Auth audit; kaynak bilgisi sızmaz |
| Tenant/resource yetkisi yok | `404 RESOURCE_NOT_FOUND` veya policy standardı | Security log; cross-tenant bilgi yok |
| Policy ihlali | `422 POLICY_VIOLATION` | Audit + task terminal |
| API rate limit | `429 API_RATE_LIMITED` + retry hint | Rate metric |
| Queue/DB/storage kapalı | `503 DEPENDENCY_UNAVAILABLE` | Dependency health + alarm |
| Worker hedef hatası | Job detail içinde error summary | Attempt error + retry decision |
| Beklenmeyen exception | `500 INTERNAL_ERROR` | Fingerprint + trace + incident signal |

## 8. Idempotency kapsamı

`Idempotency-Key`, aynı niyeti temsil eden yazma işlemlerinde zorunludur:

| İşlem | Key kapsamı | Aynı request tekrarında |
|---|---|---|
| `POST /jobs` | Tenant + route + key | Aynı Job reference/response |
| `POST /jobs/{id}/cancel` | Tenant + job + action + key | Aynı cancellation sonucu |
| `POST /jobs/{id}/retry` | Tenant + job + normalized payload + key | Aynı retry command reference |
| `POST /exports` | Tenant + dataset version + key | Aynı export reference |
| Credential mutation | Tenant + resource + action + key | Aynı mutation sonucu |
| Webhook mutation | Tenant + resource + action + key | Aynı webhook config sonucu |

Queue event'lerinde ayrıca `messageId` veya `(aggregateId, eventSequence)` idempotency anahtarı kullanılır. Worker result'ta `(taskId, attemptId, resultVersion)` ile aynı sonuç iki kez uygulanmaz.

## 9. Idempotency record

| Alan | Açıklama |
|---|---|
| `id` | Idempotency record ID |
| `tenant_id` | Tenant scope |
| `scope` | Route/resource/command scope |
| `idempotency_key` | Client veya service key |
| `request_hash` | Normalize payload hash |
| `status` | `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXPIRED` |
| `resource_type`, `resource_id` | Oluşan kaynak reference |
| `response_status` | İlk response HTTP status |
| `response_body_ref` | Gerekirse güvenli response reference |
| `created_at`, `expires_at` | Retention süresi |

Unique constraint `(tenant_id, scope, idempotency_key)` bulunmalıdır. Aynı key farklı `request_hash` ile gelirse `IDEMPOTENCY_CONFLICT` döner. Raw credential veya hassas body idempotency kaydına yazılmaz.

## 10. Out-of-order ve duplicate event

Event consumer, event'in tenant, aggregate, schemaVersion ve sequence bilgilerini doğrular. Daha önce uygulanmış `messageId` duplicate sayılır ve aynı sonucu korur. Daha eski sequence yeni state'i geriye alamaz. Eksik sequence bulunduğunda consumer event'i bekletebilir veya reconcile command üretebilir; sessizce state atlamaz.

## 11. Error response redaction

Redaction katmanı response, log, trace, audit ve queue publish öncesinde çalışmalıdır. Aşağıdaki değerler maskelenir veya tamamen çıkarılır: `Authorization`, `Cookie`, `Set-Cookie`, API key, provider token, password, session state, private URL query, raw proxy URL ve response body.

## 12. P00-B08 kabul kriterleri

P00-B08 `Accepted` sayılması için:

1. API, execution, dependency ve data hataları stable code ile sınıflandırılmıştır.
2. HTTP status, retryability, severity ve scope mapping'i tanımlıdır.
3. Policy violation, CAPTCHA, credential ve SSRF/egress hatalarının terminal davranışı nettir.
4. Retry kararı attempt/job budget, cancellation ve policy ile bağlanmıştır.
5. API command ve queue result için idempotency key modeli tanımlıdır.
6. Duplicate request, duplicate result ve out-of-order event davranışı yazılıdır.
7. Error response/log/trace/audit redaction kuralları belirlenmiştir.
8. Backend Lead, SRE, Security, QA ve Orchestrator owner review'ü tamamlanmıştır.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../03-api-contract.md "Genel API sözleşmesi"
[3]: phase-0-m0-api-contract.md "Backend API contract"
[4]: phase-0-m0-backend-requirements.md "Backend gereksinim register'ı"
[5]: phase-0-m0-execution-domain.md "Extended execution domain"
[6]: phase-0-m0-backend-architecture.md "Backend architecture"
