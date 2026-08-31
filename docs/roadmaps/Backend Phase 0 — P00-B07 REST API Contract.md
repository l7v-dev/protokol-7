# Backend Phase 0 — P00-B07 REST API Contract

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B07 — REST resource ve command sözleşmesini tasarla  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B05 ve P00-B06 — Accepted  
**Owner:** Backend Lead

## 1. Amaç ve sınır

Bu belge, backend API'nin dış istemciler ve ileride Control Center tarafından kullanılacak REST sözleşmesini tanımlar. API, kaynak yönetimi ve uzun süren işlerin command kabulünden sorumludur; HTTP/browser/crawl/extraction yürütmesini request thread içinde yapmaz.

API contract'ın source of truth'u versioned OpenAPI dokümanı olmalıdır. Bu belge, Phase 0 için davranışsal ve veri sözleşmesidir; Phase 1'de OpenAPI YAML/JSON ile makine tarafından doğrulanır.

## 2. Genel kurallar

| Konu | Karar |
|---|---|
| Base path | `/api/v1` |
| Format | JSON request/response; UTF-8 |
| Resource ID | Opaque ID; istemci sıralı database ID varsayamaz |
| Time | UTC, ISO 8601 |
| Case | Request/response alanları camelCase; DB alanları snake_case |
| Long-running command | `202 Accepted` + job/command reference |
| List pagination | Cursor-based; default 50, hard maximum 200 |
| Correlation | `X-Request-Id` kabul edilir; yoksa API üretir |
| Auth | `Authorization: Bearer ...` veya eşdeğer provider adapter |
| Idempotency | Kritik POST command'larda `Idempotency-Key` zorunlu |
| Concurrency | Güncellemede `ETag`/`If-Match` önerilir |
| Errors | Ortak `error` envelope ve stable error code |

## 3. Request context

Her authenticated request aşağıdaki context'i üretir:

```json
{
  "requestId": "req_01J...",
  "traceId": "trace_01J...",
  "actorId": "user_01J...",
  "actorType": "user",
  "tenantId": "tenant_01J...",
  "roles": ["operator"],
  "scopes": ["project:read", "job:create"]
}
```

`tenantId` authenticated context'ten türetilir. İstemcinin body veya query içinde gönderdiği tenant ID yetki kaynağı olarak kullanılmaz. Service-to-service çağrılarda service identity, hedef resource scope'u ve correlation bilgisi birlikte doğrulanır.

## 4. Response envelope

### Tekil kaynak

```json
{
  "data": {
    "type": "job",
    "id": "job_01J...",
    "attributes": {
      "status": "QUEUED",
      "createdAt": "2026-08-26T10:00:00Z"
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "traceId": "trace_01J..."
  }
}
```

