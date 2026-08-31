# Backend Phase 0 — P00-B02 Gereksinim Register'ı

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B02 — Backend fonksiyonel gereksinimleri ve quality attribute'larını çıkar  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B01 — Accepted  
**Owner:** Solution Architect

## 1. Amaç

Bu register, M0'da onaylanan backend kapsamını test edilebilir fonksiyonel gereksinimlere ve kalite niteliklerine dönüştürür. Gereksinimler sonraki architecture, domain, API, queue, security, observability ve Phase 1 implementation task'larının traceability kaynağıdır.

Her gereksinim bir capability, öncelik, doğrulama yöntemi ve sahibiyle birlikte değerlendirilir. Gereksinim metni yalnızca ürün davranışını ifade eder; uygulama ayrıntısı ilgili design/ADR belgelerinde tutulur.

## 2. Öncelik ve doğrulama kodları

| Kod | Anlam |
|---|---|
| `MUST` | MVP veya güvenlik/uyum için zorunlu |
| `SHOULD` | Varsayılan olarak uygulanmalı; gerekçeli kararla ertelenebilir |
| `MAY` | Faz veya kapasiteye göre uygulanabilir |
| `UT` | Unit test ile doğrulanır |
| `IT` | Integration test ile doğrulanır |
| `E2E` | Uçtan uca senaryo ile doğrulanır |
| `REV` | Architecture/security/product review ile doğrulanır |
| `OPS` | Operasyonel gözlem/runbook kanıtıyla doğrulanır |

## 3. Fonksiyonel gereksinimler

### 3.1 Tenant ve kaynak yönetimi

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| FR-001 | Sistem tenant sınırını backend kaynaklarının kökü olarak kullanmalıdır. | MUST | IT, E2E | Tenant dışı kaynak ID'si ile okuma/yazma yapılamaz; negatif test geçer. |
| FR-002 | API Project oluşturma, listeleme, okuma, güncelleme ve durum değişikliğini desteklemelidir. | MUST | IT | Aynı tenant içinde CRUD çalışır; farklı tenant görünmez. |
| FR-003 | Target; URL, host, execution tercihi, allowlist ve erişim policy'si ile yönetilebilmelidir. | MUST | IT, REV | Target kaydı normalize edilir ve policy alanları schema ile doğrulanır. |
| FR-004 | Schema; alan adı, tip, zorunluluk, sınır, pattern ve version bilgisi taşımalıdır. | MUST | UT, IT | Geçersiz schema reddedilir; version immutable davranır. |
| FR-005 | Job oluşturma; project, target, schema ve input ilişkilerini doğrulamalıdır. | MUST | IT | Tenant/project tutarsızlığı `404/403` güvenli davranışıyla reddedilir. |
| FR-006 | Job kaydı source target, schema ve execution strategy snapshot'ını korumalıdır. | MUST | IT | Target sonradan değişse bile mevcut job'ın snapshot'ı değişmez. |
| FR-007 | Job status, progress summary, error summary, dataset reference ve cost summary sorgulanabilmelidir. | MUST | E2E | API job detail response'u task/record payload'ını sınırsız gömmeden özet döner. |
| FR-008 | Kullanıcı job iptal, retry ve gerekiyorsa pause/resume command'ı verebilmelidir. | MUST | E2E | Yetkili command queue'ya gider; yeni dispatch ve aktif task davranışı policy ile uyumludur. |

