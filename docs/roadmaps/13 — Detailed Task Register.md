# 13 — Detailed Task Register

**Program:** Scraping Platform  
**Sürüm:** 1.0.0  
**Durum:** Baseline backlog  
**Yazar:** Manus AI

Bu belge Phase 0–16 arasındaki tüm task kayıtlarını içerir. Her task için iş paketi, owner, accountable, efor, dependency, milestone ve kabul kriteri tanımlıdır. Takip için düzenlenebilir Excel dosyası esas alınabilir.

## Phase 0 — Architecture & Specification

**Amaç:** Ürün sınırını, teknik sözleşmeleri ve kurumsal kontrol çerçevesini onaylamak.  
**Planlanan pencere:** 1–3. hafta  
**Exit gate:** Architecture Baseline Approved  
**Accountable:** Solution Architect

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P00-T01 | Governance | Execution | Ürün kapsamı, prensipler ve non-goals dokümanını onayla | Product Owner | 3 | — | No | MVP | Kapsam ve non-goals sponsor/PO tarafından imzalanır. |
| P00-T02 | Architecture | Execution | Fonksiyonel gereksinimleri ve kalite niteliklerini çıkar | Solution Architect | 5 | P00-T01 | No | MVP | Gereksinimler öncelik, kaynak ve kabul kriteri ile kayıtlıdır. |
| P00-T03 | Architecture | Execution | Context/container mimarisini ve servis sınırlarını tasarla | Solution Architect | 5 | P00-T02 | No | MVP | API, orchestrator, scheduler, worker, storage, proxy ve observability sınırları gözden geçirilmiştir. |
| P00-T04 | Data | Execution | Domain modeli ve veri sahipliğini tanımla | Solution Architect | 5 | P00-T03 | No | MVP | Varlıkların sahibi, lifecycle ve retention sorumlusu belirlenmiştir. |
| P00-T05 | Integration | Execution | REST, queue message, WebSocket ve webhook sözleşmelerini tasarla | Backend Lead | 5 | P00-T04 | No | MVP | Örnek request/response ve hata kodları contract review’dan geçmiştir. |
| P00-T06 | Reliability | Execution | Lifecycle, error taxonomy ve retry policy tasarla | SRE/Platform Lead | 4 | P00-T05 | No | MVP | Her terminal/retryable hata için işlem, bütçe ve sahip tanımlıdır. |
| P00-T07 | Security | Execution | Security model, RBAC, tenant ve data retention tasarla | Security Lead | 5 | P00-T06 | No | MVP | Güvenlik review’sunda kritik açık karar kalmamıştır. |
| P00-T08 | Operations | Execution | Observability ve cost attribution standardını tasarla | SRE/Platform Lead | 4 | P00-T07 | No | MVP | Korelasyon alanları ve cost categories onaylanmıştır. |
| P00-T09 | Governance | Milestone/Gate | Architecture review board onayı ve baseline dondurma | Solution Architect | 2 | P00-T08 | Yes | MVP | Sponsor, PO, EM, SEC ve SRE sign-off vermiştir. |

## Phase 1 — Core Platform

**Amaç:** API, orchestration, queue, database, storage ve temel çalışma altyapısını ayağa kaldırmak.  
**Planlanan pencere:** 4–8. hafta  
**Exit gate:** Core Platform MVP Ready  
**Accountable:** Engineering Manager

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P01-T01 | Platform | Execution | Monorepo, branch stratejisi ve CI pipeline kur | Engineering Manager | 4 | P00-T09 | No | MVP | Temiz checkout sonrası CI tüm kalite kapılarından geçer. |
| P01-T02 | Platform | Execution | Ortam konfigürasyonu ve secret reference altyapısını kur | SRE/Platform Lead | 3 | P01-T01 | No | MVP | Eksik/geçersiz config startup’ta güvenli şekilde reddedilir. |
| P01-T03 | Database | Execution | PostgreSQL migration altyapısını ve çekirdek şemayı oluştur | Backend Lead | 7 | P01-T02 | No | MVP | Migration tekrarlanabilir, tenant foreign key ve temel indeksler testlidir. |
| P01-T04 | Queue | Execution | Redis/BullMQ queue, routing ve retry altyapısını kur | Backend Lead | 6 | P01-T03 | No | MVP | Mesaj enqueue/consume, retry ve DLQ integration testleri geçer. |
| P01-T05 | API | Execution | Auth middleware, tenant context ve kaynak CRUD iskeletini geliştir | Backend Lead | 8 | P01-T04 | No | MVP | Tenant dışı resource erişimi engellenir; API contract testleri geçer. |
| P01-T06 | Orchestration | Execution | Job/task/attempt oluşturma ve temel dispatch akışını geliştir | Backend Lead | 10 | P01-T05 | No | MVP | Bir job queue üzerinden worker’a gidip sonuç kaydı oluşturur. |
| P01-T07 | Scheduling | Execution | Scheduler iskeletini ve schedule-to-job üretimini kur | Backend Lead | 5 | P01-T06 | No | MVP | Aynı schedule penceresinde duplicate job oluşmaz. |
| P01-T08 | Storage | Execution | S3-compatible storage adapter ve artifact metadata katmanını kur | SRE/Platform Lead | 5 | P01-T07 | No | MVP | Artifact yazılır, checksum doğrulanır ve süreli URL ile okunur. |
| P01-T09 | Quality | Milestone/Gate | Core Platform entegrasyon ve operasyon kabulünü tamamla | QA Lead | 6 | P01-T08 | Yes | MVP | API → queue → worker mock → DB/storage uçtan uca çalışır. |

