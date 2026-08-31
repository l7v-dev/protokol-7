# 14 — Program Controls: RACI, RAID, KPI ve Kalite Kapıları

**Program:** Scraping Platform  
**Sürüm:** 1.0.0  
**Durum:** Kurumsal kontrol çerçevesi  
**Yazar:** Manus AI

## 1. Rol sözlüğü

| Kod | Rol |
|---|---|
| SP | Sponsor |
| PO | Product Owner |
| EM | Engineering Manager |
| SA | Solution Architect |
| BE | Backend Lead |
| FE | Frontend Lead |
| DE | Data/Extraction Lead |
| SRE | SRE/Platform Lead |
| SEC | Security Lead |
| QA | QA Lead |
| UX | UX Lead |
| FIN | FinOps/Operations |
| COMP | Compliance/Legal |
| TW | Technical Writer |

RACI anlamları şöyledir: **R** işi fiilen yürütür, **A** nihai hesap verebilirliği taşır, **C** görüşü alınır, **I** bilgilendirilir. Her kontrol alanında tek bir `A` bulunması tercih edilir; `A/R` aynı kişinin hem sorumlu hem hesap verebilir olduğu durumdur.

## 2. RACI matrisi

| Kontrol alanı | SP | PO | EM | SA | BE | FE | DE | SRE | SEC | QA | FIN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Architecture baseline | A | R | C | C | C | C | C | C | I |
| Product scope / MVP | A | C | C | C | I | I | I | C | I |
| Core platform delivery | I | A | R | C | C | C | C | C | I |
| Worker and orchestration | I | C | A | C | I | C | R | C | I |
| Data quality and schema | I | C | C | A | I | C | R | C | I |
| Control Center / UAT | I | A | C | C | R | C | C | C | C |
| Security and compliance | I | C | C | C | I | A/R | C | C | C |
| Observability and SRE | I | C | C | C | I | C | A/R | C | I |
| Cost intelligence | I | C | C | C | I | C | C | A/R | I |
| Release / go-live | A | R | R | C | C | C | C | C | I |

## 3. RAID kaydı

| Kod | Tür | Başlık | Olasılık | Etki | Azaltım / aksiyon | Owner | Durum |
|---|---|---|---|---|---|---|---|
| R-001 | Risk | Hedef policy/uyum sınırlarının belirsiz kalması | High | High | Başlangıçta target policy, robots/policy, izin ve CAPTCHA davranışını zorunlu alan yap; Phase 0 ve 5 review. | Compliance/Legal | Open |
| R-002 | Risk | Browser kaynak tüketiminin maliyet ve kapasiteyi aşması | High | High | HTTP-first, browser budget, pool limit, concurrency cap ve cost alert uygula. | SRE/Platform Lead | Open |
| R-003 | Risk | Tenant verilerinin worker/storage katmanında karışması | High | High | Tenant context, object prefix, DB guard, context isolation ve negative testler. | Security Lead | Open |
| R-004 | Risk | Queue/database tutarsızlığı veya duplicate result | High | Medium | Idempotency, lease/fencing, transactional outbox/eşdeğer ve reconciliation. | Backend Lead | Open |
| R-005 | Risk | Selector/schema drift nedeniyle kalite düşüşü | Medium | High | Quality baseline, field diagnostics, drift alarmı ve versioned extraction plan. | Data/Extraction Lead | Open |
| R-006 | Risk | Provider kota/health değişimi | Medium | High | Adapter abstraction, health score, quarantine, failover ve provider contract test. | SRE/Platform Lead | Open |
| R-007 | Risk | LLM maliyetinin ve model davranışının kontrol dışına çıkması | Medium | High | AI yalnızca kontrollü fallback, token budget, strict schema, feature flag ve offline eval. | FinOps/Operations | Open |
| R-008 | Risk | SSRF veya unsafe webhook ile iç ağa erişim | High | High | IP/port/redirect validation, DNS consistency, egress restriction ve security test. | Security Lead | Open |
| R-009 | Risk | Gerçekçi test hedeflerinin ve sentetik fixture setinin eksikliği | Medium | Medium | Fixture catalog, mock providers, test data governance ve QA exit criteria. | QA Lead | Open |
| R-010 | Risk | Fazların ardışık ilerlemesi nedeniyle takvim kayması | Medium | Medium | Critical path review, parallel workstream planı, haftalık RAID review ve rebaseline. | Engineering Manager | Open |


