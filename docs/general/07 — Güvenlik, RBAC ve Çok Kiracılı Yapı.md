# 07 — Güvenlik, RBAC ve Çok Kiracılı Yapı

**Sürüm:** 0.1.0  
**Durum:** Tasarım  
**Kapsam:** Kimlik, yetkilendirme, tenant izolasyonu, sırlar, audit ve veri koruma

## 1. Güvenlik hedefleri

Platformun güvenlik modeli; tenant verisinin karışmamasını, hedef credential'larının açığa çıkmamasını, worker'ların sınırlı yetkiyle çalışmasını, API ve dış callback'lerin doğrulanmasını ve tüm kritik işlemlerin geriye dönük incelenebilmesini amaçlar.

Güvenlik, yalnızca API Gateway'de uygulanan bir filtre değildir. Database sorgusu, queue mesajı, object storage anahtarı, proxy lease'i, browser context'i ve export bağlantısı tenant ve yetki bağlamı açısından kontrol edilmelidir.

## 2. Kimlik doğrulama

MVP'de Control Center kullanıcı oturumu ve programatik API key birlikte desteklenebilir. OAuth veya harici identity provider kullanılırsa API, provider token'ını doğrular ve kendi iç kullanıcı/tenant eşlemesini uygular. API key değerinin yalnızca hash'i kalıcı depoda tutulmalı, oluşturulduğu anda bir kez gösterilmeli ve son kullanım zamanı kaydedilmelidir.

| Kimlik türü | Kullanım | Saklama |
|---|---|---|
| Kullanıcı oturumu | Dashboard ve insan etkileşimi | HttpOnly, Secure, SameSite cookie veya kısa ömürlü token |
| API key | Harici entegrasyon ve otomasyon | Yalnızca hash + prefix + metadata |
| Service identity | API, worker ve scheduler arası iletişim | Kısa ömürlü imzalı kimlik veya workload secret |
| Provider credential | Proxy/LLM sağlayıcı erişimi | Secret manager referansı |
| Target credential | Yetkili hedef login/session | Şifreli secret referansı; raw değer loglanmaz |

Token ve session süreleri ortam politikasına göre yönetilmelidir. Revocation için kullanıcı, API key ve service identity seviyesinde iptal mekanizması bulunmalıdır.

## 3. RBAC modeli

Yetkilendirme, rol + tenant + resource scope birleşimi ile yapılır. Resource sahibi olmak tek başına her eylemi mümkün kılmaz; örneğin dataset okuyabilen bir kullanıcı credential yönetemez.

| Rol | Project | Target/Schema | Job/Run | Dataset/Export | Provider/Credential | Kullanıcı/Audit |
|---|---|---|---|---|---|---|
| `owner` | Tam | Tam | Tam | Tam | Tam | Tam |
| `admin` | Tam | Tam | Tam | Tam | Provider yönetimi; credential okuma yok | Kullanıcı yönetimi; audit okuma |
| `operator` | Okuma | Okuma/yazma | Başlatma/iptal/retry | Okuma/export | Health okuma | Audit okuma |
| `developer` | Okuma/yazma | Okuma/yazma | Başlatma/sorgu | Okuma/export | Adapter konfigürasyonu; secret değeri yok | Teknik audit |
| `viewer` | Okuma | Okuma | Okuma | Okuma | Yok | Sınırlı audit |
| `service_worker` | Sözleşmedeki project/target okuma | Job task kapsamı | Kendi task sonucu yazma | Staging batch yazma | Lease alma | Worker audit event'i |

Yetkiler kod içinde dağınık koşullar yerine merkezi policy fonksiyonları ile değerlendirilmelidir. Örnek:

```ts
can(actor, "job:retry", { tenantId, projectId, jobId })
can(actor, "credential:use", { tenantId, providerId })
can(actor, "dataset:export", { tenantId, datasetVersionId })
```

## 4. Tenant izolasyonu

Tenant context istekten, queue mesajından ve background job metadata'sından eksik olamaz. Repository katmanında tenant filtresi zorunlu olmalı; güvenlik kritik sorgularda resource ID ile birlikte tenant ID lookup yapılmalıdır.

Object storage anahtarı şu biçimde düzenlenmelidir:

```text
tenant/{tenantId}/project/{projectId}/job/{jobId}/attempt/{attemptId}/{artifactId}
```

Presigned URL oluşturulurken kaynak yetkisi yeniden doğrulanmalı ve URL kısa süreli olmalıdır. URL'yi bilen herkesin tenant içindeki başka artifact'lere erişebilmesi engellenmelidir.

## 5. Credential ve secret yönetimi

Provider veya hedef credential'ları uygulama loglarına, error details alanına, trace attribute'larına veya kullanıcıya dönen response'a yazılmamalıdır. Secret'lar ortam değişkeninde uzun süreli raw değer olarak dolaştırılmak yerine secret manager referansı üzerinden resolve edilmelidir.