## Phase 2 — HTTP Scraping Engine

**Amaç:** Browser gerektirmeyen hedeflerde güvenli ve ölçülebilir HTTP veri toplama akışını teslim etmek.  
**Planlanan pencere:** 9–12. hafta  
**Exit gate:** HTTP Engine Accepted  
**Accountable:** Backend Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P02-T01 | HTTP | Execution | URL, host, port ve request policy doğrulamasını geliştir | Security Lead | 5 | P01-T09 | No | MVP | İzin dışı host/port/private IP istekleri gönderilmeden reddedilir. |
| P02-T02 | HTTP | Execution | GET/POST client, headers, cookies ve auth reference desteğini geliştir | Backend Lead | 6 | P02-T01 | No | MVP | GET/POST ve izinli header/cookie akışları deterministik testlerle çalışır. |
| P02-T03 | HTTP | Execution | Redirect, compression, content-type ve response size kontrolünü ekle | Backend Lead | 5 | P02-T02 | No | MVP | Redirect host policy ile tekrar doğrulanır; limit aşımı güvenli kapanır. |
| P02-T04 | Proxy | Execution | HTTP Worker ile Proxy Manager entegrasyonunu bağla | SRE/Platform Lead | 5 | P02-T03 | No | MVP | Proxy lease attempt ile ilişkilendirilir ve secret loglanmaz. |
| P02-T05 | HTTP | Execution | Parser ve response artifact akışını geliştir | Data/Extraction Lead | 6 | P02-T04 | No | MVP | Desteklenen içerik türleri parse edilir; unsupported type sınıflandırılır. |
| P02-T06 | Reliability | Execution | Rate limit, concurrency ve cache policy katmanını ekle | SRE/Platform Lead | 6 | P02-T05 | No | MVP | Rate/concurrency sınırları ölçümlenir ve aşımda güvenli bekleme uygulanır. |
| P02-T07 | Reliability | Execution | HTTP error mapping ve retry davranışını tamamla | Backend Lead | 5 | P02-T06 | No | MVP | Retryable/terminal ayrımı taxonomy ile uyumludur. |
| P02-T08 | Quality | Milestone/Gate | HTTP Engine uçtan uca test ve kabulünü yap | QA Lead | 7 | P02-T07 | Yes | MVP | Kritik senaryoların tamamı otomatik testte geçer; Phase 2 gate imzalanır. |

## Phase 3 — Browser Engine

**Amaç:** Playwright/Chromium tabanlı, izole ve policy kontrollü browser yürütmesini teslim etmek.  
**Planlanan pencere:** 13–17. hafta  
**Exit gate:** Browser Engine Accepted  
**Accountable:** Backend Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P03-T01 | Browser | Execution | Playwright/Chromium runtime ve browser worker imajını hazırla | Backend Lead | 6 | P02-T08 | No | MVP | Worker temiz ortamda browser açıp kapatabilir. |
| P03-T02 | Browser | Execution | Browser pool ve kapasite yönetimini geliştir | Backend Lead | 8 | P03-T01 | No | MVP | Pool kapasite sınırını korur; crash sonrası task lease güvenli sonuçlanır. |
| P03-T03 | Security | Execution | Tenant-isolated browser context ve session state yönetimini geliştir | Security Lead | 7 | P03-T02 | No | MVP | Tenant session state başka tenant context’inde görülemez. |
| P03-T04 | Browser | Execution | Declarative page action DSL ve timeout sınırlarını geliştir | Backend Lead | 8 | P03-T03 | No | MVP | Serbest script çalıştırmadan temel actions güvenli şekilde yürür. |
| P03-T05 | Browser | Execution | Network interception ve kaynak policy kontrolünü ekle | Backend Lead | 6 | P03-T04 | No | MVP | Host, content type ve response boyutu policy ile kontrol edilir. |
| P03-T06 | Artifacts | Execution | Screenshot, PDF, DOM ve network artifact üretimini ekle | Backend Lead | 5 | P03-T05 | No | MVP | Artifact’ler attempt ile ilişkilendirilir ve private storage’da tutulur. |
| P03-T07 | Strategy | Execution | HTTP-to-browser fallback kararını orkestrasyona bağla | Solution Architect | 5 | P03-T06 | No | MVP | HTTP başarısızlığında yalnızca policy izin veriyorsa browser denenir. |
| P03-T08 | Quality | Milestone/Gate | Browser Engine performans, güvenlik ve E2E kabulünü yap | QA Lead | 8 | P03-T07 | Yes | MVP | Kritik browser senaryoları ve kaynak limitleri doğrulanır. |

