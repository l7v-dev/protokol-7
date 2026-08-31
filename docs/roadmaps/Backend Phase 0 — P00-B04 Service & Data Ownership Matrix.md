# Backend Phase 0 — P00-B04 Service & Data Ownership Matrix

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Task:** P00-B04 — Servis sorumlulukları ve veri sahipliğini tanımla  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Bağımlılık:** P00-B03 — Accepted  
**Owner:** Engineering Manager

## 1. Amaç

Bu belge, backend servislerinin hangi karar ve verilerden sorumlu olduğunu kesinleştirir. Temel hedef, aynı iş kuralının birden fazla serviste uygulanmasını, veri sahipliği belirsizliğini ve worker'ların orchestration kararlarını doğrudan değiştirmesini önlemektir.

> **Ana kural:** Her domain state ve karar için tek bir authoritative owner bulunur. Diğer servisler yalnızca tanımlı contract üzerinden okur, command gönderir veya event yayınlar.

## 2. Ownership terminolojisi

| Terim | Anlam |
|---|---|
| **Authoritative owner** | Verinin veya state transition'ın tekil gerçeğini yöneten servis |
| **Producer** | Command, event veya artifact üreten servis |
| **Consumer** | Contract üzerinden veriyi veya event'i kullanan servis |
| **Read model** | Başka bir owner'ın verisinden türetilmiş sorgu görünümü |
| **Snapshot** | Job gibi bir yaşam döngüsü boyunca değişmemesi gereken config kopyası |
| **Derived metric** | Ham event veya state'ten yeniden hesaplanabilen ölçüm |

## 3. Servis ownership matrisi

| Servis / context | Authoritative sorumluluk | State sahibi | Girdi | Çıktı | Sahip olmadığı karar |
|---|---|---|---|---|---|
| API Service | Auth context, request validation, resource command kabulü ve read API | API request/idempotency metadata | REST/JSON | `202`, resource response, command event | Worker yürütme veya job completion |
| Auth/Policy | Kimlik, role, tenant scope ve policy decision | Session/API key/policy decision metadata | Auth token, actor, target policy | Auth context, allow/deny | Hedef içerik veya extraction sonucu |
| Orchestrator | Job/run/task/attempt lifecycle, dispatch ve terminal outcome | PostgreSQL job state | Commands, worker result events | Task commands, state events | HTTP/browser/provider detayları |
| Scheduler | Due execution ve overlap guard | Schedule execution metadata | Schedule | Job command | Job içeriği veya worker execution |
| HTTP Worker | HTTP attempt execution | Attempt execution result/event | HTTP execution plan | Response/artifact/access result | Job status veya tenant policy |
| Browser Worker | Browser attempt execution | Browser artifact/attempt result | Browser execution plan | DOM/API/artifact/access result | Job completion veya cross-tenant session |
| Crawler Worker | URL discovery, frontier ve crawl state | Crawl URL state | Seed/frontier plan | Discovered URL events | Dataset publish veya policy bypass |
| Extractor Worker | Extraction plan yürütme ve candidate record | Extraction result/diagnostic | Content artifact + plan | Candidate records | Record validity veya final publish |
| Validator Worker | Schema validation, field diagnostics ve quality score | Validation result | Candidate record + schema | Valid/invalid record + quality | Source fetch veya strategy seçim |
| Dataset Service | Dataset version staging/publish, record lineage | Dataset/version metadata | Validated batch | Published version/event | Target access veya retry karar |
| Proxy Manager | Proxy lease, provider health ve normalized access plan | Lease/health/usage metadata | Proxy request | Proxy lease/access result | Job lifecycle veya raw target content |
| Storage Adapter | Artifact upload, checksum, URI ve access grant | Artifact metadata | Binary stream/manifest | Storage URI/presigned access | Artifact retention kararının sahibi tek başına değildir |
| Cost Service | Usage event aggregation ve cost summary | Usage event/price snapshot | Usage events, tariff | Job/project/tenant cost view | Provider execution veya budget policy'nin ürün anlamı |
| Audit Service | Append-only audit event | Audit record | Actor/action/resource | Audit event/read model | İş kuralı state transition |
| Observability SDK | Correlation, structured log, metric ve trace formatı | Telemetry stream | Runtime signals | Telemetry export | Domain state gerçeği |

