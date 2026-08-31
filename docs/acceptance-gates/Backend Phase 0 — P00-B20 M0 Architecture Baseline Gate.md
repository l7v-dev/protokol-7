# Backend Phase 0 — P00-B20 M0 Architecture Baseline Gate

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Faz:** Phase 0 — Architecture & Specification  
**Milestone:** M0 — Architecture Baseline  
**Task:** P00-B20 — M0 sign-off ve Phase 1 giriş kararı  
**Sürüm:** 1.0.0  
**Durum:** In Progress  
**Gate owner:** Engineering Manager  
**Karar türü:** Phase entry authorization

## 1. Gate amacı

Bu gate, Phase 0 backend architecture/specification çıktılarının Phase 1 Core Platform backend implementasyonuna geçiş için yeterli olup olmadığını belirler. Gate; üretim kodunun tamamlandığını değil, kod geliştirmeye başlanabilecek seviyede sözleşme, sahiplik, güvenlik, güvenilirlik, veri yönetişimi ve operasyon baseline'ının kabul edildiğini gösterir.

## 2. Gate kararı seçenekleri

| Karar | Anlam |
|---|---|
| **GO** | Phase 1 planlandığı gibi başlayabilir |
| **GO WITH CONDITIONS** | Phase 1 başlayabilir; listelenen non-blocker aksiyonlar sprint gate'lerine bağlanır |
| **NO-GO** | Blocker giderilmeden Phase 1 başlamaz |

## 3. Gate giriş kriterleri

| Kriter | Beklenen durum | Kanıt | Sonuç |
|---|---|---|---|
| Backend kapsamı ve non-goals | Onaylı | P00-B01 / baseline | Pass |
| Fonksiyonel ve kalite gereksinimleri | Onaylı | P00-B02 requirements | Pass |
| Context/container mimarisi | Onaylı | P00-B03 architecture | Pass |
| Service/data ownership | Onaylı | P00-B04 ownership | Pass |
| Core domain ve invariant'lar | Onaylı | P00-B05 domain | Pass |
| Extended execution domain | Onaylı | P00-B06 execution | Pass |
| REST API contract | Onaylı | P00-B07 API | Pass |
| Error/idempotency | Onaylı | P00-B08 error | Pass |
| Queue/message contract | Onaylı | P00-B09 queue | Pass |
| Lifecycle | Onaylı | P00-B10 lifecycle | Pass |
| Reliability policy | Onaylı | P00-B11 reliability | Pass |
| Security baseline | Onaylı | P00-B12 security | Pass |
| Security control matrix | Onaylı | P00-B13 controls | Pass |
| Data governance | Onaylı | P00-B14 governance | Pass |
| Observability | Onaylı | P00-B15 observability | Pass |
| Cost model | Onaylı | P00-B16 cost | Pass |
| Adapter contracts | Onaylı | P00-B17 adapters | Pass |
| Phase 1 handover | Onaylı | P00-B18 handover | Pass |
| Architecture/security review | Onaylı | P00-B19 review minutes | Pass |

## 4. Değiştirilemez M0 guardrail'leri

Aşağıdaki kararlar Phase 1'de doğrudan uygulanacak ve ADR olmadan gevşetilemeyecektir:

1. **Tenant isolation** API, repository/database, queue, worker, object storage ve audit katmanlarının tamamında uygulanır.
2. **PostgreSQL domain state için source of truth'tur.** Redis/BullMQ delivery ve coordination katmanıdır.
3. Queue delivery **at-least-once** kabul edilir; duplicate command/result güvenli biçimde işlenir.
4. Worker, Job/Run/Task/Attempt state'inin authoritative sahibi değildir; result event yayınlar.
5. Uzun süren API command'ları `202 Accepted` ve resource/reference ile yanıtlanır.
6. Raw credential, cookie, session state, authorization header veya secret queue/database/log/trace/audit/API response'a yazılmaz.
7. Target URL, redirect, webhook destination, scheme/host/port/IP ve response limit policy kontrolünden geçer.
8. Policy violation, credential error, CAPTCHA, SSRF/egress denial ve budget exhaustion otomatik retry edilmez.
9. Published Schema version ve Dataset version immutable'dır; record lineage korunur.
10. Usage event ve audit event geriye dönük sessizce silinmez/değiştirilmez; correction event veya retention policy kullanılır.
11. Browser context tek tenant/attempt'e aittir; session ve artifact cleanup idempotent yapılır.
12. Provider/LLM/Storage detayları core domain'e adapter üzerinden normalize edilir.