## Phase 4 — Proxy Intelligence

**Amaç:** Provider abstraction, proxy health, lease, geo ve maliyet temelli seçim altyapısını kurmak.  
**Planlanan pencere:** 18–21. hafta  
**Exit gate:** Proxy Intelligence Ready  
**Accountable:** SRE/Platform Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P04-T01 | Proxy | Execution | ProxyProvider ortak arayüzü ve capability modelini tanımla | Solution Architect | 4 | P03-T08 | No | MVP | Provider adapter çekirdek iş mantığından bağımsız test edilebilir. |
| P04-T02 | Proxy | Execution | Provider credential ve adapter lifecycle’ını geliştir | SRE/Platform Lead | 6 | P04-T01 | No | MVP | Credential raw değeri tutulmadan adapter health alınır. |
| P04-T03 | Proxy | Execution | Proxy catalog, sınıf ve geo gereksinimi modelini oluştur | SRE/Platform Lead | 5 | P04-T02 | No | MVP | Target policy yalnızca izin verilen proxy class/geo kombinasyonlarını seçer. |
| P04-T04 | Proxy | Execution | Lease, sticky session ve rotation lifecycle’ını geliştir | Backend Lead | 6 | P04-T03 | No | MVP | Lease orphan kalmaz; timeout sonrası quarantine/release çalışır. |
| P04-T05 | Observability | Execution | Provider/proxy health score ve başarı oranı hesaplamasını ekle | SRE/Platform Lead | 6 | P04-T04 | No | MVP | Health sonuçları provider, host ve proxy class kırılımında izlenir. |
| P04-T06 | Strategy | Execution | Geo, provider health ve maliyet temelli seçim stratejisini uygula | SRE/Platform Lead | 6 | P04-T05 | No | MVP | Seçim kararı input sinyalleriyle tekrar üretilebilir ve açıklanabilir. |
| P04-T07 | FinOps | Execution | Proxy request/GB maliyet ölçümünü ekle | FinOps/Operations | 4 | P04-T06 | No | MVP | Proxy maliyeti attempt/job seviyesinde raporlanır. |
| P04-T08 | Quality | Milestone/Gate | Provider integration, failure injection ve kabul testlerini tamamla | QA Lead | 7 | P04-T07 | Yes | MVP | Provider failure platformu kontrolsüz retry’a sokmaz; gate imzalanır. |

## Phase 5 — Anti-Bot / Reliability Engine

**Amaç:** Saldırgan aşma yerine uyumlu hata sınıflandırması, backoff, circuit breaker ve bütçeli fallback sağlamak.  
**Planlanan pencere:** 22–25. hafta  
**Exit gate:** Reliability Controls Accepted  
**Accountable:** SRE/Platform Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P05-T01 | Reliability | Execution | Response classifier ve erişim sonucu taxonomy’sini geliştir | SRE/Platform Lead | 6 | P04-T08 | No | MVP | Aynı input aynı sınıfı üretir; sınıf ve confidence kaydedilir. |
| P05-T02 | Compliance | Execution | Uyumlu erişim ve anti-bot guardrail policy’sini onayla | Compliance/Legal | 4 | P05-T01 | No | MVP | Saldırgan bypass davranışı kapsam dışında bırakılmış ve test edilmiştir. |
| P05-T03 | Reliability | Execution | Exponential backoff, jitter ve Retry-After desteğini uygula | SRE/Platform Lead | 5 | P05-T02 | No | MVP | Retry fırtınası oluşmaz; delay ve nedenler telemetry’de görünür. |
| P05-T04 | Reliability | Execution | Circuit breaker ve provider/target quarantine mekanizmasını kur | SRE/Platform Lead | 6 | P05-T03 | No | MVP | Eşik aşımında trafik kontrollü durur ve health probe ile açılır. |
| P05-T05 | Cost Control | Execution | Job/task retry budget ve escalation budget uygula | Product Owner | 5 | P05-T04 | No | MVP | Budget aşımında task terminal olur; maliyet alarmı üretilir. |
| P05-T06 | Strategy | Execution | Güvenli strategy escalation akışını tamamla | Solution Architect | 5 | P05-T05 | No | MVP | Escalation yalnızca izinli modlarda ve sınırlı sayıda gerçekleşir. |
| P05-T07 | Operations | Execution | Reliability dashboard ve incident runbook güncelle | SRE/Platform Lead | 4 | P05-T06 | No | MVP | Operatör hata sınıfından ilgili aksiyona ulaşabilir. |
| P05-T08 | Quality | Milestone/Gate | Failure injection, load ve regression kabulünü yap | QA Lead | 8 | P05-T07 | Yes | MVP | Kritik hata senaryolarında veri bütünlüğü ve bütçe korunur. |

## Phase 6 — Extraction Engine

