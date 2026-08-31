# Backend Phase 0 — M0 Sign-off ve Çalışma Protokolü

**Program:** Scraping Platform  
**Kapsam:** Yalnızca backend  
**Milestone:** M0 — Architecture Baseline  
**Sürüm:** 1.0.0  
**Durum:** Sign-off öncesi çalışma dokümanı  
**Yazar:** Manus AI

## 1. Oturum hedefi

Bu doküman, backend-only Phase 0 çalışmasının birlikte yürütülmesi için karar ve onay protokolüdür. İlk task **P00-B01 — Backend kapsamı, non-goals ve M0 sınırını onayla** olarak başlatılmıştır. P00-B01 tamamlanmadan sonraki task'ların `Accepted` durumuna geçirilmemesi önerilir.

## 2. Bu oturumda alınması gereken kararlar

| Kod | Karar konusu | Önerilen varsayılan | Karar sonucu |
|---|---|---|---|
| D-001 | Backend kapsamı | API, Orchestrator, Scheduler, HTTP Worker, Browser Worker, Extractor, Validator, Crawler, Proxy Manager, Storage, Observability ve Cost interface'leri | Bekliyor |
| D-002 | Frontend sınırı | UI implementasyonu yok; yalnızca backend API ve event contract | Bekliyor |
| D-003 | MVP başlangıç stack'i | TypeScript/Node.js, Fastify, PostgreSQL, Redis/BullMQ, S3-compatible storage | Bekliyor |
| D-004 | Job yürütme modeli | API senkron kabul eder; uzun işler queue üzerinden asenkron yürür | Bekliyor |
| D-005 | Data source of truth | Job/task/attempt metadata PostgreSQL; queue yalnızca dispatch/execution state | Bekliyor |
| D-006 | İlk strategy | HTTP-first; browser yalnızca policy izin verirse kontrollü fallback | Bekliyor |
| D-007 | Auth | Provider-agnostic interface; ilk provider Phase 1 kickoff'ta seçilir | Bekliyor |
| D-008 | Storage | S3-compatible adapter; gerçek ortam sağlayıcısı Phase 1'de netleşir | Bekliyor |
| D-009 | Queue reliability | Transactional outbox veya eşdeğer güvenilir publish | Bekliyor |
| D-010 | Uyum sınırı | Yetkili veri toplama; otomatik CAPTCHA bypass ve serbest script yok | Bekliyor |

## 3. P00-B01 kabul formu

P00-B01 için aşağıdaki beyanın onaylanması gerekir:

> Backend çalışması Phase 0'da mimari ve sözleşme baseline'ı üretir. Frontend, mobil uygulama, görsel tasarım ve production implementation bu task'ın kapsamı dışındadır. Backend, yalnızca izinli ve policy ile sınırlandırılmış veri toplama işlerini destekler. M0 tamamlanmadan Phase 1 kodlama task'larına geçilmez.

| Onay alanı | Sorumlu | Durum | Tarih / not |
|---|---|---|---|
| Scope ve non-goals | Product Owner | Bekliyor | |
| Teknik kapsam | Engineering Manager | Bekliyor | |
| Mimari sınır | Solution Architect | Bekliyor | |
| Uyum sınırı | Compliance/Legal | Bekliyor | |
| Güvenlik sınırı | Security Lead | Bekliyor | |

## 4. M0 gate sign-off

| Rol | İsim | Onay | Tarih | Not |
|---|---|---|---|---|
| Sponsor |  | Bekliyor |  |  |
| Product Owner |  | Bekliyor |  |  |
| Engineering Manager |  | Bekliyor |  |  |
| Solution Architect |  | Bekliyor |  |  |
| Backend Lead |  | Bekliyor |  |  |
| Security Lead |  | Bekliyor |  |  |
| SRE/Platform Lead |  | Bekliyor |  |  |

## 5. Phase 1'e geçiş koşulu

Phase 1 — Core Platform'a geçiş için M0 baseline dokümanı, task board, ADR ve bu sign-off kaydı birlikte incelenmelidir. Açık kararlar Phase 1 implementasyonunu etkilemiyorsa `Accepted with follow-up` olarak bırakılabilir; API, data ownership, tenant isolation, queue reliability veya security boundary'yi etkileyen kararlar kapanmadan implementasyon başlamamalıdır.

## 6. Birlikte ilerleme yöntemi

Her çalışma oturumunda tek bir task seçilir. Önce task amacı ve kabul kriteri okunur; sonra karar veya artefact üretilir; ardından ilgili doküman ve task board güncellenir. Task `In Review` durumuna alınmadan önce açık risk, dependency ve kararlar yazılır. Review tamamlandığında `Accepted` yapılır ve bir sonraki task aktive edilir.

İlk önerilen sıra şöyledir: **P00-B01 Scope → P00-B02 Requirements → P00-B03 Architecture → P00-B04 Ownership → P00-B05 Core Domain → P00-B07 API → P00-B09 Queue → P00-B10 Lifecycle → P00-B12 Security → P00-B15 Observability → P00-B18 Phase 1 Handover → P00-B20 M0 Gate**. P00-B06, P00-B13, P00-B14, P00-B16, P00-B17 ve P00-B19 ilgili ana task'larla paralel veya hemen sonrasında yürütülebilir.

## References

[1]: ../../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
[2]: phase-0-m0-backend-baseline.md "Backend Phase 0 M0 baseline"
[3]: phase-0-m0-task-board.md "Backend Phase 0 M0 task board"
[4]: phase-0-m0-backend-adr.md "Backend Phase 0 M0 ADR kayıtları"
