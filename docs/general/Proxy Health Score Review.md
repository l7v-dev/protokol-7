# P04-B05 — Provider/Proxy Health Score Review

**Program:** Scraping Platform  
**Milestone:** M4 — Proxy Intelligence Ready  
**Task:** P04-B05  
**Durum:** In Review  
**Kapsam:** Backend-only  
**Bağımlılık:** P04-B04 — kullanıcı onaylı

## 1. Teslim özeti

Provider ve proxy health sinyalleri `ProxyHealthRegistry` ile bounded rolling sample window içinde tutulur. Her sample provider ID, opsiyonel proxy ID, success/failure, latency, timestamp ve safe failure class taşır. Registry provider ve proxy scope'unda sample count, success rate, failure count, average latency, composite score, healthy ve quarantine recommendation üretir.

Composite score deterministik olarak success rate ve latency score birleşiminden hesaplanır. Minimum sample, minimum success rate ve minimum score eşikleri dolmadan bir provider/proxy için quarantine recommendation verilmez; böylece tek bir transient sample operasyonel state'i gereksiz biçimde bozmaz.

> **Temel kural:** Health score selection için sinyaldir; tek başına target policy, credential veya egress kuralını geçersiz kılamaz.

## 2. Uygulanan dosyalar

| Dosya | Sorumluluk |
|---|---|
| `src/proxy/health.ts` | Bounded sample window, provider/proxy score, threshold ve quarantine recommendation |
| `test/proxy/health.test.ts` | Score, success/latency, rolling window, threshold, clear ve invalid sample testleri |
| `docs/phase-4-proxy-intelligence-task-board.md` | Phase 4 task durumu ve kanıt kaydı |

## 3. Score sözleşmesi

| Alan | Açıklama |
|---|---|
| `sampleCount` | Bounded health window içindeki örnek sayısı |
| `successCount/failureCount` | Başarılı ve başarısız execution sayıları |
| `successRate` | `successCount / sampleCount`; boş window için 0 |
| `averageLatencyMs` | Window içindeki ortalama latency |
| `score` | Success ve latency sinyallerinin deterministik composite değeri |
| `healthy` | Minimum sample/rate/score eşikleri geçildiyse true |
| `quarantineRecommended` | Yeterli sample var ve health threshold başarısızsa true |
| `lastSampleAt` | Son sample zamanı; raw request/response yok |

Varsayılan reference implementation success rate'e ağırlık verir ve latency reference değerine göre bounded latency score üretir. Eşikler runtime config ile ayarlanabilir; geçersiz window, sample veya threshold startup/test aşamasında reddedilir.

## 4. Provider ve proxy scope

Provider sample'ları `provider:{providerId}` key'inde, proxy sample'ları `proxy:{providerId}:{proxyId}` key'inde tutulur. Böylece provider genel degradation ile tekil proxy degradation ayrılır. `clear` yalnız belirtilen scope'u temizler; başka provider/proxy window'ına dokunmaz.

Health result provider ID, opsiyonel proxy ID, score, counts ve safe failure class lineage'ı ile kullanılabilir. Credential, cookie, target URL, authorization, endpoint secret veya raw provider error body health sample'a alınmaz.

## 5. Quarantine ve selection bağlantısı

`quarantineRecommended=true` provider/proxy'yi otomatik olarak sessizce devre dışı bırakmaz; P04-B04 lease manager ve P04-B06 selection strategy bu sinyali policy'li biçimde kullanır. Operatör veya policy engine quarantine kararı verdiğinde katalog status'u `QUARANTINED` yapılır ve lease lifecycle audit'i üretilir.

Health score düşük olsa bile uygun alternatif yoksa sistem policy dışı provider seçemez. Health sinyali, capability/geo/class/tenant policy ve maliyet sinyalleriyle birlikte deterministic selection girdisi olmalıdır.

## 6. Test kanıtı

Bu pakette **4 yeni health score testi** eklendi. Testler provider/proxy scope ayrımı, bounded rolling window, success/failure counts, success rate, average latency, composite score, minimum sample threshold, quarantine recommendation, last sample timestamp, clear ve invalid configuration/sample davranışını doğrular.

Tam backend regression çalışmasında **32 test dosyası / 147 test** başarılıdır. `pnpm lint`, `pnpm typecheck` ve `pnpm build` başarılıdır. Testler process-local registry kullanır; distributed metrics store, provider health API polling ve production alert integration sonraki M4 gate kapsamındadır.

## 7. Açık sınırlar

| Konu | Mevcut durum | Sonraki task |
|---|---|---|
| Catalog status sync | Recommendation üretir, otomatik status mutasyonu yok | P04-B06/P04-B08 |
| Provider health polling | Sample API hazır | P04-B08/provider adapter |
| Distributed health state | Process-local | SRE hardening |
| Selection scoring | Henüz yok | P04-B06 |
| Cost weighting | Henüz yok | P04-B06/P04-B07 |
| Alerting/dashboard | Metrik contract hazır | Operations/Observability |

## 8. Review kararı talebi

P04-B05 provider/proxy health score ve başarı oranı implementation paketi review'a sunulmuştur. Onay sonrasında P04-B06 geo, capability, health ve maliyet temelli deterministic selection stratejisi hazırlanacaktır. Gerçek provider health polling ve distributed state M4 gate'te doğrulanacaktır.

## References

[1]: ./phase-4-proxy-intelligence-p04-b04-review.md "P04-B04 proxy lease lifecycle"
[2]: ./phase-4-proxy-intelligence-p04-b03-review.md "P04-B03 proxy catalog ve geo/class policy"
[3]: ./phase-4-proxy-intelligence-task-board.md "Phase 4 Proxy Intelligence task board"
[4]: ../../scraping-platform-docs/docs/05-workers-proxy.md "Worker, proxy ve erişim politikası"
[5]: ../../scraping-platform-docs/docs/10-mvp-roadmap.md "MVP faz planı ve Proxy Intelligence seviyesi"
[6]: ../../scraping-platform-docs/docs/13-task-register.md "Phase 4 Proxy Intelligence task register"