**Amaç:** CSS/XPath, JSONPath, normalize ve kontrollü AI extraction yeteneklerini sunmak.  
**Planlanan pencere:** 26–29. hafta  
**Exit gate:** Extraction Engine Accepted  
**Accountable:** Data/Extraction Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P06-T01 | Extraction | Execution | Extraction plan modelini ve versioning yapısını oluştur | Data/Extraction Lead | 5 | P05-T08 | No | MVP | Plan version job/attempt ile immutable ilişkilendirilir. |
| P06-T02 | Extraction | Execution | CSS/XPath extraction motorunu geliştir | Data/Extraction Lead | 8 | P06-T01 | No | MVP | Sentetik fixture’larda beklenen kayıtlar deterministik çıkarılır. |
| P06-T03 | Extraction | Execution | JSONPath/API extraction motorunu geliştir | Data/Extraction Lead | 7 | P06-T02 | No | MVP | JSON response’tan schema alanları doğru biçimde alınır. |
| P06-T04 | Extraction | Execution | HTML/DOM cleaner ve parse pipeline’ını geliştir | Data/Extraction Lead | 5 | P06-T03 | No | MVP | Cleaner veri kaynağını gereksiz içerikten arındırır, raw artifact korunur. |
| P06-T05 | Data | Execution | Normalize transform kütüphanesini geliştir | Data/Extraction Lead | 6 | P06-T04 | No | MVP | Transform idempotent’tir; raw ve normalized değerler izlenebilir. |
| P06-T06 | Quality | Execution | Extraction evidence ve field diagnostics modelini ekle | Data/Extraction Lead | 5 | P06-T05 | No | MVP | Her alanın sonucu ve eksiklik nedeni incelenebilir. |
| P06-T07 | AI | Execution | Kontrollü AI extraction adapter ve structured output akışını ekle | Data/Extraction Lead | 8 | P06-T06 | No | MVP | AI çıktısı schema validation olmadan publish edilemez; secret sızıntısı yoktur. |
| P06-T08 | Quality | Milestone/Gate | Extraction fixture, drift ve regression testlerini tamamla | QA Lead | 7 | P06-T07 | Yes | MVP | Temel hedef/schemalar için kalite baseline’ı kayıtlıdır. |

## Phase 7 — Schema Engine

**Amaç:** Schema sürümleme, validation, quality score ve publish threshold mekanizmasını tamamlamak.  
**Planlanan pencere:** 30–32. hafta  
**Exit gate:** Schema Quality Gate Ready  
**Accountable:** Data/Extraction Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P07-T01 | Schema | Execution | Schema definition contract ve field type sistemini kesinleştir | Data/Extraction Lead | 5 | P06-T08 | No | MVP | Schema parser geçerli/geçersiz tanımları ayırır. |
| P07-T02 | Schema | Execution | Schema versioning ve compatibility politikasını uygula | Backend Lead | 5 | P07-T01 | No | MVP | Eski job eski schema ile çalışır; breaking change yeni version ister. |
| P07-T03 | Validation | Execution | Schema validator ve normalized value kontrollerini geliştir | Data/Extraction Lead | 8 | P07-T02 | No | MVP | Validator field-level hata nedeni ve valid/invalid ayrımı döndürür. |
| P07-T04 | Quality | Execution | Field diagnostics ve quality score motorunu geliştir | Data/Extraction Lead | 6 | P07-T03 | No | MVP | Aynı kayıt aynı score’u üretir; score breakdown API ile okunur. |
| P07-T05 | Quality | Execution | Publish threshold ve partial result policy’sini uygula | Product Owner | 4 | P07-T04 | No | MVP | Threshold altında dataset publish edilmez veya açıkça partial işaretlenir. |
| P07-T06 | API | Execution | Schema CRUD ve validation preview uçlarını tamamla | Backend Lead | 5 | P07-T05 | No | MVP | Kullanıcı schema oluşturup örnek kayıt üzerinde sonucu görebilir. |
| P07-T07 | UI | Execution | Schema yönetim ekranı ve alan kalite görünümünü hazırla | Frontend Lead | 6 | P07-T06 | No | MVP | Kullanıcı version ve field validation sonucunu anlayabilir. |
| P07-T08 | Quality | Milestone/Gate | Schema acceptance, compatibility ve regression gate’ini tamamla | QA Lead | 6 | P07-T07 | Yes | MVP | Schema gate kabul kriterleri ve test raporu imzalıdır. |

## Phase 8 — Crawler Engine