Program manager, risk register'ı haftalık RAID review'da günceller. High/High riskler için mitigation task'ı veya açık risk kabulü olmadan ilgili faz gate'i kapatılmaz. Risk gerçekleştiğinde kayıt `Issue` durumuna geçirilir; karar verildiğinde `Decision` kaydı ADR veya change request ile ilişkilendirilir.

## 4. KPI ve raporlama

| Kod | KPI | Formül | Sıklık | Sahip | Hedef yönü | Kaynak |
|---|---|---|---|---|---|---|
| KPI-001 | Plan ilerlemesi | Tamamlanan task / toplam task | Haftalık | PMO/EM | ≥ %90 plan uyumu | Roadmap + Task Register |
| KPI-002 | Milestone predictability | Zamanında tamamlanan milestone / toplam milestone | Faz kapısı | PO/EM | ≥ %85 | Milestone register |
| KPI-003 | API availability | Başarılı API istek süresi / toplam süre | Günlük/aylık | SRE | SLO baseline sonrası | Prometheus/Grafana |
| KPI-004 | Queue wait | Task enqueue ile claim arasındaki süre | Saatlik | SRE | Baseline altında | Queue metrics |
| KPI-005 | Valid record rate | Valid record / extracted record | Job/faz | DE | Schema bazlı hedef | Dataset quality |
| KPI-006 | Extraction quality | Ağırlıklı field quality score | Job/target | DE | ≥ schema threshold | Validator |
| KPI-007 | HTTP-first ratio | HTTP ile tamamlanan job / tamamlanan job | Haftalık | BE/PO | Hedef kaynak portföyüne göre | Job strategy events |
| KPI-008 | Browser fallback ratio | Browser fallback kullanılan job / toplam job | Haftalık | SRE | Budget içinde | Strategy events |
| KPI-009 | Retry overhead | Retry attempt / toplam attempt | Günlük | SRE | Trend aşağı | Attempt usage |
| KPI-010 | Cost per valid record | Toplam job cost / valid record | Job/aylık | FIN | Budget/segment bazlı | Usage events |
| KPI-011 | Telemetry completeness | Korelasyon alanı tam event / toplam event | Günlük | SRE | ≥ %99 | Telemetry QA |
| KPI-012 | Critical security findings | Açık Critical/High bulgu sayısı | Faz/release | SEC | Go-live öncesi 0 veya risk kabulü | Security register |

KPI hedefleri baseline ölçümünden sonra kesinleştirilmelidir. Özellikle başarı oranı, extraction quality ve cost/record; target, project, schema, strategy ve provider kırılımlarında raporlanmalıdır. Hedef kaynak başarısızlığı ile platform içi hata ayrı kategorilerde tutulmalıdır.

## 5. Faz kalite kapısı

| Gate alanı | Minimum kanıt |
|---|---|
| Scope | Faz task'larının kapsamı ve kapsam dışı maddeler güncel |
| Delivery | Task register'da status, owner, dependency ve kabul kriteri dolu |
| Quality | Unit/integration/E2E test sonucu ve açık defect listesi |
| Security | Etkilenen trust boundary, secret, tenant, SSRF/egress ve access kontrolü değerlendirilmiş |
| Operations | Health, log, metric, trace, alarm ve runbook güncel |
| Data | Migration, backward compatibility, lineage, retention ve deletion etkisi incelenmiş |
| Cost | Provider/browser/LLM/storage/compute tüketimi ve budget etkisi ölçülmüş |
| Governance | ADR, change request, risk disposition ve accountable sign-off mevcut |

## 6. Yönetim raporu şablonu

Her haftalık program raporu aşağıdaki başlıkları içermelidir:

1. Yönetici özeti ve RAG durumu.
2. Bu hafta tamamlanan ve gelecek hafta planlanan task'lar.
3. Kritik yol, milestone tahmini ve sapma analizi.
4. Açık blocker, RAID değişiklikleri ve karar bekleyen konular.
5. Kalite, güvenlik, gözlemlenebilirlik ve maliyet KPI trendleri.
6. Scope değişiklikleri, change request'ler ve rebaseline önerileri.

## 7. RAG standardı

| Renk | Anlam | Yönetim aksiyonu |
|---|---|---|
| Green | Plan, kalite ve riskler kontrol altında | Normal izleme |
| Amber | Yönetilebilir sapma veya yüksek dikkat gerektiren risk | Owner aksiyonu ve haftalık takip |
| Red | Gate, güvenlik, bütçe veya kritik yol tehdidi | Steering escalation ve recovery plan |

## 8. References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
