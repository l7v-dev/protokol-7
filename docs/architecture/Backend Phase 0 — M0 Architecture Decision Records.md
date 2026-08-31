# Backend Phase 0 — M0 Architecture Decision Records

**Program:** Scraping Platform  
**Kapsam:** Backend  
**Milestone:** M0 — Architecture Baseline  
**Sürüm:** 1.0.0  
**Durum:** Öneri / onay bekliyor  
**Yazar:** Manus AI

Bu kayıtlar, Phase 1 implementasyonuna başlamadan önce backend'in hangi prensiplerle inşa edileceğini sabitler. Bir karar değiştiğinde mevcut kayıt düzenlenmez; yeni ADR açılır ve eski kayda `Superseded by ADR-XXX` bağlantısı eklenir.

## ADR-BE-001 — Backend monorepo ve ortak tip paketi

**Durum:** Öneri  
**Karar sahibi:** Engineering Manager  
**Consulted:** Solution Architect, Backend Lead, SRE

**Bağlam:** API, orchestrator, scheduler, HTTP/browser worker ve ortak adapter'lar aynı domain event ve veri sözleşmelerini paylaşır. Farklı repository'lerde eşzamanlı contract drift riski vardır.

**Karar:** Backend bileşenleri aynı monorepo içinde `apps/api`, `apps/orchestrator`, `apps/scheduler`, `workers/*` ve `packages/{types,database,queue,config,observability,proxy,storage}` yapısı altında tutulacaktır. Ortak sözleşmeler `packages/types` içinde versioned olarak yayımlanacaktır.

**Sonuç:** Local geliştirme ve contract testleri kolaylaşır. Package sınırlarının aşılmaması ve deploy edilebilir servislerin bağımsız build edilmesi gerekir.

## ADR-BE-002 — API ile worker yürütmesinin ayrılması

**Durum:** Öneri  
**Karar sahibi:** Backend Lead  
**Consulted:** SRE, QA

**Bağlam:** HTTP request'i ile browser/crawl/extraction işleri farklı süre ve kaynak profiline sahiptir.

**Karar:** API yalnızca command kabulü, validation, resource query ve status read işlerini yürütür. Uzun süren yürütmeler queue üzerinden worker'lara aktarılır. API response'u task tamamlanmasını beklemez; `202 Accepted` ve job snapshot döndürür.

**Sonuç:** API ölçeklenmesi worker ölçeklenmesinden ayrılır. Queue backpressure, status polling ve event delivery ayrıca işletilmelidir.

## ADR-BE-003 — PostgreSQL job state'in kalıcı kaynağıdır

**Durum:** Öneri  
**Karar sahibi:** Backend Lead  
**Consulted:** SRE, Data/Extraction Lead

**Bağlam:** Job, task, attempt, schema, dataset ve audit ilişkisel bütünlük ve geçmiş izlenebilirliği gerektirir.

**Karar:** Job/task/attempt status, domain metadata, tenant ownership, idempotency ve audit referansları PostgreSQL'de kalıcı tutulacaktır. Redis queue execution state ve geçici scheduling için kullanılacak; job gerçeğinin tek kaynağı olmayacaktır.

**Sonuç:** Redis yeniden oluşturulabilir veya replay edilebilir. Queue ile DB arasındaki publish/commit sırası transactional outbox veya eşdeğer mekanizmayla korunmalıdır.

## ADR-BE-004 — Queue mesajları versioned envelope taşıyacaktır

**Durum:** Öneri  
**Karar sahibi:** Backend Lead  
**Consulted:** SRE, QA

**Karar:** Her command/result/event; `messageId`, `messageType`, `schemaVersion`, `tenantId`, `jobId`, `taskId`, `attemptId`, `traceId`, `issuedAt` ve `payload` alanlarını taşıyacaktır. Raw response ve secret yerine artifact URI/checksum/reference gönderilecektir.

**Sonuç:** Consumer idempotency, replay ve tracing uygulanabilir. Mesaj payload'ı değiştiğinde schema version ve compatibility testi zorunludur.

## ADR-BE-005 — HTTP-first strategy

**Durum:** Öneri  
**Karar sahibi:** Solution Architect  
**Consulted:** Backend Lead, SRE, Compliance/Legal, Product Owner

**Karar:** Target için önce HTTP yürütme uygunluğu değerlendirilir. Browser yalnızca target policy izin veriyorsa, HTTP yetersiz kalıyorsa ve maliyet/retry budget uygunsa fallback olur.

**Sonuç:** Browser kaynak kullanımı sınırlanır. Fallback kararı explainable event olarak kaydedilir; aynı hata ile sınırsız escalation yapılamaz.

## ADR-BE-006 — Provider abstraction core service'e sızmayacak