**Amaç:** Seed, frontier, discovery, deduplication, depth ve domain policy ile crawl desteği sağlamak.  
**Planlanan pencere:** 33–37. hafta  
**Exit gate:** Crawler Engine Accepted  
**Accountable:** Backend Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P08-T01 | Crawler | Execution | URL frontier, crawl state ve queue partition modelini oluştur | Backend Lead | 7 | P07-T08 | No | MVP | Aynı canonical URL job kapsamı içinde birden fazla kez kuyruğa girmez. |
| P08-T02 | Crawler | Execution | Link discovery ve URL extraction pipeline’ını geliştir | Data/Extraction Lead | 6 | P08-T01 | No | MVP | Keşfedilen URL kaynağı ve parent task ile ilişkilidir. |
| P08-T03 | Crawler | Execution | Canonicalization ve deduplication motorunu geliştir | Backend Lead | 6 | P08-T02 | No | MVP | Eşdeğer URL’ler tek frontier entry altında birleşir. |
| P08-T04 | Compliance | Execution | robots/policy, allowlist/denylist ve domain restriction kontrollerini uygula | Security Lead | 6 | P08-T03 | No | MVP | Policy dışı URL fetch edilmez; karar nedeni kayıtlıdır. |
| P08-T05 | Crawler | Execution | Depth, page limit ve pagination kurallarını uygula | Backend Lead | 5 | P08-T04 | No | MVP | Crawler configured limits dışında büyümez. |
| P08-T06 | Crawler | Execution | Sitemap ve priority queue desteğini geliştir | Backend Lead | 6 | P08-T05 | No | MVP | Priority davranışı testte ölçülebilir ve açıklanabilirdir. |
| P08-T07 | Reliability | Execution | Crawl checkpoint, pause/resume ve recovery akışını tamamla | SRE/Platform Lead | 6 | P08-T06 | No | MVP | Yarım crawl güvenli biçimde devam eder; duplicate record oluşmaz. |
| P08-T08 | Quality | Milestone/Gate | Crawler E2E, limit, dedup ve policy testlerini tamamla | QA Lead | 8 | P08-T07 | Yes | MVP | Crawl acceptance suite geçer ve Phase 8 gate imzalanır. |

## Phase 9 — Job Orchestration

**Amaç:** Job/task/attempt lifecycle, retry, cancel, progress, idempotency ve reconciliation mekanizmalarını tamamlamak.  
**Planlanan pencere:** 38–41. hafta  
**Exit gate:** Orchestration Production Ready  
**Accountable:** Engineering Manager

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P09-T01 | Orchestration | Execution | Job state machine ve transition guard’ları kesinleştir | Backend Lead | 6 | P08-T08 | No | MVP | Geçersiz state transition reddedilir ve audit event üretilir. |
| P09-T02 | Orchestration | Execution | Task DAG/dependency ve dispatch planner’ı geliştir | Backend Lead | 8 | P09-T01 | No | MVP | Bağımlı task predecessor tamamlanmadan dispatch edilmez. |
| P09-T03 | Reliability | Execution | Idempotency, lease, heartbeat ve result commit mekanizmasını tamamla | SRE/Platform Lead | 8 | P09-T02 | No | MVP | Duplicate delivery aynı sonucu iki kez yazmaz; worker loss recover edilir. |
| P09-T04 | Operations | Execution | Cancel, pause/resume ve graceful drain akışını uygula | SRE/Platform Lead | 6 | P09-T03 | No | MVP | İptal sonrası yeni task gönderilmez; aktif işler kontrollü kapanır. |
| P09-T05 | Observability | Execution | Progress event, WebSocket snapshot ve webhook event akışını tamamla | Backend Lead | 7 | P09-T04 | No | MVP | Dashboard, job yeniden açıldığında doğru snapshot ve event alır. |
| P09-T06 | Data | Execution | Run/attempt history, reconciliation ve audit görünümünü tamamla | Backend Lead | 6 | P09-T05 | No | MVP | Job/task/attempt sayıları reconcile edilebilir ve fark raporlanır. |
| P09-T07 | Reliability | Execution | DLQ review, replay ve operational recovery prosedürünü uygula | SRE/Platform Lead | 5 | P09-T06 | No | MVP | DLQ replay idempotent ve auditlidir. |
| P09-T08 | Quality | Milestone/Gate | Orchestration load, chaos-lite ve acceptance testini tamamla | QA Lead | 9 | P09-T07 | Yes | MVP | Kritik lifecycle senaryoları ve backlog hedefleri karşılanır. |

## Phase 10 — AI Strategy Engine

**Amaç:** Hedef analizi ve strategy önerisini policy, kalite ve maliyet bütçeleriyle kontrollü biçimde entegre etmek.  
**Planlanan pencere:** 42–45. hafta  
**Exit gate:** AI Strategy Guardrailed  
**Accountable:** Product Owner

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P10-T01 | AI Strategy | Execution | Target Analyzer girdi/çıktı sözleşmesini oluştur | Data/Extraction Lead | 6 | P09-T08 | No | MVP+1 | Analyzer çıktısı versioned ve policy engine tarafından doğrulanabilir. |
| P10-T02 | AI Strategy | Execution | Deterministic strategy rules ve fallback önceliklerini tanımla | Solution Architect | 5 | P10-T01 | No | MVP+1 | Aynı koşullar aynı strategy kararını üretir. |
| P10-T03 | AI | Execution | LLMProvider abstraction ve model configuration katmanını geliştir | Data/Extraction Lead | 6 | P10-T02 | No | MVP+1 | Model değişimi strategy core’u değiştirmez. |
| P10-T04 | AI Strategy | Execution | AI strategy proposal ve policy approval akışını ekle | Data/Extraction Lead | 8 | P10-T03 | No | MVP+1 | Model önerisi policy onayı olmadan worker action’a dönüşmez. |
| P10-T05 | AI Strategy | Execution | Feedback, outcome ve strategy versioning modelini kur | Product Owner | 5 | P10-T04 | No | MVP+1 | Her önerinin sonucu ve kalite/maliyet etkisi görülebilir. |
| P10-T06 | Security | Execution | Prompt/data minimization ve untrusted content guardrail’larını uygula | Security Lead | 5 | P10-T05 | No | MVP+1 | Dış içerik sistem talimatı olarak işlenmez; secret model çağrısına gitmez. |
| P10-T07 | FinOps | Execution | AI latency, token ve per-job budget kontrolünü ekle | FinOps/Operations | 5 | P10-T06 | No | MVP+1 | Budget aşıldığında AI stratejisi güvenli biçimde devre dışı kalır. |
| P10-T08 | Quality | Milestone/Gate | Offline evaluation seti ve controlled rollout testini tamamla | QA Lead | 9 | P10-T07 | Yes | MVP+1 | AI strategy deterministic baseline ile karşılaştırılmış ve rollout kriteri tanımlıdır. |

