# 12 — Kurumsal Program Roadmap ve Delivery Planı

**Program:** Scraping Platform  
**Belge sürümü:** 1.0.0  
**Belge durumu:** Yönetim onayına sunulacak planlama baseline'ı  
**Hazırlayan:** Manus AI  
**Planlama tarihi:** 2026-08-26  
**Takvim dili:** T+W = program başlangıcından itibaren hafta

## 1. Yönetici özeti

Bu plan, URL tabanlı veri toplama platformunun Phase 0–16 arasındaki tüm teslimatlarını kurumsal program yönetimi formatına dönüştürür. Plan; faz hedeflerini, iş paketlerini, task kayıtlarını, bağımlılıkları, kilometre taşlarını, kabul kapılarını, sorumlulukları, riskleri ve ölçüm modelini tek bir kontrol çerçevesinde toplar.

> **Planlama notu:** Takvim, başlangıç tarihi verilmediği için göreli hafta formatında hazırlanmış bir baseline'dır. Eforlar yaklaşık **person-day** tahminidir; ekip kapasitesi, provider sözleşmeleri, compliance onayı ve hedef kaynak portföyü netleştiğinde rebaseline edilmelidir.

## 2. Program hedefi ve başarı tanımı

Programın hedefi, kullanıcının yalnızca Target ve Schema tanımlayarak yetkili veri toplama işini başlatabildiği; platformun HTTP, browser, proxy, crawler, extraction, validation, dataset, maliyet ve operasyon süreçlerini izlenebilir biçimde orkestre ettiği kurumsal bir ürün ortaya koymaktır.

Başarı; yalnızca çalışan servis sayısıyla değil, **doğru ve denetlenebilir veri**, **tenant izolasyonu**, **kontrollü maliyet**, **açıklanabilir strategy kararları**, **operasyonel görünürlük** ve **release güvenliği** ile ölçülür.

## 3. Yönetim varsayımları

| Alan | Baseline varsayımı | Rebaseline tetikleyicisi |
|---|---|---|
| Ekip | Product, architecture, backend, frontend, data, SRE, security ve QA yetkinlikleri bulunan çapraz fonksiyonlu ekip | Ekip kapasitesi veya dış kaynak bağımlılığı değişirse |
| Çalışma modeli | İki haftalık sprint, haftalık program kontrolü, faz sonunda gate review | Sprint süresi veya release modeli değişirse |
| Ortam | Local, staging ve production ayrımı | Ortam/hosting kısıtı değişirse |
| Dış provider | Adapter yaklaşımı ve sınırlı provider seti | Provider sözleşmesi, kota veya maliyet değişirse |
| Uyum | Yalnızca yetkili/izinli veri toplama; CAPTCHA veya policy ihlalinde otomatik bypass yok | Hukuki/compliance değerlendirmesi değişirse |
| Takvim | Fazlar çoğunlukla ardışık; task seviyesinde kontrollü paralellik | Kritik path veya bağımlılıklar değişirse |

## 4. Faz roadmap'i

| Faz | Faz adı | Başlangıç | Bitiş | Süre (hf.) | Task | Efor (pd) | Exit gate | Accountable |
|---|---|---|---|---|---|---|---|---|
| 0 | Architecture & Specification | 1 | 3 | 3 | 9 | 38 | Architecture Baseline Approved | Solution Architect |
| 1 | Core Platform | 4 | 8 | 5 | 9 | 54 | Core Platform MVP Ready | Engineering Manager |
| 2 | HTTP Scraping Engine | 9 | 12 | 4 | 8 | 45 | HTTP Engine Accepted | Backend Lead |
| 3 | Browser Engine | 13 | 17 | 5 | 8 | 53 | Browser Engine Accepted | Backend Lead |
| 4 | Proxy Intelligence | 18 | 21 | 4 | 8 | 44 | Proxy Intelligence Ready | SRE/Platform Lead |
| 5 | Anti-Bot / Reliability Engine | 22 | 25 | 4 | 8 | 43 | Reliability Controls Accepted | SRE/Platform Lead |
| 6 | Extraction Engine | 26 | 29 | 4 | 8 | 51 | Extraction Engine Accepted | Data/Extraction Lead |
| 7 | Schema Engine | 30 | 32 | 3 | 8 | 45 | Schema Quality Gate Ready | Data/Extraction Lead |
| 8 | Crawler Engine | 33 | 37 | 5 | 8 | 50 | Crawler Engine Accepted | Backend Lead |
| 9 | Job Orchestration | 38 | 41 | 4 | 8 | 55 | Orchestration Production Ready | Engineering Manager |
| 10 | AI Strategy Engine | 42 | 45 | 4 | 8 | 49 | AI Strategy Guardrailed | Product Owner |
| 11 | Dataset Platform | 46 | 49 | 4 | 8 | 53 | Dataset Platform Accepted | Data/Extraction Lead |
| 12 | Control Center | 50 | 54 | 5 | 8 | 69 | Control Center UAT Signed-off | Frontend Lead |
| 13 | Observability | 55 | 57 | 3 | 8 | 50 | Observability SLO Ready | SRE/Platform Lead |
| 14 | Cost Intelligence | 58 | 60 | 3 | 8 | 45 | Cost Attribution Accepted | FinOps/Operations |
| 15 | Security | 61 | 64 | 4 | 8 | 59 | Security Go-live Approval | Security Lead |
| 16 | Provider Abstraction | 65 | 67 | 3 | 8 | 50 | Provider Portfolio Certified | SRE/Platform Lead |