## 4. Veri ownership matrisi

| Veri varlığı | Authoritative owner | Kalıcı store | Üretenler | Tüketenler | Güncelleme kuralı |
|---|---|---|---|---|---|
| Tenant | Auth/API | PostgreSQL | API/Admin | Tüm backend | Yetkili admin; tenant ID immutable |
| User/Role/API key | Auth/API | PostgreSQL + secret reference | Auth/Admin | API/Policy/Audit | Role ve revoke auditlidir |
| Project | API Service | PostgreSQL | API | Orchestrator, Dataset, API | Tenant scope zorunlu |
| Target | API Service | PostgreSQL | API | Orchestrator/Policy/Worker snapshot | Job oluşturulunca snapshot alınır |
| Schema | Schema/API | PostgreSQL | API/Data | Extractor/Validator/Job | Version publish sonrası immutable |
| Job/Run | Orchestrator | PostgreSQL | API/Scheduler/Orchestrator | API/Worker/Observability | State transition yalnız Orchestrator |
| Task/Attempt | Orchestrator | PostgreSQL + queue lease | Orchestrator/Worker event | API/Retry/Cost | Attempt geçmişi append-only |
| Worker registry | Worker Registry/SRE | PostgreSQL/registry | Worker heartbeat | Orchestrator/Ops | Heartbeat ile health güncellenir |
| Browser/Session | Browser Worker | Kısa ömürlü state + artifact ref | Browser Worker | Orchestrator/Storage | Tenant paylaşımı yok; iş sonrası cleanup |
| Proxy lease/health | Proxy Manager | PostgreSQL/Redis | Provider adapter/Worker result | Worker/Strategy/Cost | TTL, release, quarantine ve audit |
| Extraction plan/result | Extractor | PostgreSQL + artifact ref | Extractor/API | Validator/Quality | Versioned plan; result attempt'e bağlı |
| Validation/quality | Validator | PostgreSQL | Validator | Dataset/API/Cost | Schema version ile ilişki zorunlu |
| Dataset/version/record | Dataset Service | PostgreSQL + object storage | Validator/Dataset | API/Export/Consumer | Published version immutable |
| Artifact | Storage Adapter | S3-compatible + metadata DB | Worker/Extractor/Export | Validator/Operator/API | URI/checksum; retention policy ile silinir |
| Error | Orchestrator/Error catalog | PostgreSQL/log backend | All services | Retry/Ops/API | Code taxonomy ve retryable flag zorunlu |
| Usage event | Cost Service | PostgreSQL/analytics store | All billable services | Cost/FinOps/Dashboard | Append-only; yeniden aggregate edilir |
| Audit event | Audit Service | Append-only store | API/Policy/Orchestrator/Admin | Security/Compliance | Silinmez veya legal policy ile kontrollü temizlenir |

## 5. Karar ownership matrisi

| Karar | Nihai sahip | Görüş alınacak roller | Kanıt / kayıt |
|---|---|---|---|
| API resource ve command contract | Backend Lead | SA, QA, FE consumer | OpenAPI/ADR |
| Job/task lifecycle | Orchestrator owner | SRE, QA, PO | State transition spec |
| Retry/backoff/DLQ | SRE/Platform Lead | Backend, QA, PO | Reliability policy |
| Target access policy | Security + Compliance | PO, SRE, Backend | Policy decision + ADR |
| HTTP/browser strategy | Solution Architect | Backend, SRE, Cost, Compliance | Strategy event/spec |
| Schema/quality threshold | Data/Extraction Lead | PO, QA, Backend | Schema version/policy |
| Dataset publish semantics | Data/Extraction Lead | Backend, QA, Compliance | Dataset contract |
| Provider selection/failover | SRE/Platform Lead | PO, FinOps, Security | Provider score/ADR |
| Retention/deletion | Compliance/Legal | Security, PO, SRE | Data policy/audit |
| Cost tariff/budget | FinOps/Operations | PO, SRE, Provider owner | Tariff and budget record |
| Production release | Engineering Manager | QA, SEC, SRE, PO | Release checklist/sign-off |