**Durum:** Öneri  
**Karar sahibi:** SRE/Platform Lead  
**Consulted:** Backend Lead, FinOps, Security

**Karar:** Proxy, LLM ve storage dış servisleri adapter interface arkasında normalize edilecektir. Core service; provider SDK, özel response veya raw credential biçimini bilmeyecektir.

**Sonuç:** Provider değişimi ve failover kolaylaşır. Ortak interface provider-specific yetenekleri gizlememeli; capability matrix taşımalıdır.

## ADR-BE-007 — Tenant context her backend sınırında zorunludur

**Durum:** Öneri  
**Karar sahibi:** Security Lead  
**Consulted:** Backend Lead, SRE, QA

**Karar:** API request, queue message, repository query, object storage key, audit event ve usage event uygun olduğunda `tenantId` taşır. Tenant ID istemci body'sinden yetki kaynağı olarak alınmaz; authenticated context'ten türetilir.

**Sonuç:** Defense-in-depth sağlanır. Her repository ve event consumer için cross-tenant negative test gerekir.

## ADR-BE-008 — Policy engine worker eyleminden önce çalışır

**Durum:** Öneri  
**Karar sahibi:** Security Lead  
**Consulted:** Compliance/Legal, SRE, Backend Lead

**Karar:** URL/host/port, redirect, proxy sınıfı, browser action, webhook destination ve response boyutu policy ile değerlendirilmeden dış çağrı yapılmaz. Policy ihlali retry edilmez.

**Sonuç:** Uyum ve SSRF/egress kontrolleri merkezi olur. Policy kararları `policyDecision` ve `reasonCode` ile denetlenebilir kayda dönüşür.

## ADR-BE-009 — Attempt geçmişi değişmez, retry yeni attempt üretir

**Durum:** Öneri  
**Karar sahibi:** Backend Lead  
**Consulted:** SRE, Data/Extraction Lead, FinOps

**Karar:** Her task denemesi yeni Attempt kaydı üretir. Önceki attempt silinmez veya başarılı gibi güncellenmez. Retry budget, task ve job seviyesinde ayrıca izlenir.

**Sonuç:** Hata incelemesi, maliyet attribution ve reproducibility korunur. Reconciliation; orphan, duplicate ve lease timeout kayıtlarını ele almalıdır.

## ADR-BE-010 — Dataset publish iki aşamalıdır

**Durum:** Öneri  
**Karar sahibi:** Data/Extraction Lead  
**Consulted:** Backend Lead, QA, Compliance/Legal

**Karar:** Validation öncesi kayıtlar staging'e yazılır. Quality/publish policy geçildikten sonra Dataset Version `PUBLISHED` olur. Yarım veya başarısız batch `ABORTED` kapanır ve varsayılan dataset sonucu olarak görünmez.

**Sonuç:** Veri tüketicileri yarım çıktı görmez. Staging cleanup, checksum ve retention mekanizması gerekir.

## ADR-BE-011 — Telemetry contract tüm servislerde ortaktır

**Durum:** Öneri  
**Karar sahibi:** SRE/Platform Lead  
**Consulted:** Security Lead, Backend Lead, FinOps

**Karar:** API, queue, worker, proxy, extraction ve storage span/log/metric'leri ortak correlation alanları kullanır. Secret, cookie, authorization header, tam query ve ham response body telemetry'ye yazılmaz.

**Sonuç:** Job-to-record ve request-to-attempt izlenebilirliği artar. High-cardinality alanlar metric label'ı olarak kullanılmaz.

## ADR-BE-012 — M0'da frontend implementasyonu yapılmayacaktır

**Durum:** Öneri  
**Karar sahibi:** Product Owner  
**Consulted:** Engineering Manager, Solution Architect

**Karar:** M0 çıktısı backend sözleşmeleri ve handover baseline'ıdır. Control Center, UI component, responsive layout ve browser-side query implementasyonu sonraki ürün fazında yapılacaktır.

**Sonuç:** Backend contract önce sabitlenir. UI ihtiyaçları API contract review'a input olabilir ancak M0 kapsamını genişletmez.

## ADR review kuralı

Bir ADR `Öneri` durumundan `Kabul edildi` durumuna; karar sahibi, en az bir teknik reviewer, güvenlik etkisi varsa Security Lead ve program etkisi varsa Product Owner görüşüyle geçirilir. `Critical` veya `High` risk mitigation'ı olmayan kararlar production go-live için yeterli kabul edilmez.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: ../01-architecture.md "Platform mimarisi ve bileşen tasarımı"
[3]: ../03-api-contract.md "API sözleşmesi"
[4]: ../04-lifecycles.md "Yaşam döngüleri"
[5]: ../07-security-rbac.md "Güvenlik ve RBAC"
[6]: ../08-observability-cost.md "Gözlemlenebilirlik ve maliyet"