Toplam baseline süre **T+W67**, toplam task sayısı **138**, toplam tahmini efor **853 person-day** olarak planlanmıştır. Bu değerler taahhüt değil, kapasite ve bağımlılıkları görünür kılan başlangıç planıdır.

## 5. Kilometre taşları

| Kod | Kilometre taşı | İlgili faz | Planlanan tarih | Başarı ölçütü |
|---|---|---|---|---|
| M0 | Architecture Baseline | Phase 0 | T+W03 | Onaylı architecture, contracts, security ve operating baseline |
| M1 | Core Platform MVP | Phase 1 | T+W08 | API → queue → worker mock → DB/storage akışı |
| M2 | HTTP Engine | Phase 2 | T+W12 | HTTP-first scraping acceptance suite |
| M3 | Browser Engine | Phase 3 | T+W17 | İzole browser fallback ve artifact akışı |
| M4 | Access Reliability | Phase 5 | T+W25 | Hata taxonomy, retry budget ve uyumlu escalation |
| M5 | Extraction Quality | Phase 7 | T+W32 | Schema validation ve quality gate |
| M6 | Crawler + Orchestration | Phase 9 | T+W41 | Crawl ve production-ready job lifecycle |
| M7 | Control Center UAT | Phase 12 | T+W54 | Operasyon dashboard ve UAT sign-off |
| M8 | Operational Readiness | Phase 14 | T+W60 | Observability ve cost attribution |
| M9 | Security Go-live | Phase 15 | T+W64 | Security approval ve release readiness |
| M10 | Provider Portfolio | Phase 16 | T+W67 | Sertifiye provider adapter seti |

Kilometre taşı geçişi, ilgili fazın task'larının tamamlanmasıyla otomatik kabul edilmez. Exit gate; kabul kriterleri, test kanıtı, risk değerlendirmesi, runbook güncellemesi ve accountable rolün onayını gerektirir.

## 6. Kritik yol

Programın kritik yolu şu sıralamayı izler: **Phase 0 Architecture → Phase 1 Core Platform → Phase 2 HTTP Engine → Phase 3 Browser Engine → Phase 5 Reliability → Phase 7 Schema → Phase 8 Crawler → Phase 9 Orchestration → Phase 12 Control Center → Phase 13 Observability → Phase 14 Cost → Phase 15 Security Go-live**.

Phase 4 Proxy Intelligence, Phase 6 Extraction, Phase 10 AI Strategy, Phase 11 Dataset ve Phase 16 Provider Portfolio task'ları; sözleşmeleri bozmadan belirli noktalarda paralel yürütülebilir. Buna karşın güvenlik, contract, storage, observability ve tenant kararları kritik yolun ön koşulları olarak korunmalıdır.

## 7. Release stratejisi

| Release | Kapsam | Hedef |
|---|---|---|
| R0 — Architecture Baseline | Phase 0 | Onaylı teknik/uyum sözleşmeleri |
| R1 — Core Platform | Phase 1 | API, queue, DB, storage ve mock worker akışı |
| R2 — HTTP MVP | Phase 2, temel Phase 6–7 | URL'den doğrulanmış kayda giden ilk değer akışı |
| R3 — Browser & Reliability | Phase 3–5 | Kontrollü browser fallback ve dayanıklılık |
| R4 — Crawl & Orchestration | Phase 8–9 | Çoklu URL ve production-ready lifecycle |
| R5 — Product Surface | Phase 11–12 | Dataset ve Control Center UAT |
| R6 — Operational Readiness | Phase 13–14 | Trace, alarm, kalite ve maliyet görünürlüğü |
| R7 — Go-live | Phase 15 | Security approval ve production release |
| R8 — Provider Expansion | Phase 16 | Sertifiye provider portföyü |