### Liste

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01J...",
    "page": {
      "limit": 50,
      "nextCursor": "opaque-cursor"
    }
  }
}
```

### Command kabulü

```json
{
  "data": {
    "type": "job",
    "id": "job_01J...",
    "attributes": {
      "status": "QUEUED",
      "runId": "run_01J...",
      "accepted": true
    },
    "links": {
      "self": "/api/v1/jobs/job_01J..."
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "traceId": "trace_01J..."
  }
}
```

API, record listesi, ham response veya browser artifact'ini kaynak detay response'una gömmemelidir. Bunlar ayrı uçlardan ve yetki kontrollü artifact/export reference olarak sunulur.

## 5. Hata sözleşmesi

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "İstek doğrulanamadı.",
    "requestId": "req_01J...",
    "traceId": "trace_01J...",
    "retryable": false,
    "details": [
      {
        "field": "seedUrl",
        "reason": "invalid_url"
      }
    ]
  }
}
```

`message` kullanıcıya uygun ve secret içermeyen açıklamadır. Stack trace, SQL, credential, provider raw response, internal hostname veya başka tenant kaynak bilgisi dış response'a çıkmaz.

| HTTP status | Stable code | Retryable | Kullanım |
|---:|---|:---:|---|
| 400 | `VALIDATION_ERROR` | Hayır | JSON/schema/query hatası |
| 401 | `UNAUTHENTICATED` | Hayır | Kimlik yok/geçersiz |
| 403 | `FORBIDDEN` | Hayır | Yetki yok |
| 404 | `RESOURCE_NOT_FOUND` | Hayır | Kaynak yok veya tenant dışında |
| 409 | `IDEMPOTENCY_CONFLICT` / `STATE_CONFLICT` | Duruma bağlı | Aynı key farklı payload veya optimistic conflict |
| 422 | `POLICY_VIOLATION` | Hayır | Target, egress, budget veya uyum policy ihlali |
| 429 | `API_RATE_LIMITED` | Evet | API rate limit |
| 500 | `INTERNAL_ERROR` | Belirsiz | Beklenmeyen hata |
| 503 | `DEPENDENCY_UNAVAILABLE` | Evet | DB/queue/storage bağımlılığı kullanılamıyor |

## 6. Project uçları

### `POST /api/v1/projects`

Project oluşturur. Body'de tenant ID kabul edilmez; tenant authenticated context'ten alınır.

```json
{
  "name": "Product Intelligence",
  "description": "Yetkili ürün verisi toplama projesi",
  "defaultPolicy": {
    "maxConcurrency": 4,
    "allowBrowserFallback": true
  }
}
```

Başarı: `201 Created`. `Location` header resource URL'sini gösterebilir.

### `GET /api/v1/projects`

Cursor pagination ve `status`, `name` filter'ları desteklenebilir. Response yalnızca caller'ın tenant'ındaki project'leri içerir.

### `PATCH /api/v1/projects/{projectId}`

İsim, açıklama ve default policy güncellenebilir. `If-Match` gönderilmişse ETag eşleşmesi zorunludur. Project archive edildiğinde aktif Job'ların davranışı ayrıca policy ile belirlenir; geçmiş dataset silinmez.

## 7. Target uçları

### `POST /api/v1/projects/{projectId}/targets`

```json
{
  "name": "Product Listing",
  "seedUrl": "https://example.com/products",
  "allowedHosts": ["example.com"],
  "allowedPorts": [443],
  "executionPolicy": {
    "preferredMode": "http",
    "allowBrowserFallback": true,
    "timeoutMs": 30000,
    "maxConcurrency": 4,
    "maxResponseBytes": 10485760
  },
  "crawlPolicy": {
    "maxDepth": 0,
    "maxPages": 1,
    "respectRobots": true
  }
}
```

API, URL parse, scheme, host, port, private network ve policy tutarlılığını doğrular. Target'a credential referansı gerekiyorsa body'de raw secret yerine `credentialId` verilir; credential kullanımı ayrıca authorization ve policy kontrolünden geçer.

### `GET /api/v1/targets/{targetId}`

Target config'in güvenli görünümünü döndürür. Credential raw value, provider token, cookie veya session state response'a eklenmez.

## 8. Schema uçları

### `POST /api/v1/projects/{projectId}/schemas`

```json
{
  "name": "product",
  "fields": {
    "productName": { "type": "string", "required": true },
    "brand": { "type": "string", "required": false },
    "price": { "type": "number", "required": true, "minimum": 0 },
    "currency": { "type": "string", "required": true }
  },
  "additionalProperties": false
}
```

Yeni schema logical name için version `1` oluşturulur. Published version güncellenmez; değişiklik yeni version üretir. Schema validation preview ayrı endpoint veya command olarak Phase 7'de genişletilebilir.

## 9. Job uçları

### `POST /api/v1/jobs`

Job oluşturur ve uzun süren execution'ı queue'ya kabul eder.

```json
{
  "projectId": "project_01J...",
  "targetId": "target_01J...",
  "schemaId": "schema_01J...",
  "input": {
    "urls": ["https://example.com/products"],
    "maxItems": 100
  },
  "options": {
    "preferredMode": "auto",
    "allowBrowserFallback": true,
    "saveRawArtifacts": true,
    "maxAttempts": 3
  }
}
```

API şu kontrolleri yapar: Project/Target/Schema aynı tenant ve project altında mı, Target aktif mi, Schema published mı, URL Target allowlist içinde mi, job policy budget ve concurrency sınırlarında mı? Başarılı kabulde Job/Run/Task ve idempotency kaydı oluşturulur. API dış hedefe henüz istek göndermez.

Başarı: `202 Accepted`.

### `GET /api/v1/jobs/{jobId}`

Job status, run, progress, strategy summary, quality summary, dataset version reference, cost summary ve son error summary döner. Raw task payload'ları ve secret referansları response'a çıkmaz.

### `POST /api/v1/jobs/{jobId}/cancel`

```json
{
  "reason": "operator_requested"
}
```

Başarıda job `CANCEL_REQUESTED` veya aktif task yoksa `CANCELLED` görünür. Cancellation request idempotent'tir.

### `POST /api/v1/jobs/{jobId}/retry`

```json
{
  "scope": "failed_tasks",
  "maxAdditionalAttempts": 2,
  "reason": "temporary_provider_failure"
}
```

Retry command yalnızca retryable error ve kalan budget için kabul edilir. Policy violation, credential error veya CAPTCHA gibi terminal durumlar otomatik retry edilmez.

## 10. Task ve Attempt sorguları

`GET /api/v1/jobs/{jobId}/tasks` task summary, task type, status, attempt count, current attempt ve error code döndürür. `GET /api/v1/tasks/{taskId}/attempts` attempt history, worker reference, duration, strategy summary, access result summary ve artifact references döndürür. Secret ve raw response yoktur.

## 11. Dataset ve export uçları

| Endpoint | Amaç |
|---|---|
| `GET /api/v1/datasets/{datasetId}` | Dataset metadata ve schema reference |
| `GET /api/v1/datasets/{datasetId}/versions` | Version listesi ve quality summary |
| `GET /api/v1/dataset-versions/{versionId}` | Published/staging version detail |
| `GET /api/v1/dataset-versions/{versionId}/records` | Cursor ile record listesi |
| `POST /api/v1/dataset-versions/{versionId}/exports` | JSON/JSONL/CSV/Parquet export command |
| `GET /api/v1/exports/{exportId}` | Export state ve süreli download reference |

Export uzun sürebileceğinden `POST` command `202` döndürür. Download link yalnızca yetki kontrolü sonrası, süreli ve iptal edilebilir olmalıdır.

## 12. Provider, health ve operasyon uçları

| Endpoint | Yetki | Amaç |
|---|---|---|
| `GET /api/v1/workers` | operator/admin | Worker type, version, status, capacity ve heartbeat |
| `GET /api/v1/providers` | operator/admin | Provider type, status, capability; secret yok |
| `GET /api/v1/providers/{providerId}/health` | operator/admin | Health snapshot ve son kontrol zamanı |
| `GET /api/v1/metrics/summary` | operator/admin | Job, queue, quality, cost özetleri |
| `GET /api/v1/audit-logs` | admin/security | Maskeli audit sorgusu |

## 13. Idempotency sözleşmesi

Aşağıdaki endpoint'lerde `Idempotency-Key` zorunludur: job create, job cancel, job retry, export create, credential/provider mutation ve webhook mutation. Key tenant + HTTP method + route scope'unda değerlendirilir.

Aynı key ve aynı normalized payload tekrarlandığında önceki response tekrar verilir. Aynı key farklı payload ile gönderilirse `409 IDEMPOTENCY_CONFLICT` döner. Idempotency record; request hash, response reference, status ve retention süresi taşır. In-flight duplicate request için ikinci istek mevcut command reference'ı alabilir; aynı işi yeniden üretmez.

## 14. Pagination ve filtreleme

Cursor opaque olmalı ve istemci tarafından decode edilebilir bir database ID varsayımı taşımamalıdır. Cursor; tenant, sort field, direction ve last seen value ile imzalanabilir. Liste response'larında varsayılan sort `createdAt desc` olarak önerilir. Filter'lar whitelist olmalı; raw SQL veya serbest order parametresi kabul edilmemelidir.

## 15. Rate limit ve backpressure

API rate limit tenant, actor ve route boyutunda uygulanır. Queue backlog veya dependency degradation API command kabulünü otomatik olarak belirsiz biçimde düşürmemelidir; gerekiyorsa `503 DEPENDENCY_UNAVAILABLE` veya budget/policy response'u açıkça dönmelidir. Worker target rate limit'i API rate limit'inden ayrı bir policy'dir.

## 16. Contract versioning

Breaking değişiklikler `/api/v2` gibi yeni major version ile yayımlanır. Yeni response alanı veya yeni optional request alanı minor uyumlu değişiklik sayılabilir. Queue ve webhook payload'ları ayrıca `schemaVersion` taşır. Deprecation için response header, doküman kaydı ve kaldırma tarihi bulunmalıdır.

## 17. P00-B07 kabul kriterleri

P00-B07 `Accepted` sayılması için:

1. `/api/v1` resource ve command listesi tanımlıdır.
2. Request context, tenant source, auth ve role scope kuralları yazılıdır.
3. Response, list, command ve error envelope örnekleri bulunmaktadır.
4. Project, Target, Schema, Job, Task, Attempt, Dataset ve Export uçları tanımlıdır.
5. `202` long-running davranışı, idempotency, pagination, ETag ve rate limit sınırları açıklanmıştır.
6. Secret, raw response ve cross-tenant bilgi sızıntısını engelleyen response kuralları vardır.
7. Phase 1 API implementation ve Phase 7/9/11 genişlemelerine trace edilebilir.
8. OpenAPI'ye dönüştürülebilecek kadar alan ve durum sözleşmesi netleşmiştir.
9. Backend Lead, Solution Architect, Security, QA ve Orchestrator owner review'ü tamamlanmıştır.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../03-api-contract.md "Genel API sözleşmesi"
[3]: phase-0-m0-backend-baseline.md "Backend M0 baseline"
[4]: phase-0-m0-backend-requirements.md "Backend gereksinim register'ı"
[5]: phase-0-m0-core-domain.md "Core domain model"
[6]: phase-0-m0-execution-domain.md "Extended execution domain"