## Phase 11 — Dataset Platform

**Amaç:** Versioned dataset, record lineage, export ve retention işlevlerini teslim etmek.  
**Planlanan pencere:** 46–49. hafta  
**Exit gate:** Dataset Platform Accepted  
**Accountable:** Data/Extraction Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P11-T01 | Dataset | Execution | Dataset/dataset version/record veri modelini kesinleştir | Data/Extraction Lead | 6 | P10-T08 | No | MVP+1 | Dataset version source job/schema/plan bilgisiyle yeniden izlenebilir. |
| P11-T02 | Dataset | Execution | Staging, publish ve abort transaction akışını geliştir | Backend Lead | 8 | P11-T01 | No | MVP+1 | Yarım çıktı published görünmez; publish atomic metadata ile yapılır. |
| P11-T03 | Export | Execution | JSON, JSONL ve CSV export adapter’larını geliştir | Backend Lead | 6 | P11-T02 | No | MVP+1 | Büyük dataset memory taşmadan export edilir; format doğrulanır. |
| P11-T04 | Export | Execution | Parquet, API ve S3 delivery yeteneklerini ekle | Backend Lead | 8 | P11-T03 | No | MVP+1 | Export tenant yetkisiyle korunur ve completion event üretir. |
| P11-T05 | Data Quality | Execution | Record dedupe/upsert ve lineage bilgisini uygula | Data/Extraction Lead | 6 | P11-T04 | No | MVP+1 | Aynı record policy’ye uygun birleşir; kaynak lineage kaybolmaz. |
| P11-T06 | Governance | Execution | Dataset retention, deletion ve legal hold kontrollerini uygula | Security Lead | 5 | P11-T05 | No | MVP+1 | Silme database ve object storage tarafında izlenebilir tamamlanır. |
| P11-T07 | API | Execution | Dataset/record/version sorgu ve export kontrol uçlarını tamamla | Backend Lead | 6 | P11-T06 | No | MVP+1 | API sonuçları version ve tenant kapsamında doğru döner. |
| P11-T08 | Quality | Milestone/Gate | Dataset E2E, format, lineage ve retention acceptance’ını yap | QA Lead | 8 | P11-T07 | Yes | MVP+1 | Dataset Phase 11 gate kriterlerini karşılar. |

## Phase 12 — Control Center

**Amaç:** Operasyon, job, kalite, worker, provider, dataset, maliyet ve audit ekranlarını sunmak.  
**Planlanan pencere:** 50–54. hafta  
**Exit gate:** Control Center UAT Signed-off  
**Accountable:** Frontend Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P12-T01 | UX | Execution | Control Center bilgi mimarisi ve navigation modelini onayla | UX Lead | 5 | P11-T08 | No | MVP+1 | Kritik kullanıcı akışları wireframe ve PO review’dan geçer. |
| P12-T02 | Frontend | Execution | Design system, layout, permissions ve data fetching altyapısını kur | Frontend Lead | 8 | P12-T01 | No | MVP+1 | Ortak bileşenler ve permission-aware route guard çalışır. |
| P12-T03 | Frontend | Execution | Overview, project, target ve schema ekranlarını geliştir | Frontend Lead | 10 | P12-T02 | No | MVP+1 | Kullanıcı Project → Target → Schema akışını tamamlar. |
| P12-T04 | Frontend | Execution | Job run, progress, errors ve canlı event ekranlarını geliştir | Frontend Lead | 10 | P12-T03 | No | MVP+1 | Job state ve event snapshot doğru görünür; iptal/retry yetkisi korunur. |
| P12-T05 | Frontend | Execution | Worker, browser, proxy ve provider operasyon ekranlarını geliştir | Frontend Lead | 8 | P12-T04 | No | MVP+1 | Operatör health ve degradation kaynağına drill-down yapabilir. |
| P12-T06 | Frontend | Execution | Dataset, record, export ve quality ekranlarını geliştir | Frontend Lead | 9 | P12-T05 | No | MVP+1 | Dataset version, quality ve export durumu kullanıcıya açıklanır. |
| P12-T07 | Frontend | Execution | Logs, errors, costs, schedules, webhooks, users ve audit ekranlarını geliştir | Frontend Lead | 10 | P12-T06 | No | MVP+1 | Role göre ekran/aksiyon görünürlüğü ve maskelenmiş veri uygulanır. |
| P12-T08 | UX/QA | Milestone/Gate | UAT, accessibility, responsive ve release readiness testlerini tamamla | QA Lead | 9 | P12-T07 | Yes | MVP+1 | Kritik UAT akışları geçer; blocker defect kalmaz. |

