# 03 — API Sözleşmesi

**Sürüm:** 0.1.0  
**Durum:** Tasarım  
**Base URL:** `/api/v1`

## 1. Sözleşme ilkeleri

API, Control Center ile dış entegrasyonların ortak giriş noktasıdır. Uzun süren crawl, browser veya extraction işlemleri senkron HTTP isteğinin yaşam süresine bağlanmamalıdır. İstemci bir Job oluşturduğunda API, iş kabul edilirse `202 Accepted` ve job kimliğini döndürür; durum ve sonuç daha sonra sorgulanır veya olay kanalı üzerinden bildirilir.

Tüm yazma uçları tenant kimliğini kimlik bağlamından alır. İstemci tarafından gönderilen `tenantId` yok sayılır veya doğrulama hatası üretilir. Kaynak kimlikleri opak olmalı, response gövdeleri camelCase, database kolonları snake_case kullanılmalıdır.

## 2. Ortak response envelope

Başarılı tekil kaynak response'u:

```json
{
  "data": {
    "id": "job_01J...",
    "type": "job",
    "attributes": {
      "status": "queued"
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Liste response'u:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01J...",
    "page": {
      "limit": 50,
      "nextCursor": "eyJpZCI6..."
    }
  }
}
```

İstemci, listeleme için offset yerine cursor pagination kullanmalıdır. `limit` varsayılan olarak 50, izin verilen üst sınır ise 200 olarak tanımlanmalıdır. Bu değerler ürün ihtiyacına göre konfigüre edilebilir; büyük sonuçlar export endpoint'ine yönlendirilmelidir.

## 3. Kimlik doğrulama ve başlıklar

| Başlık | Zorunluluk | Açıklama |
|---|---:|---|
| `Authorization` | Evet | Bearer token veya oturum kimliği |
| `Content-Type` | Yazma isteklerinde | `application/json` |
| `Accept` | Önerilir | `application/json` |
| `Idempotency-Key` | Kritik yazma uçlarında | Aynı niyetin tekrar üretilmesini önler |
| `X-Request-Id` | İsteğe bağlı | İstemci korelasyon kimliği; yoksa API üretir |
| `If-Match` | Güncellemede önerilir | Optimistic concurrency için ETag doğrulaması |

`Idempotency-Key` tenant ve endpoint kapsamıyla birlikte değerlendirilmelidir. Aynı anahtar farklı request gövdesiyle tekrar gönderilirse API `409 Conflict` döndürmelidir. Önceki istek hâlâ işleniyorsa `202` veya `409` davranışı endpoint sözleşmesinde açıkça belirtilmelidir; MVP'de `409` tercih edilir.

## 4. Kaynak uçları

| Kaynak | Uçlar | Açıklama |
|---|---|---|
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}` | Çalışma alanı yönetimi |
| Targets | `GET/POST /projects/{projectId}/targets`, `GET/PATCH/DELETE /targets/{id}` | Hedef ve policy yönetimi |
| Schemas | `GET/POST /projects/{projectId}/schemas`, `GET /schemas/{id}` | Schema sürümleri |
| Jobs | `GET/POST /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `POST /jobs/{id}/retry` | Job kontrolü |
| Tasks | `GET /jobs/{jobId}/tasks`, `GET /tasks/{id}` | Yürütme ayrıntısı |
| Datasets | `GET/POST /datasets`, `GET /datasets/{id}`, `GET /datasets/{id}/versions` | Dataset ve sürüm sorgusu |
| Records | `GET /dataset-versions/{id}/records` | Normalize edilmiş kayıtlar |
| Exports | `POST /dataset-versions/{id}/exports`, `GET /exports/{id}` | JSON, JSONL, CSV ve Parquet üretimi |
| Workers | `GET /workers`, `GET /workers/{id}` | Worker sağlık ve kapasite |
| Proxies | `GET /providers`, `GET /proxies/health` | Provider ve health görünümü |
| Metrics | `GET /metrics/summary` | Dashboard özetleri |
| Audit | `GET /audit-logs` | Yetkili denetim sorgusu |

## 5. Job oluşturma

`POST /api/v1/jobs` yeni bir iş başlatır.