Browser session state cookie ve localStorage içerikleri yüksek hassasiyetli artifact olarak kabul edilir. Debug amacıyla kaydedilecekse alan maskeleme, kısa retention ve açık tenant policy'si uygulanmalıdır. Screenshot ve PDF'ler kişisel veya ticari veri içerebileceğinden ham response ile aynı koruma seviyesinde tutulmalıdır.

## 6. Ağ ve worker güvenliği

| Katman | Zorunlu kontrol |
|---|---|
| API | TLS, request size limit, authentication, rate limit |
| Egress | Host/port allowlist, private network engeli, redirect yeniden doğrulama |
| Worker | Least privilege, process/container isolation, concurrency ve memory limiti |
| Browser | Isolated context, tenant session paylaşmama, script policy |
| Queue | Authenticated connection, tenant envelope, signed/internal message policy |
| Database | Ayrı servis hesabı, migration hesabı ayrımı, TLS ve network restriction |
| Storage | Private bucket, presigned URL, checksum, retention lifecycle |
| Admin | MFA önerilir, yüksek etkili işlemlerde yeniden doğrulama |

Kullanıcı tarafından verilen URL'ler SSRF açısından güvenilmeyen girdidir. DNS çözümleme, IP sınıfı, port, redirect ve bağlantı hedefi policy ile kontrol edilmelidir. URL fetcher'ın doğrudan kurum içi ağlara erişmesine izin verilmemelidir.

## 7. Input ve output güvenliği

URL, selector, XPath, JSONPath, action planı, schema ve webhook URL'si doğrulanmalıdır. Selector veya action girdileri worker runtime'ında ayrıcalıklı script olarak çalıştırılmamalıdır. Webhook endpoint'leri private network, loopback ve metadata IP'lerine yönlendirilmemeli; DNS çözümlemesi ve redirect'ler her teslimatta doğrulanmalıdır.

Extraction çıktısı güvenilmeyen dış veri olarak ele alınır. Dashboard'da HTML olarak render edilmemeli, export içinde formül enjeksiyonu gibi istemci tarafı riskleri azaltacak kaçış/formatlama yapılmalıdır. CSV export'larında spreadsheet formula başlangıç karakterleri için güvenli encoding policy'si uygulanmalıdır.

## 8. Audit log

Aşağıdaki eylemler audit log üretmelidir: login/logout, API key oluşturma/iptal, kullanıcı rol değişimi, target policy değişikliği, credential ekleme/kullanma/iptal, job başlatma/iptal/retry, dataset export, webhook değişikliği, provider değişikliği ve retention nedeniyle silme.

Audit kaydı en az şu alanları taşır:

```json
{
  "id": "audit_01J...",
  "tenantId": "tenant_01J...",
  "actorId": "user_01J...",
  "action": "job.retry_requested",
  "resourceType": "job",
  "resourceId": "job_01J...",
  "requestId": "req_01J...",
  "traceId": "trace_01J...",
  "occurredAt": "2026-08-26T10:00:00Z",
  "result": "accepted",
  "metadata": { "scope": "failed_tasks" }
}
```

Secret, cookie, authorization header, tamper edilebilir tam response body veya kişisel veri içeren serbest metadata audit'e eklenmemelidir. Audit log değişmez veya append-only depolama yaklaşımıyla korunmalıdır.

## 9. Data retention

Retention, tenant ve artifact türü bazında konfigüre edilir. Varsayılanlar ürün kararıyla belirlenmeli, kullanıcıya görünür olmalıdır. Dataset kayıtları, ham response, browser artifact'i, session state, log ve trace aynı süreye tabi olmak zorunda değildir.

| Veri | Önerilen politika |
|---|---|
| Job/Task/Attempt metadata | Uzun süreli operasyonel geçmiş; tenant policy'si ile silinebilir |
| Ham HTML/JSON response | Kısa/orta retention; yeniden extraction gereksinimine göre |
| Screenshot/PDF | Kısa retention; hassas içerik varsa daha kısa |
| Session/cookie state | İş tamamlanınca silme veya çok kısa retention |
| Dataset published version | Ürün ve sözleşme gereksinimine göre korunur |
| Debug log | Kısa retention, maskeli |
| Audit log | Uzun retention, append-only |

Silme işlemi database, queue/artifact referansı ve object storage tarafında tamamlanmalı; başarısız kalan parçalar için deletion retry ve alarm bulunmalıdır.

## 10. Güvenlik kabul kriterleri

MVP kabul edilmeden önce tenant dışı kaynak ID'si ile veri okunamadığı, worker mesajındaki tenant değişikliğinin reddedildiği, credential değerlerinin loglarda görünmediği, private IP ve metadata endpoint'lerinin engellendiği, presigned URL'nin süresinin dolduğu, webhook imzasının doğrulandığı ve rol matrisi dışındaki işlemlerin `403` veya eşdeğer güvenli yanıt verdiği test edilmelidir.

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