### 3.2 Orchestration ve execution

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| FR-009 | Orchestrator bir job'ı bir veya daha fazla task'a ayırabilmelidir. | MUST | IT | Task'lar job/run ile ilişkilendirilir ve dependency bilgisi taşır. |
| FR-010 | Her task yürütmesi ayrı bir attempt kaydı üretmelidir. | MUST | IT | Retry önceki attempt'i değiştirmez; yeni attempt ID oluşur. |
| FR-011 | Task dispatch versioned queue envelope ile yapılmalıdır. | MUST | IT | Envelope tenant, job, task, attempt, trace ve schemaVersion alanlarını içerir. |
| FR-012 | Worker task claim işlemi lease ve heartbeat ile korunmalıdır. | MUST | IT, E2E | Heartbeat kaybında lease süresi sonunda recovery/retry kararı oluşur. |
| FR-013 | Aynı command veya result delivery tekrarlandığında sonuç iki kez uygulanmamalıdır. | MUST | IT | Idempotency key/message ID ile duplicate kayıt ve duplicate publish oluşmaz. |
| FR-014 | Job/task state transition yalnızca tanımlı lifecycle geçişleriyle yapılmalıdır. | MUST | UT, IT | Geçersiz transition reddedilir ve hata/audit olayı yazılır. |
| FR-015 | Retry kararı hata sınıfı, attempt budget, job budget ve policy ile verilmelidir. | MUST | UT, IT | Terminal hata sınırsız retry olmaz; retryable hata bütçeyle sınırlanır. |
| FR-016 | Retry bütçesi tükendiğinde task dead-letter veya terminal state'e alınmalıdır. | MUST | IT, OPS | DLQ/recovery kaydı oluşur ve operator replay kontrollüdür. |
| FR-017 | Job sonucu task sonuçlarının tamamı ve publish policy ile hesaplanmalıdır. | MUST | E2E | Kısmi sonuç davranışı explicit policy olmadan başarı sayılmaz. |
| FR-018 | Orchestrator worker'ın yerine job completion kararı vermelidir; worker job'ı doğrudan complete edememelidir. | MUST | REV, IT | Worker result yalnızca event; state transition Orchestrator'dadır. |

### 3.3 Veri toplama stratejisi

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| FR-019 | Sistem HTTP-first strategy ile browser gerektirmeyen hedeflerde HTTP worker kullanmalıdır. | MUST | E2E | HTTP başarıyla sonuçlanıyorsa browser task'ı oluşturulmaz. |
| FR-020 | Browser fallback yalnızca target policy, tenant policy ve maliyet/retry bütçesi izin veriyorsa kullanılmalıdır. | MUST | E2E, REV | Policy kapalıysa fallback yapılmaz; reason code kaydedilir. |
| FR-021 | Proxy provider'lar ortak `ProxyProvider` interface arkasından kullanılmalıdır. | MUST | IT | Core service provider-specific SDK/response bilmez. |
| FR-022 | Erişim sonucu `SUCCESS`, `BLOCKED`, `RATE_LIMITED`, `CAPTCHA`, `TIMEOUT`, `SERVER_ERROR`, `POLICY_VIOLATION` gibi sınıflara ayrılmalıdır. | MUST | UT, IT | Aynı input için sınıf ve retryability deterministik kaydedilir. |
| FR-023 | Policy ihlali, yetkisiz hedef veya CAPTCHA için otomatik bypass davranışı olmamalıdır. | MUST | REV, E2E | Task güvenli şekilde terminal olur ve açık hata nedeni görünür. |
| FR-024 | Redirect, host, port, private network ve response size kontrolleri her erişim planında uygulanmalıdır. | MUST | IT, Security test | Redirect sonrası policy yeniden çalışır; private/metadata hedef reddedilir. |

### 3.4 Extraction, validation ve dataset

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| FR-025 | Extraction plan CSS/XPath, JSONPath ve kontrollü AI extraction modlarını ifade edebilmelidir. | MUST | IT | Plan mode ve version bilgisi attempt'e bağlanır. |
| FR-026 | Extraction çıktısı normalize edilmeden ve schema doğrulanmadan published dataset'e yazılmamalıdır. | MUST | E2E | Invalid record staging'de kalır veya açık invalid olarak ayrılır. |
| FR-027 | Validator field-level hata nedeni, valid/invalid durumu ve quality score üretmelidir. | MUST | UT, IT | Eksik/yanlış tip/limit/pattern hataları ayrıştırılabilir. |
| FR-028 | Dataset version source job, schema version, extraction plan ve checksum lineage'i taşımalıdır. | MUST | E2E | Published record kaynağa ve attempt'e geri izlenebilir. |
| FR-029 | Dataset publish iki aşamalı veya eşdeğer atomic davranışla yapılmalıdır. | MUST | IT | Yarım işlem published görünmez; abort/recovery kaydı oluşur. |
| FR-030 | Export işlemi tenant yetkisiyle korunmalı ve süreli artifact erişimi sağlamalıdır. | MUST | E2E, Security test | Yetkisiz export ve süresi geçmiş link çalışmaz. |

