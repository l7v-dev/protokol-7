# Backend Phase 0 — P00-B11 Reliability Policy

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B11 — Retry, backoff, DLQ, cancellation ve reconciliation policy'sini tasarla  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B10 — Accepted  
**Owner:** SRE/Platform Lead

## 1. Amaç

Bu policy, backend'in geçici hatalarda tekrar deneyebilmesini; kalıcı veya uyumla ilgili hatalarda durabilmesini; queue, worker ve database arasındaki tutarsızlıkları tespit edip kontrollü biçimde onarabilmesini tanımlar.

Reliability mekanizmasının hedefi, hata oranını ne pahasına olursa olsun düşürmek değildir. **Veri bütünlüğü, tenant sınırı, erişim policy'si ve maliyet bütçesi korunarak başarılı sonucu artırmak** temel hedeftir.

## 2. Retry katmanları

Queue delivery retry ile domain execution retry birbirinden ayrıdır:

| Katman | Neyi tekrarlar | Owner | Sayaç |
|---|---|---|---|
| Broker delivery retry | Consumer'ın mesajı işleyememesi veya ack kaybı | Queue runtime | `deliveryAttempt` |
| Domain task retry | HTTP/browser/crawl/extraction task'ının retryable sonucu | Orchestrator | `attemptNo` |
| Provider failover | Aynı task için uyumlu alternatif provider seçimi | Proxy Manager/Strategy | `strategyRevision` |
| Reconciliation replay | Eksik veya yarım kalmış domain event/command | Orchestrator/SRE | `reconcileRunId` |

Queue redelivery yeni domain Attempt üretmeyebilir; aynı message'ın tekrar teslimidir. Domain retry her zaman yeni Attempt ve yeni execution correlation üretir.

## 3. Hata sınıfına göre işlem

| Hata sınıfı | Örnek | Retry | Strategy değişimi | Nihai işlem |
|---|---|:---:|:---:|---|
| Geçici network | DNS geçici hata, connect timeout | Evet | Gerekirse | Backoff + budget |
| Rate limit | HTTP 429, provider quota warning | Evet | Rate düşür | Retry-After + backoff |
| Provider outage | Provider endpoint unavailable | Evet | Uyumlu provider | Circuit/failover |
| Server error | HTTP 5xx | Sınırlı | Gerekirse | Backoff; sonra terminal |
| Policy violation | Host/port/private IP yasak | Hayır | Hayır | Terminal |
| CAPTCHA | İnsan doğrulaması | Hayır | Bypass yok | Terminal/escalation |
| Credential error | Invalid/expired secret | Hayır | Hayır | Credential health alarmı |
| Invalid input | URL/schema/action geçersiz | Hayır | Hayır | Terminal |
| Extraction drift | Selector/JSONPath bulunamadı | Genellikle hayır | Kontrollü re-analysis | Quality/error sonucu |
| Storage transient | Artifact write timeout | Evet | Hayır | Storage retry |
| Unknown/internal | Sınıflandırılamayan exception | Belirsiz | Hayır | Quarantine + operator review |

## 4. Retry karar algoritması

```text
1. Cancellation kontrol et.
2. Policy violation veya terminal code ise retry etme.
3. Error catalog'tan retryability oku.
4. Attempt budget, job budget, tenant budget ve cost budget kontrol et.
5. Retry-After varsa policy limitleri içinde uygula.
6. Exponential backoff + jitter hesapla.
7. Aynı strategy ile tekrar veya kontrollü strategy revision kararı ver.
8. Yeni Attempt/task command oluştur ve reason code kaydet.
9. Budget yoksa FAILED veya DLQ sonucu üret.
```

Retry kararı yalnızca bir HTTP status code'a göre verilmemelidir. Aynı 403 veya 429 farklı target policy, provider sonucu veya tenant sözleşmesine göre farklı terminal/retry davranışına sahip olabilir.

## 5. Backoff standardı

Varsayılan hesap:

```text
baseDelay = 1 second
maxDelay = 5 minutes
jitter = random(0, baseDelay)
delay = min(baseDelay × 2^(attemptNo - 1) + jitter, maxDelay)
```

