# P04-B06 — Health, Geo, Capability ve Cost Tabanlı Proxy Selection Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B06  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B05 — kullanıcı onaylı

## 1. Teslim özeti

Proxy selection strategy, catalog eligibility, health score ve provider cost rate sinyallerini deterministic bir karar motorunda birleştirir. Catalog önce protocol, proxy class, country/region, sticky/rotation capability ve status filtrelerini uygular. Selection policy daha sonra proxy health score ve tahmini request/byte/lease maliyetini ağırlıklı bir composite score'a dönüştürür.

Health sample yoksa candidate neutral health score ile değerlendirilir; quarantine recommendation üreten candidate varsayılan olarak dışarıda bırakılır. Eşit composite score durumunda `proxyId` lexicographic tie-breaker kullanılır. Karar output'u selected entry, considered candidates, cost estimate, health/cost score ve safe reason listesi ile açıklanabilir kalır.

> **Temel kural:** Health veya cost avantajı, target egress, tenant, geo, class, credential ve provider capability policy'lerini geçersiz kılamaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/selection.ts` | Catalog/health/cost sinyalleriyle deterministic selection |
| `test/proxy/selection.test.ts` | Health/cost ağırlığı, tie-break, quarantine exclusion ve invalid estimate |
| `docs/phase-4-proxy-intelligence-task-board.md` | Phase 4 task durumu ve kanıt kaydı |

## 3. Selection input/output sözleşmesi

| Alan | Kural |
|---|---|
| `requirement` | Tenant/target protocol, class, geo, sticky/rotation policy |
| `estimatedRequests` | Pozitif integer request tahmini |
| `estimatedBytes` | Non-negative byte tahmini |
| `estimatedLeaseSeconds` | Pozitif lease tahmini |
| provider rate | Request cents, bytes/GB cents, lease/hour cents ve currency |
| health | Proxy scope score; sample yoksa neutral baseline |
| candidate | Selected entry ve score breakdown |
| reasons | Geo/class/health/cost safe explainability metadata |

Tahmini maliyet şu üç kaynağı kapsar: request adedi, estimated byte / GB ve lease süresi / saat. Rate bulunmayan provider için zero-cost default kullanılır; production'da P04-B07 cost configuration ile provider rate eksikliği açıkça raporlanmalıdır.

## 4. Scoring davranışı

Default ağırlık health için `0.7`, cost için `0.3` olarak tanımlıdır. Composite score, ağırlıkların toplamına normalize edilir. Cost score candidate'ler içindeki en yüksek tahmini maliyete göre bounded 0–1 aralığına dönüştürülür. Health score sample yoksa `0.5`, sample varsa health registry composite score'udur.

`quarantineRecommended=true` candidate default policy ile filtrelenir. Tüm candidate'ler unhealthy veya quarantine recommended ise `NO_HEALTHY_PROXY` terminal ve non-retryable selection error üretilir. Health/cost score yalnız eligible catalog entries arasında karşılaştırılır.

## 5. Explainability ve security

Decision output raw endpoint credential, username, password, token, cookie, target query veya provider response body içermez. Reasons yalnız score/category metadata'sıdır: health score, estimated cost, geo ve proxy class. Tenant/target requirement selection çağrısında zorunlu context'tir; selection farklı tenant state'iyle karışmaz.

Provider failure veya cost advantage, private target policy veya unauthorized geo requirement'ı bypass etmek için kullanılamaz. Selection result lease manager'a verildiğinde lease scope, expiry, provider ID ve capability yeniden doğrulanmalıdır.

## 6. Test kanıtı

Bu pakette **3 yeni selection testi** eklendi. Testler health ve cost ağırlığıyla seçim, explainable reason output, quarantine recommended candidate exclusion, deterministic proxy ID tie-break, all-unhealthy terminal error ve invalid estimate rejection davranışını doğrular.

Tam backend regression çalışmasında **33 test dosyası / 150 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler in-memory catalog/health ve static cost rate kullanır; distributed selection lock, live provider rate ve production cost source P04-B07/P04-B08 kapsamındadır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Provider rate source | Static in-memory Map | P04-B07 |
| Cost events | Tahmini score output | P04-B07 |
| Catalog reservation | Selection sonrası lease manager'a bırakılıyor | P04-B08 |
| Distributed selection | Process-local | SRE hardening |
| Provider health polling | Sample registry API | P04-B08 |
| Failover | Unsafe candidate bypass edilmez | P04-B08 |

## 8. Review kararı talebi

P04-B06 health, geo, capability ve maliyet temelli deterministic selection paketi review'a sunulmuştur. Onay sonrasında P04-B07 proxy request/GB/lease cost metering ve attempt/job allocation paketi hazırlanacaktır. Gerçek provider rate, distributed selection ve selection-to-lease transaction M4 gate'te doğrulanacaktır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b05-review.md "P04-B05 provider/proxy health score"
[2]: ./phase-4-proxy-intelligence-p04-b04-review.md "P04-B04 proxy lease lifecycle"
[3]: ./phase-4-proxy-intelligence-p04-b03-review.md "P04-B03 proxy catalog ve geo/class policy"
[4]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[5]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[6]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[7]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