## 8. Faz yönetim standardı

Her faz için kickoff, scope freeze, execution, test/validation, gate review ve closure adımları uygulanır. Faz içinde yeni kapsam eklenmesi, yalnızca change request ile yapılır. Change request; iş etkisi, efor, takvim, güvenlik, maliyet ve bağımlılık etkisini içermeden plan baseline'ına alınmaz.

| Kontrol noktası | Zorunlu çıktı |
|---|---|
| Kickoff | Amaç, kapsam, task sahipleri, bağımlılıklar ve riskler |
| Execution | Task status, blocker, karar ve değişiklik kayıtları |
| Quality review | Test planı, test kanıtı, defect durumu ve kalite metrikleri |
| Gate review | Exit criteria, residual risk, runbook ve accountable sign-off |
| Closure | Öğrenimler, rebaseline kararı, sonraki faz handover'ı |

## 9. Durum ve ilerleme modeli

Task durumları `Not Started`, `Ready`, `In Progress`, `Blocked`, `In Review`, `Done`, `Accepted` ve `Cancelled` değerleriyle yönetilir. Bir task'ın `Done` olması kodun yazıldığını; `Accepted` olması ise kabul kriteri, test kanıtı ve gerekli dokümantasyonun tamamlandığını ifade eder.

İlerleme yalnızca task sayısıyla ölçülmemelidir. Faz ilerlemesi; ağırlıklı efor, exit criteria tamamlanma oranı, açık blocker, kritik risk ve defect durumu ile birlikte raporlanmalıdır.

## 10. Program yönetişimi

| Toplantı / kontrol | Sıklık | Katılımcılar | Çıktı |
|---|---|---|---|
| Daily delivery sync | Günlük | Workstream owner'ları | Blocker ve günlük aksiyon |
| Sprint planning/review | İki haftada bir | PO, EM, ekipler | Sprint scope, demo ve kabul |
| Architecture review board | Faz/gerekli karar | SP, PO, SA, EM, SEC, SRE | ADR, karar ve risk disposition |
| RAID review | Haftalık | EM, PO, SRE, SEC, QA | Risk/assumption/issue/decision güncellemesi |
| Quality review | Faz sonunda | QA, owner, PO, SEC/SRE | Test kanıtı ve gate önerisi |
| Steering committee | Aylık | Sponsor, PO, EM, FIN, SEC | Takvim, bütçe, kapsam ve escalation kararı |

## 11. Definition of Ready / Done / Accepted

**Definition of Ready:** Task'ın amacı, kapsamı, owner/accountable rolü, bağımlılıkları, kabul kriteri, test yaklaşımı ve gerekli kararları kayıtlıdır. Güvenlik veya dış provider etkisi varsa ilgili reviewer atanmıştır.

**Definition of Done:** Kod veya doküman tamamlanmış, unit/integration testleri çalışmış, log/metric/trace etkisi ele alınmış, migration/config etkisi belgelenmiş ve peer review tamamlanmıştır.

**Definition of Accepted:** Kabul kriterleri kanıtla karşılanmış, kritik defect kalmamış veya risk kabulü imzalanmış, kullanıcı/operasyon etkisi değerlendirilmiş, runbook ve ilgili teknik doküman güncellenmiştir.

## 12. Scope control ve change management

Kapsam değişiklikleri `CR-XXX` koduyla kaydedilir. Değişiklik sahibi; gerekçe, etkilenen faz/task, efor, takvim, güvenlik, maliyet, bağımlılık ve rollback etkisini belirtir. PO ürün önceliğini, EM teslim etkisini, SA teknik etkiyi, SEC güvenlik etkisini ve FIN maliyet etkisini değerlendirir. Sponsor yalnızca program baseline'ını etkileyen değişikliklerde karar verici olur.

## 13. Detaylı task listesi

Tüm fazların task kayıtları, bağımlılıkları, owner/accountable rolleri, efor tahminleri, milestone işaretleri, release hedefi ve kabul kriterleri [13 — Detailed Task Register](13-task-register.md) belgesinde ve düzenlenebilir Excel dosyasında bulunur.

## 14. Referanslar

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