Üretim değerleri target/provider policy'si ile override edilebilir; ancak `maxDelay`, `maxAttempts` ve toplam job budget üst sınırı olmadan override yapılamaz. Retry-After değeri daha kısa veya uzun olsa bile tenant/target rate limit ve platform max delay sınırları korunur.

Queue delivery retry ile domain retry delay'leri ayrı tutulmalıdır. Bir consumer crash'i nedeniyle domain attempt sayacı artırılmamalıdır; gerçek execution başladıysa Attempt sonucu oluşturulmalıdır.

## 6. Retry bütçeleri

| Budget | Kapsam | Örnek kontrol |
|---|---|---|
| `maxAttemptsPerTask` | Tek task | Task 3 attempt'ten sonra terminal |
| `maxRetriesPerJob` | Job toplamı | 100 retry'dan sonra yeni retry yok |
| `maxBrowserFallbacks` | Job/target | Browser maliyeti sınırlanır |
| `maxProviderSwitches` | Job/target | Provider rotation sınırsız olmaz |
| `maxRetryCost` | Tenant/job | Estimated cost cap |
| `maxDuration` | Job/attempt | Total deadline |

Budget tüketimi append-only usage event ve job summary ile izlenir. Budget cap aşıldığında yeni task dispatch edilmez; aktif task cancellation veya doğal deadline ile kapanır.

## 7. Circuit breaker

Circuit breaker target/provider scope'unda uygulanabilir:

```text
CLOSED → OPEN → HALF_OPEN → CLOSED
                 └────────→ OPEN
```

| Durum | Davranış |
|---|---|
| `CLOSED` | Normal trafik; başarısızlıklar sayılır |
| `OPEN` | Yeni çağrılar bekletilir/reddedilir; retry storm engellenir |
| `HALF_OPEN` | Sınırlı health probe veya düşük hacimli deneme |

Circuit key; provider, target host, proxy class ve gerektiğinde geo ile ayrıştırılabilir. Global circuit, tek bir target'ın platformun tamamını durdurmasına neden olmamalıdır. Open/close kararı reason, threshold, cooldown ve evidence ile kaydedilir.

## 8. Provider failover

Failover yalnızca:

1. Target ve tenant policy alternatif provider'a izin veriyorsa.
2. Provider capability target ihtiyacını karşılıyorsa.
3. Maliyet ve job budget uygunsa.
4. Alternatif provider health durumu kullanılabilir görünüyorsa.
5. Aynı hatanın uyum/credential/policy kaynaklı olmadığı doğrulanıyorsa.

Failover, gizli bir retry olarak değil, yeni `strategyRevision` ve `providerSelection` event'i olarak kaydedilir. Provider failover, yetkisiz hedef veya CAPTCHA durumlarında kullanılmaz.

## 9. Cancellation policy

Cancel command kabul edildiğinde Orchestrator:

1. Job'ı `CANCEL_REQUESTED` yapar.
2. Yeni task dispatch'ini durdurur.
3. Queue'daki bekleyen task'lar için cancel marker veya revoke davranışı uygular.
4. Aktif worker'lara cancellation signal gönderir.
5. Worker/lease kapanışını deadline ile izler.
6. Tüm aktif işler kapanınca `CANCELLED` yapar.

Dış network çağrısı anında kesilemiyorsa aktif Attempt `cancellationRequested=true` ile izlenir. Cancel edilmiş job'dan sonra gelen stale result state'i veya published dataset'i değiştiremez.

## 10. Dead-letter queue

DLQ'ya alma nedenleri:

| Neden | Açıklama |
|---|---|
| Retry exhausted | Attempt veya job retry budget tükendi |
| Poison message | Payload parse edilemiyor veya sürekli consumer error üretiyor |
| Unsupported schema | Consumer message version'ı desteklemiyor |
| Inconsistent state | Job/task/attempt kaynak ilişkisi uyuşmuyor |
| Manual quarantine | Security/compliance/operator kararı |
| Unknown error | Güvenli otomatik karar verilemiyor |

DLQ mesajı raw secret veya büyük response taşımaz. En az message ID, queue, tenant/job/task/attempt reference, failure code, delivery count, payload hash, first/last failure time, replay policy ve operator note bulunur.

## 11. DLQ replay