## Phase 13 — Observability

**Amaç:** Trace, metric, structured log, dashboard, alarm ve telemetry completeness standartlarını uygulamak.  
**Planlanan pencere:** 55–57. hafta  
**Exit gate:** Observability SLO Ready  
**Accountable:** SRE/Platform Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P13-T01 | Observability | Execution | Ortak OpenTelemetry instrumentation paketini geliştir | SRE/Platform Lead | 6 | P12-T08 | No | MVP+1 | API/queue/worker zincirinde ortak trace alanları görünür. |
| P13-T02 | Observability | Execution | API, queue, worker, proxy, extraction ve storage trace’lerini ekle | SRE/Platform Lead | 8 | P13-T01 | No | MVP+1 | Bir job attempt uçtan uca trace ile izlenebilir. |
| P13-T03 | Metrics | Execution | Platform, target, worker, extraction ve quality metriklerini ekle | SRE/Platform Lead | 8 | P13-T02 | No | MVP+1 | KPI metrikleri dashboard query’leriyle üretilebilir. |
| P13-T04 | Logging | Execution | Structured log schema, redaction ve log routing’i uygula | SRE/Platform Lead | 5 | P13-T03 | No | MVP+1 | Sensitive değerler log/trace’e düşmez; requestId ile arama yapılır. |
| P13-T05 | Dashboard | Execution | Grafana overview, reliability, quality ve provider dashboard’larını kur | SRE/Platform Lead | 7 | P13-T04 | No | MVP+1 | Operatör kritik sinyalleri tek ekrandan görebilir. |
| P13-T06 | Alerting | Execution | Alarm kuralları, severity, on-call routing ve runbook linklerini tanımla | SRE/Platform Lead | 6 | P13-T05 | No | MVP+1 | Alarm gereksiz gürültü üretmeden sahip ve aksiyon içerir. |
| P13-T07 | Governance | Execution | Telemetry retention, access ve completeness kontrolünü uygula | Security Lead | 4 | P13-T06 | No | MVP+1 | Telemetry erişimi role göre sınırlıdır; completeness ölçülür. |
| P13-T08 | Quality | Milestone/Gate | Observability acceptance ve incident drill’ü tamamla | QA Lead | 6 | P13-T07 | Yes | MVP+1 | Sentetik incident doğru alarm ve runbook aksiyonunu üretir. |

## Phase 14 — Cost Intelligence

**Amaç:** Request, browser, proxy, LLM, storage, compute ve retry tüketimini job/record seviyesinde hesaplamak.  
**Planlanan pencere:** 58–60. hafta  
**Exit gate:** Cost Attribution Accepted  
**Accountable:** FinOps/Operations

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P14-T01 | FinOps | Execution | Usage event modelini ve cost category sözlüğünü kesinleştir | FinOps/Operations | 4 | P13-T08 | No | MVP+1 | Tüm kategori, unit, source ve currency alanları tanımlıdır. |
| P14-T02 | FinOps | Execution | Provider tariff ve pricing configuration yönetimini kur | FinOps/Operations | 5 | P14-T01 | No | MVP+1 | Tarife değişikliği geçmiş maliyetleri geriye dönük değiştirmez. |
| P14-T03 | Metering | Execution | HTTP, browser, proxy, LLM, storage ve compute meter’larını ekle | SRE/Platform Lead | 8 | P14-T02 | No | MVP+1 | Kaynak tüketimi ilgili attempt/job ile ilişkilendirilir. |
| P14-T04 | FinOps | Execution | Retry ve fallback maliyet allocation kuralını uygula | FinOps/Operations | 5 | P14-T03 | No | MVP+1 | Maliyet dağılımı açıklanabilir ve tekrar hesaplanabilirdir. |
| P14-T05 | FinOps | Execution | Job cost aggregation ve cost-per-record hesaplamasını geliştir | FinOps/Operations | 6 | P14-T04 | No | MVP+1 | Job total ve cost/record dashboard/API ile tutarlıdır. |
| P14-T06 | FinOps | Execution | Tenant/project/job budget cap ve cost alert mekanizmasını ekle | Product Owner | 5 | P14-T05 | No | MVP+1 | Budget aşımı kontrollü stop veya uyarı üretir. |
| P14-T07 | Reporting | Execution | Finance export, reconciliation ve period close raporunu oluştur | FinOps/Operations | 6 | P14-T06 | No | MVP+1 | Tahmini/gerçek maliyet farkı dönem raporunda görünür. |
| P14-T08 | Quality | Milestone/Gate | Cost attribution completeness ve acceptance testini tamamla | QA Lead | 6 | P14-T07 | Yes | MVP+1 | Maliyet doğruluğu ve completeness hedefleri karşılanır. |