## 5. Phase 1 yetkilendirmesi

Gate `GO WITH CONDITIONS` veya `GO` seçilirse Phase 1 aşağıdaki ilk paketle başlayabilir:

| Başlangıç paketi | İlk çıktı |
|---|---|
| Repository/CI | Monorepo, workspace, lint/typecheck/test/build/dependency scan |
| Config/Auth | Validated config, environment separation, test identity/auth context |
| Database | PostgreSQL client, migration, core tables/indexes, idempotency/outbox |
| Queue | Redis/BullMQ connection, envelope, routing, outbox publisher |
| API | Health, common middleware, Project/Target/Schema/Job endpoints |
| Orchestrator | Initial planner, lifecycle transition, result consumer |
| Mock Worker | Claim, lease, heartbeat, success/failure result |
| Storage | Artifact metadata, checksum, local/S3-compatible adapter |
| Security/Telemetry | Tenant negative tests, redaction, correlation, basic metrics |
| E2E | API→queue→orchestrator→mock worker→storage smoke flow |

Phase 1 gerçek HTTP/Browser/Crawler yetenekleriyle başlamak zorunda değildir. Mock Worker, contract ve lifecycle entegrasyonunu doğrulamak için kullanılacaktır.

## 6. Non-blocker açık kararlar

| Karar | Default baseline | Owner | Phase 1 davranışı |
|---|---|---|---|
| Auth vendor | Provider-agnostic interface + test identity | Product/Engineering | Test adapter ile başlanır |
| Redis deployment | Environment-scoped Redis/BullMQ | SRE | Local/staging container veya managed equivalent |
| Storage vendor/region | Private S3-compatible adapter | SRE/Compliance | Local fake + contract adapter |
| Retention final values | M0 teknik önerisi | Compliance | Config/policy ile override edilebilir |
| LLM model/provider | Adapter + fake provider | Product/FinOps | Phase 1'de mock/stub |
| Full database RLS | Repository guard + defense in depth | Security/Backend | Schema review'de karar verilir |

Bu açık kararlar Phase 1 başlangıcını bloke etmez; default değişikliği ilgili ADR ve sözleşme version'ı ile kaydedilir.

## 7. Risk acceptance

| Risk | Seviye | Mitigation | Risk sahibi | Gate etkisi |
|---|---|---|---|---|
| Auth vendor seçilmedi | Medium | Provider-agnostic auth + test identity | Engineering | Non-blocker |
| Retention süreleri kurum policy'siyle kesinleşmedi | Medium | Policy version + configurable retention | Compliance | Non-blocker |
| Production provider topology kesin değil | Medium | Adapter, mock/fake, local/staging contract | SRE | Non-blocker |
| Full hardening Phase 15'e kaldı | Medium | Phase 1 prevent controls + Phase 15 gate | Security | Non-blocker |
| Gerçek target/browser implementation sonraki fazlarda | Low | Contract-first mock worker | Backend | Non-blocker |

## 8. Gate checklist

### Architecture

- [x] Backend context/container ve service boundaries kabul edildi.
- [x] Data ownership ve authoritative state sahipleri belirlendi.
- [x] Core/extended domain ve immutable snapshot kararları kabul edildi.
- [x] API, queue, lifecycle ve adapter contract'ları kabul edildi.

### Security and governance