Replay, yalnızca yetkili operator veya onaylı automation tarafından yapılır. Replay öncesi:

1. Message schemaVersion destekleniyor mu kontrol edilir.
2. Tenant, Job, Task ve Attempt hala geçerli mi kontrol edilir.
3. Job terminal/cancelled ise yeniden çalışmaya izin var mı değerlendirilir.
4. Retry ve cost budget tekrar kontrol edilir.
5. Aynı message/result daha önce uygulanmış mı kontrol edilir.
6. Replay audit event'i yazılır.

Replay yeni command/message ID üretebilir; causation chain korunmalıdır. Replay sonucu ayrıca raporlanır ve ilk DLQ kaydı silinmez.

## 12. Reconciliation kapsamı

Reconciliation read-only dry-run ile başlar:

| Kontrol | Bulgu örneği | Düzeltme |
|---|---|---|
| Outbox → queue | Publish edilmemiş outbox | Kontrollü republish |
| Queue → DB | Queue'da karşılığı olmayan task | Quarantine veya task repair |
| DB → queue | `DISPATCH_PENDING` yaşlanmış command | Republish/retry |
| Lease → task | Süresi geçmiş aktif lease | Fencing + recovery |
| Attempt → task | Sonucu var, task state güncel değil | Transition reconcile |
| Dataset staging | Publish edilmemiş yarım batch | Abort/cleanup veya review |
| Proxy lease | Orphan lease | Release/expire |
| Cost event | Eksik/duplicate usage | Rebuild veya correction event |
| Telemetry | Correlation eksik event | Completeness issue |

Otomatik düzeltme yalnızca idempotent, düşük etkili ve önceden onaylı kontrollerde yapılabilir. Job state, dataset publish, replay veya credential etkileyen düzeltmeler operator approval gerektirir.

## 13. Recovery sırası

Major incident sonrası önerilen recovery sırası:

1. Yeni dispatch'i ve riskli fallback'i sınırla.
2. Database ve queue health'i doğrula.
3. Orphan lease ve worker heartbeat durumunu kontrol et.
4. Outbox yaşlanmasını ve publish kaybını kontrol et.
5. Task/attempt reconciliation dry-run çalıştır.
6. DLQ ve poison message'ları karantinaya al.
7. En düşük riskli idempotent repair'leri uygula.
8. Job/dataset/cost summary'lerini yeniden hesapla.
9. Queue'yu kademeli aç.
10. Incident evidence ve kalıcı düzeltme task'larını kaydet.

## 14. Observability ve alarm

Zorunlu reliability sinyalleri: retry count, retry delay, retry budget remaining, DLQ count, outbox age, queue wait, lease age, heartbeat age, circuit state, provider failover count, cancellation age, reconciliation findings, stale result count ve unknown error count.

Alarm severity; yalnızca hata sayısına değil, etkilenen tenant/job sayısı, data loss riski, maliyet artışı ve dış trafiğe göre belirlenir.

## 15. P00-B11 kabul kriterleri

P00-B11 `Accepted` sayılması için:

1. Queue delivery retry ile domain execution retry ayrıştırılmıştır.
2. Error class, retryability, budget ve strategy change ilişkisi tanımlıdır.
3. Exponential backoff, jitter, Retry-After ve max limitleri yazılıdır.
4. Task/job/browser/provider/cost/duration budget'leri tanımlıdır.
5. Circuit breaker ve provider failover guardrail'ları belirlenmiştir.
6. Cancellation, deadline, stale result ve partial state davranışları açıklanmıştır.
7. DLQ kayıt modeli, replay ön koşulları ve audit davranışı tanımlıdır.
8. Reconciliation kontrolleri, dry-run ve güvenli recovery sırası kayıtlıdır.
9. SRE, Backend, Security, Compliance, QA ve Product review'ü tamamlanmıştır.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../04-lifecycles.md "Genel yaşam döngüleri"
[3]: phase-0-m0-lifecycle-contract.md "Backend lifecycle contract"
[4]: phase-0-m0-error-idempotency.md "Error taxonomy ve idempotency"
[5]: phase-0-m0-queue-contract.md "Queue topology ve message contract"
[6]: phase-0-m0-core-domain.md "Core domain model"