## Phase 15 — Security

**Amaç:** RBAC, secret, şifreleme, SSRF/egress, worker isolation, audit, retention ve go-live güvenlik kapılarını tamamlamak.  
**Planlanan pencere:** 61–64. hafta  
**Exit gate:** Security Go-live Approval  
**Accountable:** Security Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P15-T01 | Security | Execution | Threat model ve abuse case review’ünü gerçekleştir | Security Lead | 7 | P14-T08 | No | Enterprise Expansion | High/Critical riskler için sahip ve kapanış kriteri atanmıştır. |
| P15-T02 | IAM | Execution | RBAC enforcement, API key, OAuth/session ve revocation kontrollerini tamamla | Backend Lead | 8 | P15-T01 | No | Enterprise Expansion | Rol matrisi dışı işlemler reddedilir; revoked identity erişemez. |
| P15-T03 | Secrets | Execution | Secrets management ve credential rotation akışını uygula | Security Lead | 7 | P15-T02 | No | Enterprise Expansion | Raw secret database/log/trace/UI içinde görünmez. |
| P15-T04 | Cryptography | Execution | Encryption at rest/in transit ve key policy’sini doğrula | SRE/Platform Lead | 5 | P15-T03 | No | Enterprise Expansion | Şifreleme kontrolleri ve certificate/rotation runbook’u vardır. |
| P15-T05 | Network | Execution | SSRF, egress, redirect ve webhook destination guardrail’larını harden et | Security Lead | 8 | P15-T04 | No | Enterprise Expansion | Private/metadata hedefleri ve unsafe webhook redirectleri engellenir. |
| P15-T06 | Isolation | Execution | Worker/browser sandbox, resource limit ve tenant isolation hardening yap | SRE/Platform Lead | 8 | P15-T05 | No | Enterprise Expansion | Worker compromise blast radius ve cross-tenant leakage testlerle kontrol edilmiştir. |
| P15-T07 | Audit/Privacy | Execution | Audit, retention, deletion, DLP ve data access review’ünü tamamla | Compliance/Legal | 6 | P15-T06 | No | Enterprise Expansion | Kritik eylemler izlenebilir; retention/deletion kanıtı üretilir. |
| P15-T08 | Security QA | Milestone/Gate | Vulnerability scan, penetration test remediation ve go-live approval | Security Lead | 10 | P15-T07 | Yes | Enterprise Expansion | Critical/High bulgular kapalı veya risk kabulü imzalıdır. |

## Phase 16 — Provider Abstraction

**Amaç:** Provider contract, adapter sertifikasyonu, karşılaştırma ve kontrollü failover kabiliyetlerini genişletmek.  
**Planlanan pencere:** 65–67. hafta  
**Exit gate:** Provider Portfolio Certified  
**Accountable:** SRE/Platform Lead

| ID | Workstream | Tür | Task | Owner | Efor (pd) | Bağımlılık | Milestone | Release | Kabul kriteri |
|---|---|---|---|---|---|---|---|---|---|
| P16-T01 | Provider | Execution | Provider contract conformance test suite oluştur | SRE/Platform Lead | 5 | P15-T08 | No | Enterprise Expansion | Her adapter ortak sözleşme testlerini geçer. |
| P16-T02 | Provider | Execution | Bright Data adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T01 | No | Enterprise Expansion | Adapter mock/contract/integration kriterlerini karşılar. |
| P16-T03 | Provider | Execution | Oxylabs adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T02 | No | Enterprise Expansion | Adapter ortak interface ve policy testlerini geçer. |
| P16-T04 | Provider | Execution | Zyte adapter ve certification akışını tamamla | SRE/Platform Lead | 7 | P16-T03 | No | Enterprise Expansion | Adapter ortak interface ve policy testlerini geçer. |
| P16-T05 | Provider | Execution | Internal provider adapter ve local test doubles geliştir | Backend Lead | 5 | P16-T04 | No | Enterprise Expansion | Local/staging testleri dış provider secret’ı olmadan çalışır. |
| P16-T06 | Strategy | Execution | Provider scoring, health comparison ve failover kararını uygula | SRE/Platform Lead | 6 | P16-T05 | No | Enterprise Expansion | Failover policy ve maliyet etkisi event olarak izlenir. |
| P16-T07 | Operations | Execution | Provider onboarding, quota, credential rotation ve support runbook oluştur | FinOps/Operations | 5 | P16-T06 | No | Enterprise Expansion | Yeni provider onboarding tekrarlanabilir ve sorumlular atanmıştır. |
| P16-T08 | Quality | Milestone/Gate | Provider portfolio certification ve release gate’ini tamamla | QA Lead | 8 | P16-T07 | Yes | Enterprise Expansion | Etkin provider’lar sertifiye edilmiş, uyumsuz olanlar disable edilmiştir. |

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
