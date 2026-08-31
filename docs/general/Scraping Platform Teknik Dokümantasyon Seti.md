# Scraping Platform Teknik Dokümantasyon Seti

**Durum:** Tasarım ve MVP teknik şartname taslağı  
**Sürüm:** 0.1.0  
**Yazar:** Manus AI  
**Girdi:** Kullanıcı tarafından sağlanan sistem taslağı

## Amaç

Bu dokümantasyon seti, URL tabanlı veri toplama platformunun mimarisini, alan modelini, servis sınırlarını, iş ve worker yaşam döngülerini, extraction ve doğrulama yaklaşımını, güvenlik modelini, gözlemlenebilirlik standartlarını ve aşamalı teslim planını tanımlar. Metin, ilk taslağı doğrudan kopyalamak yerine tasarım kararlarını uygulanabilir teknik sözleşmelere dönüştürür.

Platformun temel kullanım modeli şudur: **Kullanıcı bir hedef ve beklenen veri şemasını tanımlar; sistem uygun erişim, çalışma, çıkarım ve doğrulama stratejisini seçerek sonucu bir dataset olarak sunar.**

> **Uyum sınırı:** Sistem yalnızca kullanıcının yetkili olduğu veya erişim şartları izin veren hedeflerde çalıştırılmalıdır. Anti-bot ve erişim yönetimi, korumaları saldırgan biçimde aşmak için değil; izinli veri toplamada hata sınıflandırması, geri çekilme, oran sınırlama ve güvenli yeniden deneme için kullanılmalıdır.

## Belge envanteri