## 6. Write ve read kuralları

Servisler başka bir servisin authoritative state'ini doğrudan değiştiremez. Örneğin HTTP Worker Job status kolonunu güncellemez; `task.result` event yayınlar. API, Orchestrator state'ini doğrudan yazmaz; command gönderir veya read API kullanır. Dashboard veya dış client yalnızca API üzerinden okur.

Read model performans için denormalize edilebilir; ancak source record ve son hesaplanma zamanı taşınmalıdır. Read model ile authoritative store çelişirse authoritative store kazanır ve reconcile job'ı read model'i yeniden üretir.

## 7. Queue ownership kuralları

| Queue | Producer owner | Consumer owner | Queue mesajı sonrası state kararı |
|---|---|---|---|
| `job.commands` | API/Scheduler | Orchestrator | Orchestrator |
| `task.execute.*` | Orchestrator | İlgili worker | Orchestrator |
| `task.results` | Worker | Orchestrator | Orchestrator |
| `events.domain` | State owner | API/telemetry/audit consumers | Kaynak event owner |
| `dead-letter` | Queue runtime | SRE/operator | Replay sonrası kaynak consumer |

Message producer, payload schema ve version'ın sahibi; consumer ise kendi işleme sonucunun sahibi olur. Consumer, producer'ın domain state'ini kendi veritabanında authoritative kopya olarak değiştiremez.

## 8. Sınır ihlali örnekleri

| İhlal | Neden yanlış | Doğru yaklaşım |
|---|---|---|
| Worker job'ı `COMPLETED` yapıyor | Lifecycle ownership bozulur | Worker result; Orchestrator transition |
| API doğrudan task queue'ya worker payload'ı yazıyor | Strategy ve task planning atlanır | API command; Orchestrator dispatch |
| Proxy adapter raw response'u core'a taşıyor | Provider coupling ve secret riski | Normalized `ProxyLease` |
| Extractor invalid record'ı publish ediyor | Validation sınırı delinmiş olur | Validator result → Dataset staging |
| Dashboard database'e doğrudan bağlanıyor | Tenant/auth ve ownership atlanır | API read model |
| Cost service job state değiştiriyor | Derived data domain gerçeğini değiştiremez | Usage event → cost aggregate |

## 9. P00-B04 kabul kriterleri

P00-B04 `Accepted` sayılması için:

1. Her backend container için tekil sorumluluk ve state owner tanımlanmıştır.
2. Her çekirdek domain varlığının authoritative owner'ı ve kalıcı store'u bellidir.
3. Producer/consumer ve state transition ownership'i queue seviyesinde yazılıdır.
4. API, Orchestrator, Worker, Validator, Dataset ve Cost sınırlarının neyi yapmadığı belirtilmiştir.
5. Cross-cutting kararların nihai sahipleri ve review rolleri atanmıştır.
6. Read model ile source of truth ayrımı açıklanmıştır.
7. Ownership ihlali örnekleri ve doğru akış kayıtlıdır.
8. Engineering Manager, Solution Architect, Backend Lead, SRE ve Security review'ü tamamlamıştır.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: phase-0-m0-backend-baseline.md "Backend M0 baseline"
[3]: phase-0-m0-backend-architecture.md "Backend context/container architecture"
[4]: phase-0-m0-backend-requirements.md "Backend gereksinim register'ı"