- [x] Tenant isolation ve RBAC baseline'ı kabul edildi.
- [x] Secret/credential redaction ve egress guardrail'leri kabul edildi.
- [x] Retention, deletion, audit ve lineage baseline'ı kabul edildi.
- [x] Security control test matrix'i oluşturuldu.

### Reliability and operations

- [x] At-least-once, idempotency, retry, DLQ ve reconciliation policy'leri kabul edildi.
- [x] Correlation, logs, metrics, traces ve alarm baseline'ı kabul edildi.
- [x] Cost event/budget/attribution baseline'ı kabul edildi.
- [x] Phase 1 handover ve exit criteria hazırlandı.

### Sign-off

- [ ] Product Owner
- [ ] Engineering Manager
- [ ] Solution Architect
- [ ] Backend Lead
- [ ] SRE/Platform Lead
- [ ] Security Lead
- [ ] Compliance/Legal
- [ ] FinOps/Operations
- [ ] QA Lead
- [ ] Kullanıcı onayı

## 9. Gate kararı

**Önerilen karar:** `GO WITH CONDITIONS`

**Gerekçe:** M0 backend sözleşmeleri ve kritik guardrail'ler tamamlanmış ve review edilmiştir. Phase 1 başlayabilir. Auth vendor, storage/provider topology ve nihai retention süreleri implementation öncesi açık karar olarak takip edilecek; ancak mevcut default baseline'lar Phase 1 Core Platform'ı bloke etmemektedir.

**Koşullar:**

1. P01-B03 config ve P01-B04 auth task'ları provider-agnostic default ile başlatılmalıdır.
2. P01-B06/P01-B07 migration task'ları P00-B05 invariant ve P00-B14 lineage/retention kurallarını doğrulamalıdır.
3. P01-B09/P01-B10 queue/outbox task'ları duplicate-safe ve reconcile edilebilir olmalıdır.
4. P01-B19 security testleri Phase 1 E2E gate'inden önce CI'ya alınmalıdır.
5. Production'a geçmeden önce Phase 15 security hardening ve go-live gate'i tamamlanmalıdır.

## 10. Gate sign-off kaydı

| Alan | Değer |
|---|---|
| Gate ID | GATE-P00-M0 |
| Karar | GO WITH CONDITIONS |
| Karar tarihi | Kullanıcı onayı ile doldurulacak |
| Effective release | Phase 1 — Core Platform Backend |
| Blocker sayısı | 0 |
| Non-blocker açık karar sayısı | 6 |
| Gate owner | Engineering Manager |
| Sonraki milestone | M1 — Core Platform MVP |
| Sonraki faz | Phase 1 — Core Platform |

## 11. P00-B20 kabul kriterleri

P00-B20 `Accepted` sayılması için:

1. P00-B01–P00-B19 artefact'lerinin tamamı Accepted durumundadır.
2. M0 guardrail'leri ve değiştirilemez güvenlik/lifecycle kararları kayıtlıdır.
3. Phase 1 başlangıç yetkilendirmesi, başlangıç task paketi ve koşulları yazılıdır.
4. Non-blocker açık kararlar owner ve Phase 1 davranışıyla listelenmiştir.
5. Risk acceptance ve gate checklist'i tamamlanmıştır.
6. Önerilen `GO WITH CONDITIONS` kararı ve koşulları kullanıcı tarafından onaylanmıştır.
7. Task board, gate kaydı ve README aynı durumu göstermektedir.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: phase-0-m0-task-board.md "M0 task board"
[3]: phase-0-m0-review-minutes.md "M0 review minutes"
[4]: phase-0-m0-phase1-handover.md "Phase 1 handover"
[5]: phase-0-m0-backend-security.md "Backend security baseline"
[6]: phase-0-m0-security-controls.md "Security control matrix"
[7]: phase-0-m0-reliability-policy.md "Reliability policy"
[8]: phase-0-m0-data-governance.md "Data governance baseline"
[9]: phase-0-m0-observability-standard.md "Observability standardı"
[10]: phase-0-m0-cost-model.md "Cost model"