### İstek

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
    "saveRawArtifacts": true
  },
  "callback": {
    "webhookId": "webhook_01J..."
  }
}
```

### Başarılı response — `202 Accepted`

```json
{
  "data": {
    "id": "job_01J...",
    "type": "job",
    "attributes": {
      "status": "queued",
      "runId": "run_01J...",
      "createdAt": "2026-08-26T10:00:00Z",
      "links": {
        "self": "/api/v1/jobs/job_01J...",
        "events": "/api/v1/jobs/job_01J.../events"
      }
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

API, `targetId` ve `schemaId` değerlerinin aynı tenant ve proje altında olduğunu doğrulamalıdır. `input.urls` hedefin allowlist ve domain policy sınırlarını aşamaz. Job kabulü sırasında erişim yapılmaz; erişim worker yürütmesi sırasında gerçekleşir.

## 6. Job sorgulama ve kontrol

`GET /jobs/{id}` job, son durum, sayaçlar, kalite özeti ve maliyet özeti döndürür. Büyük task ve record listeleri response'a gömülmemelidir.

`POST /jobs/{id}/cancel` yeni task dispatch'ini durdurur ve çalışan task'lara iptal sinyali gönderir. İptal edilemeyen bir dış çağrı, kontrol süresi içinde sonlanmazsa `cancellationRequested=true` olarak işaretlenir; worker sonucu geldiğinde job tamamlanma kuralı yeniden değerlendirilir.

`POST /jobs/{id}/retry` yalnızca retry edilebilir hata sınıflarını yeniden kuyruğa almalıdır. İstemci belirli bir task veya tüm başarısız job için kapsam belirtebilir:

```json
{
  "scope": "failed_tasks",
  "maxAttempts": 2,
  "reason": "Target temporarily unavailable"
}
```

## 7. Hata biçimi

```json
{
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "İstenen job bulunamadı.",
    "requestId": "req_01J...",
    "details": {},
    "retryable": false
  }
}
```

| HTTP | Kod örneği | Kullanım |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Gövde veya query parametresi hatalı |
| 401 | `UNAUTHENTICATED` | Kimlik doğrulama yok/geçersiz |
| 403 | `FORBIDDEN` | Kaynak yetki alanı dışında |
| 404 | `RESOURCE_NOT_FOUND` | Kaynak yok veya tenant dışında |
| 409 | `IDEMPOTENCY_CONFLICT` | Aynı anahtar farklı payload ile kullanıldı |
| 422 | `POLICY_VIOLATION` | Hedef veya operasyon policy'ye aykırı |
| 429 | `RATE_LIMITED` | API oran limiti aşıldı |
| 500 | `INTERNAL_ERROR` | Beklenmeyen sunucu hatası |
| 503 | `DEPENDENCY_UNAVAILABLE` | Kuyruk, database veya provider erişilemiyor |

Güvenlik nedeniyle tenant dışında bulunan kaynaklar için `403` ile `404` arasında bilgi sızıntısı oluşturacak ayrım yapılmamalıdır. MVP'de dış istemciye `404 RESOURCE_NOT_FOUND` dönülmesi önerilir.

## 8. Worker mesaj sözleşmesi

Kuyruk mesajları ortak envelope taşır:

```json
{
  "messageId": "msg_01J...",
  "messageType": "task.execute",
  "schemaVersion": 1,
  "tenantId": "tenant_01J...",
  "jobId": "job_01J...",
  "taskId": "task_01J...",
  "attemptId": "attempt_01J...",
  "issuedAt": "2026-08-26T10:00:01Z",
  "traceId": "trace_01J...",
  "payload": {
    "taskType": "http_fetch",
    "targetUrl": "https://example.com/products"
  }
}
```

Worker sonucu aynı `taskId` ve `attemptId` ile yayınlanmalıdır. Consumer, `messageId` veya `(taskId, attemptId)` idempotency kaydını kontrol etmeden sonucu kalıcılaştırmamalıdır. Başarılı, retry edilebilir ve terminal hata sonuçları ayrı event türleri olarak yayımlanmalıdır.

## 9. WebSocket olayları

Dashboard bağlantısı tenant ve kullanıcı yetkisi ile açılır. Aşağıdaki olaylar MVP için yeterlidir:

| Olay | Payload özeti |
|---|---|
| `job.created` | Job kimliği, status, createdAt |
| `job.status_changed` | Önceki ve yeni durum, neden |
| `job.progressed` | Toplam, tamamlanan, başarısız, kalan task sayısı |
| `job.completed` | Dataset version, quality score, cost summary |
| `job.failed` | Error summary, retryable |
| `worker.health_changed` | Worker kimliği, status, son heartbeat |
| `proxy.health_changed` | Provider, tip, health özeti |

Olaylar kayıp olabileceğinden dashboard bağlantı kurduğunda önce REST ile güncel snapshot almalı, sonra olay akışına abone olmalıdır. Olay payload'ları ekranı yeniden oluşturabilecek minimum alanları taşımalıdır.

## 10. Webhook teslimi

Webhook, tenant bazında tanımlanan dış endpoint'e yalnızca izin verilen olayları gönderir. Gönderim gövdesi job event envelope'ı ile aynı korelasyon kimliklerini taşımalıdır. İmza için paylaşılan secret kullanılmalı, timestamp ve nonce replay saldırılarını azaltmak için doğrulanmalıdır.

Teslimat başarısız olduğunda exponential backoff uygulanır. Maksimum deneme sayısı, son deneme zamanı ve son HTTP sonucu kayıt altına alınır. Kalıcı başarısızlık, job'ı başarısız yapmaz; webhook teslim durumu ayrı izlenir.

## 11. Versiyonlama ve uyumluluk

API yolu major sürümü taşır: `/api/v1`. Geriye dönük uyumlu alan eklemeleri aynı sürümde yapılabilir. Alan silme, anlam değiştirme veya durum değerlerini geriye dönük bozacak değişiklikler yeni major sürüm gerektirir. Queue message ve webhook payload'larında ayrıca `schemaVersion` bulunmalıdır.

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