| Belge | İçerik | Ana hedef kitle |
|---|---|---|
| [01 — Mimari ve bileşen tasarımı](docs/01-architecture.md) | Sistem sınırları, servisler, veri akışları ve mimari kararlar | Mimar, backend, platform |
| [02 — Domain modeli ve veri sözlüğü](docs/02-domain-model.md) | Project, Target, Job, Task, Worker, Dataset ve diğer varlıklar | Backend, veri, ürün |
| [03 — API sözleşmesi](docs/03-api-contract.md) | REST uçları, hata biçimi, idempotency, webhook ve WebSocket olayları | Backend, frontend, entegrasyon |
| [04 — Yaşam döngüleri ve durum makineleri](docs/04-lifecycles.md) | Job, Task, Worker, Proxy, Extraction ve Dataset durumları | Backend, worker, SRE |
| [05 — Worker, proxy ve erişim politikası](docs/05-workers-proxy.md) | HTTP/Browser worker davranışı, provider abstraction, risk ve uyum kontrolleri | Worker, platform, güvenlik |
| [06 — Extraction, schema ve crawler](docs/06-extraction-schema-crawler.md) | CSS/XPath, JSONPath, AI extraction, doğrulama ve crawl kuralları | Data engineer, backend |
| [07 — Güvenlik, RBAC ve çok kiracılı yapı](docs/07-security-rbac.md) | Kimlik, yetkilendirme, sırlar, tenant izolasyonu ve denetim | Güvenlik, backend, operasyon |
| [08 — Gözlemlenebilirlik ve maliyet zekâsı](docs/08-observability-cost.md) | Log, metrik, trace, kalite ve birim maliyet ölçümü | SRE, ürün, finans |
| [09 — Dağıtım ve operasyon runbook'u](docs/09-deployment-operations.md) | Yerel çalışma, ortamlar, release, alarm ve olay yönetimi | Platform, SRE, geliştirici |
| [10 — MVP kapsamı ve teslim planı](docs/10-mvp-roadmap.md) | MVP sınırı, kapsam dışı maddeler, kabul kriterleri ve sonraki fazlar | Ürün, teknik liderlik |
| [11 — ADR kayıtları](docs/11-adr.md) | Kritik mimari kararların gerekçeleri ve sonuçları | Tüm teknik ekip |
| [12 — Kurumsal roadmap ve delivery planı](docs/12-corporate-roadmap.md) | Yönetici özeti, faz takvimi, milestone, kritik yol ve release planı | Sponsor, PO, EM, PMO |
| [13 — Detailed task register](docs/13-task-register.md) | Phase 0–16 ayrıntılı task backlog'u, efor, bağımlılık ve kabul kriterleri | Tüm delivery ekipleri |
| [14 — Program controls](docs/14-program-controls.md) | RACI, RAID, KPI, kalite kapıları ve raporlama standardı | PMO, liderlik, kalite |
| [Backend Phase 0 — M0 baseline](docs/backend/phase-0-m0-backend-baseline.md) | Yalnızca backend için Architecture Baseline: servisler, domain, API, queue, lifecycle, güvenlik ve operasyon | Backend, mimari, SRE, güvenlik |
| [Backend Phase 0 — M0 task board](docs/backend/phase-0-m0-task-board.md) | M0 backend task'ları, bağımlılıkları, eforları ve kabul kriterleri | Backend delivery ekibi |
| [Backend Phase 0 — M0 ADR](docs/backend/phase-0-m0-backend-adr.md) | Backend mimari karar kayıtları ve onay akışı | Mimari, backend, güvenlik |
| [Backend Phase 0 — M0 sign-off](docs/backend/phase-0-m0-signoff.md) | Açık kararlar, P00-B01 kapsam onayı ve M0 gate formu | Ürün, backend, mimari |

## Normatif dil

Bu set içinde **MUST / ZORUNLU**, **SHOULD / ÖNERİLİR** ve **MAY / OLABİLİR** ifadeleri aşağıdaki şekilde kullanılır:

| İfade | Anlam |
|---|---|
| **MUST / ZORUNLU** | Güvenlik, veri bütünlüğü veya sözleşme açısından uygulanması gereken kural |
| **SHOULD / ÖNERİLİR** | Varsayılan çözüm; gerekçeli teknik kararla değiştirilebilir |
| **MAY / OLABİLİR** | İhtiyaca göre uygulanabilecek seçenek |

## Kurumsal planlama çıktıları

Bu setin kurumsal planlama ekleri; **17 faz**, **138 task**, **853 person-day** başlangıç eforu ve **T+W67** göreli takvim baseline'ı içerir. Düzenlenebilir takip için `scraping-platform-corporate-plan.xlsx`, entegrasyon ve toplu işleme için `scraping-platform-task-register.csv` kullanılmalıdır. Takvim, başlangıç tarihi ve ekip kapasitesi netleştiğinde rebaseline edilmelidir.

## MVP özeti

İlk sürümde Project, Target, Job, Redis tabanlı kuyruk, PostgreSQL kalıcı veri katmanı, HTTP Worker, Playwright tabanlı Browser Worker, proxy sağlayıcı soyutlaması, CSS/XPath ve JSON extraction, schema validation, Dataset, REST API, dashboard, log ve temel metrikler teslim edilir. Mobile proxy, kurum içi residential ağ, marketplace, multi-region Kubernetes, gelişmiş otonom AI agent, çok sayıda provider ve no-code builder MVP dışında tutulur.

## Uygulama ilkeleri

Platform **HTTP-first** çalışmalıdır; JavaScript gerektirmeyen hedeflerde browser açılmamalıdır. Her iş ve deneme izlenebilir bir kimliğe sahip olmalı, tekrar çalıştırmalar idempotent tasarlanmalı ve başarısızlıklar sınıflandırılmalıdır. Kullanıcının tanımladığı schema, extraction sonucunun sözleşmesidir; doğrulama yapılmadan dataset'e başarılı kayıt olarak yazım yapılmamalıdır. Tüm dış provider çağrıları adapter arayüzleri arkasında tutulmalı ve provider değişimi iş mantığını etkilememelidir.

## Kaynak

Bu dokümantasyon seti, ekli sistem taslağının teknik olarak düzenlenmiş ve ayrıntılandırılmış sürümüdür.

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