### 3.5 Scheduler ve entegrasyon

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| FR-031 | Scheduler, due schedule execution'dan job üretebilmelidir. | SHOULD | IT | Aynı schedule penceresinde duplicate job oluşmaz. |
| FR-032 | Webhook teslimleri signed payload, delivery status ve retry geçmişi taşımalıdır. | SHOULD | IT | İmza doğrulanır; kalıcı teslim hatası ayrı görünür. |
| FR-033 | Backend status değişimlerini event olarak yayınlayabilmelidir. | MUST | IT, E2E | `job.status_changed`, `job.completed`, `job.failed` olayları korelasyon taşır. |
| FR-034 | API uzun işlerde request'i bloklamadan kabul response'u vermelidir. | MUST | E2E | Job create `202` ve job ID döner; iş queue'da yürür. |

## 4. Kalite nitelikleri

### 4.1 Güvenlik ve uyum

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| NFR-SEC-001 | Her repository ve queue consumer tenant scope uygulamalıdır. | MUST | Security test | Cross-tenant query ve event replay başarısız olur. |
| NFR-SEC-002 | Credential, cookie, auth header, raw secret veya hassas query log/trace/API response'a yazılmamalıdır. | MUST | Security test | Redaction testinde hassas pattern bulunmaz. |
| NFR-SEC-003 | URL fetcher SSRF, private IP, metadata endpoint, unsafe port ve DNS/redirect risklerine karşı korunmalıdır. | MUST | Security test | Deneme istek yapılmadan güvenli reddedilir. |
| NFR-SEC-004 | Browser context ve session state tenant'lar arasında paylaşılmamalıdır. | MUST | E2E, Security test | Context cleanup ve cross-tenant leakage testleri geçer. |
| NFR-SEC-005 | Kritik yönetim ve veri işlemleri append-only audit event üretmelidir. | MUST | IT, OPS | Job, credential, role, export ve policy eylemleri audit'te bulunur. |
| NFR-SEC-006 | API ve service identity yetkileri least privilege olmalıdır. | SHOULD | REV | Service matrix ve erişim kanıtı mevcuttur. |

### 4.2 Güvenilirlik ve veri bütünlüğü

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| NFR-REL-001 | Queue ve database arasındaki command publish kaybı önlenmeli veya reconcile edilebilir olmalıdır. | MUST | IT, E2E | Outbox/reconcile testi kayıp command'ı tespit eder. |
| NFR-REL-002 | Worker crash, heartbeat kaybı ve network timeout sonrası task recovery uygulanmalıdır. | MUST | Chaos-lite, E2E | Orphan task güvenli biçimde retry/terminal olur. |
| NFR-REL-003 | Retry mekanizması exponential backoff, jitter, max delay ve bütçe kullanmalıdır. | MUST | UT, IT | Retry storm testi limit ve delay beklentisini karşılar. |
| NFR-REL-004 | İşlenmiş result event tekrarında dataset ve cost duplicate olmamalıdır. | MUST | IT | Duplicate event idempotent biçimde ignore veya same-result olur. |
| NFR-REL-005 | Dataset publish sonrasında version metadata ve record lineage değişmez olmalıdır. | MUST | IT | Source job/schema/attempt ilişkisi korunur. |

### 4.3 Performans ve kapasite

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| NFR-PERF-001 | API job create ve resource read işlemleri uzun worker işlerinden bağımsız çalışmalıdır. | MUST | Load/E2E | API, worker yoğunluğu altında kabul davranışını korur. |
| NFR-PERF-002 | Queue worker concurrency target, tenant, provider ve worker kapasitesiyle sınırlanmalıdır. | MUST | Load | Global ve scoped limitler aşılmaz. |
| NFR-PERF-003 | Büyük response ve export işlemleri sınırsız belleğe yüklenmemelidir. | MUST | Load | Streaming/size limit davranışı gözlemlenir. |
| NFR-PERF-004 | Metrik label'larında yüksek cardinality alanlar kullanılmamalıdır. | SHOULD | Review | JobId/full URL gibi alanlar metric label değildir. |

### 4.4 Gözlemlenebilirlik ve işletim

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| NFR-OBS-001 | API → queue → worker → proxy → target → extraction → validation zinciri correlation ile izlenebilmelidir. | MUST | E2E, OPS | Trace/job/task/attempt bağlantısı tek aramayla kurulabilir. |
| NFR-OBS-002 | Backend logları yapılandırılmış JSON ve ortak alanlarla üretilmelidir. | MUST | IT | `service`, `version`, `requestId`, `traceId` ve ilgili kaynak ID'leri bulunur. |
| NFR-OBS-003 | Worker heartbeat, queue depth, task duration, error class, quality ve storage hataları ölçülmelidir. | MUST | OPS | Dashboard veya metric query ile sinyaller görünür. |
| NFR-OBS-004 | Kritik alarm bir owner, severity ve runbook aksiyonu içermelidir. | SHOULD | OPS | Sentetik alarm testinde doğru yönlendirme görülür. |

### 4.5 Maliyet ve data governance

| ID | Gereksinim | Öncelik | Doğrulama | Acceptance criteria |
|---|---|---|---|---|
| NFR-COST-001 | HTTP, browser, proxy, LLM, storage, compute ve retry tüketimi usage event olarak kaydedilmelidir. | MUST | IT | Usage event tenant/job/attempt ve unit ile ilişkilidir. |
| NFR-COST-002 | Job total cost ve cost per valid record yeniden hesaplanabilir olmalıdır. | MUST | IT | Aggregation raw usage event'lerden aynı sonucu üretir. |
| NFR-COST-003 | Browser/LLM/retry için tenant veya job budget cap uygulanabilmelidir. | SHOULD | E2E | Hard/soft cap aşımında belirlenmiş aksiyon gerçekleşir. |
| NFR-DATA-001 | Raw response, session state, dataset, log ve audit retention sınıfları ayrı tanımlanmalıdır. | MUST | REV, OPS | Her veri sınıfı owner ve deletion davranışı taşır. |
| NFR-DATA-002 | Silme işlemi database, object storage ve referansları birlikte ele almalıdır. | MUST | E2E | Deletion sonucu ve başarısız parça retry/audit kaydı üretir. |

## 5. Gereksinim traceability

| Tasarım artefact'ı | Kapsadığı gereksinim grubu | Sonraki task |
|---|---|---|
| Service boundary/ownership | FR-001–FR-018, NFR-REL | P00-B03, P00-B04 |
| Domain model/invariants | FR-001–FR-010, FR-028–FR-029 | P00-B05, P00-B06 |
| REST API contract | FR-002–FR-008, FR-030, FR-034 | P00-B07, P00-B08 |
| Queue contract | FR-009–FR-018, FR-033–FR-034, NFR-REL | P00-B09, P00-B10, P00-B11 |
| Security baseline | FR-019–FR-024, NFR-SEC | P00-B12, P00-B13 |
| Observability baseline | NFR-OBS, NFR-COST | P00-B15, P00-B16 |
| Adapter contract | FR-021, NFR-COST | P00-B17 |
| Phase 1 handover | Tüm MUST gereksinimleri | P00-B18 |

## 6. P00-B02 kabul kriterleri

P00-B02 `Accepted` yapılmadan önce aşağıdaki koşullar karşılanmalıdır:

1. Her MUST gereksinim için test veya review doğrulama yöntemi tanımlıdır.
2. Tenant, lifecycle, API, queue, security, observability, cost ve data governance gereksinimleri eksiksizdir.
3. Gereksinimler bir sonraki architecture/domain/API/security task'larına trace edilebilir.
4. Bir gereksinimin sahibi ve faz etkisi belirlenmiştir.
5. Çelişen veya açık kalan gereksinimler karar kaydına bağlanmıştır.
6. Product Owner, Backend Lead, SRE/Platform Lead ve Security Lead review'ü tamamlamıştır.

## 7. Açık noktalar

| Açık nokta | Etkilenen gereksinim | Varsayılan çözüm | Sahip |
|---|---|---|---|
| İlk authentication provider | FR-001–FR-008, NFR-SEC | Provider-agnostic interface; Phase 1'de seçim | EM + SEC |
| Outbox teknolojisi | FR-011–FR-016, NFR-REL-001 | PostgreSQL outbox veya eşdeğeri | BE + SRE |
| Resmi quality threshold | FR-027–FR-029 | Schema bazlı configurable threshold | PO + DE |
| Retention süreleri | NFR-DATA | Tenant/contract bazlı konfigürasyon | COMP + PO |
| İlk provider gerçek entegrasyonu | FR-020–FR-024, FR-021 | Uyum/maliyet review sonrası | PO + SRE + COMP |

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../01-architecture.md "Platform mimarisi ve bileşen tasarımı"
[3]: ../02-domain-model.md "Domain modeli ve veri sözlüğü"
[4]: ../03-api-contract.md "API sözleşmesi"
[5]: ../04-lifecycles.md "Yaşam döngüleri"
[6]: ../07-security-rbac.md "Güvenlik ve RBAC"
[7]: ../08-observability-cost.md "Gözlemlenebilirlik ve maliyet"
