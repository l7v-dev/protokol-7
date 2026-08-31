# 10 — MVP Kapsamı ve Teslim Planı

**Sürüm:** 0.1.0  
**Durum:** Tasarım  
**Kapsam:** MVP sınırı, fazlar, kabul kriterleri ve sonraki ürün adımları

## 1. Ürün hedefi

Nihai ürün deneyimi **“URL ver, sistem geri kalanını kontrollü biçimde optimize etsin”** ilkesidir. Kullanıcı Target URL, beklenen Schema ve çalışma seçeneklerini tanımlar. Platform; erişim policy'sini doğrular, mümkünse HTTP Worker ile başlar, gerekiyorsa izinli Browser Worker fallback'i uygular, extraction ve validation sonrası Dataset üretir.

Bu hedef, ilk sürümde tam otonom bir AI agent gerektirmez. MVP; deterministik durum makineleri, açık policy'ler ve temel strategy seçimi ile ürünün ana değerini doğrulamalıdır.

## 2. Faz planı

| Faz | İçerik | Çıktı |
|---|---|---|
| Phase 0 | Architecture & Specification | Bu belge seti, domain/API/lifecycle/security sözleşmeleri |
| Phase 1 | Core Platform | API, PostgreSQL, Redis/BullMQ, Orchestrator, Scheduler iskeleti |
| Phase 2 | HTTP Scraping Engine | GET/POST, headers/cookies policy, redirects, timeout, retry, parse |
| Phase 3 | Browser Engine | Playwright/Chromium pool, context/session, page actions, artifact |
| Phase 4 | Proxy Intelligence | Provider abstraction, health, lease, cost ve policy-aware seçim |
| Phase 5 | Reliability Engine | Error classifier, rate limit, retry/backoff ve strategy fallback |
| Phase 6 | Extraction Engine | CSS/XPath, JSONPath, normalize ve extraction planı |
| Phase 7 | Schema Engine | Schema version, validator, quality score ve staging |
| Phase 8 | Crawler Engine | Seed, queue, link discovery, dedup, depth/domain/url policy |
| Phase 9 | Job Orchestration | Job/task/attempt lifecycle, cancellation, retry ve progress |
| Phase 10 | AI Strategy Engine | Hedef analizi ve kontrollü strategy önerisi |
| Phase 11 | Dataset Platform | Dataset version, record, export, API/S3 çıktıları |
| Phase 12 | Control Center | Dashboard, job/worker/proxy/schema/dataset ekranları |
| Phase 13 | Observability | OpenTelemetry, Prometheus, Grafana, Loki ve trace zinciri |
| Phase 14 | Cost Intelligence | Request/browser/proxy/LLM/storage/compute/retry attribution |
| Phase 15 | Security hardening | RBAC, API keys, secrets, audit, isolation, retention |
| Phase 16 | Provider expansion | Yeni proxy/LLM provider adapter'ları ve karşılaştırmalı health |

## 3. MVP kapsamı

MVP, tek URL veya sınırlı URL listesiyle veri üretmeyi, temel crawl hazırlığını ve gözlemlenebilir bir job lifecycle'ını doğrulamalıdır. Aşağıdaki yetenekler MVP'ye dahildir:

| Yetenek | Kabul seviyesi |
|---|---|
| Project | Oluşturma, listeleme, tenant izolasyonu |
| Target | URL, host, erişim policy'si, HTTP/browser tercihi |
| Schema | Alan tipi, zorunluluk, minimum/maximum ve version |
| Job | Oluşturma, queue, run, cancel, retry, status query |
| Task/Attempt | Lease, heartbeat, retry, error ve sonuç kaydı |
| HTTP Worker | GET/POST, header, redirect, timeout, response kontrolü |
| Browser Worker | Playwright ile izole context, navigation ve temel artifact |
| Queue | Redis/BullMQ, ayrı task type routing, DLQ |
| Proxy | Adapter arayüzü ve en az bir gerçek/mock provider |
| Extraction | CSS/XPath ve JSONPath |
| Validation | Schema doğrulama, quality score, valid/invalid ayrımı |
| Dataset | Versioned kayıt, JSON/JSONL/CSV export hazırlığı |
| API | REST `/api/v1` ve ortak error envelope |
| Dashboard | Job, worker, queue, quality ve temel maliyet görünümü |
| Operations | Structured log, temel metric, health/readiness |

## 4. MVP dışında tutulacaklar

Aşağıdaki özellikler ilk sürümde yapılmamalıdır: mobile proxy desteği, kurum içi residential proxy network, provider marketplace, multi-region Kubernetes, ileri seviye otonom AI agent, çok sayıda provider için özel optimizasyon, tam no-code builder, kullanıcı tanımlı serbest JavaScript çalıştırma ve sınırsız recursive crawling.

Bu sınır, ürünün erişim, extraction ve maliyet değerini daha küçük bir operasyonel yüzeyde doğrulamayı amaçlar. MVP dışı maddeler sonraki fazlarda adapter, strategy veya ayrı ürün modülü olarak eklenmelidir.

## 5. MVP kabul kriterleri

### Kullanıcı akışı

Kullanıcı yeni bir Project oluşturabilmeli, Target URL ve Schema tanımlayabilmeli, Job başlatabilmeli, Job durumunu görebilmeli ve tamamlanmış Dataset version'ını dışa aktarabilmelidir. Başarısız Job için hata kodu, retry edilebilirlik ve son attempt özeti görünür olmalıdır.

### Teknik akış

Bir Job, API'den kabul edildikten sonra queue'ya yazılmalı; worker task'ı claim edip attempt oluşturmalı; erişim, extraction ve validation sonuçları tenant kapsamıyla kaydedilmeli; Dataset version yalnızca publish koşulları sağlandığında görünür olmalıdır. Worker kaybı veya timeout durumunda task lease sonrası yeniden değerlendirilmeli, aynı attempt sonucu iki kez uygulanmamalıdır.

### Güvenlik

Tenant dışı kaynak okunamamalı, private network hedeflenememeli, credential değerleri loglanmamalı, Browser context'leri tenant'lar arasında paylaşılmamalı ve export bağlantıları süreli olmalıdır. Kritik eylemler audit log üretmelidir.

### Operasyon

API, queue, database, worker ve storage için health/readiness kontrolleri bulunmalı; job/task/attempt boyunca aynı trace veya korelasyon zinciri görülebilmeli; queue backlog, worker heartbeat, hata oranı ve extraction quality dashboard'da izlenebilmelidir.

## 6. Faz çıkış koşulları

Bir faz, yalnızca kodun çalışmasıyla tamamlanmış sayılmaz. Her faz için API veya mesaj sözleşmesi, test senaryoları, hata ve retry davranışı, metrik/log görünürlüğü ve operasyon notu güncellenmelidir. Faz kapanışında geriye dönük uyumluluk, güvenlik etkisi, maliyet etkisi ve rollback yolu değerlendirilmelidir.

## 7. Önceliklendirme

İlk teslim sırası şu şekilde önerilir: Core Platform, HTTP Worker, Schema/Validation, Job Orchestration, Dataset, Browser Worker, Control Center, Observability, Proxy Intelligence ve ardından Crawler/AI Strategy. Böylece ürün, browser ve AI maliyeti oluşmadan temel HTTP-to-dataset değerini doğrulayabilir.

## 8. Başarı ölçütleri

MVP sonrası değerlendirme; job kabul oranı, başarılı valid record oranı, extraction quality trendi, HTTP ile tamamlanan job yüzdesi, browser fallback oranı, ortalama queue wait, terminal hata dağılımı, cost/record ve incident sayısı üzerinden yapılmalıdır. Bu ölçütler hedef kaynak hatalarını platform kusurundan ayıracak şekilde kırılımlı tutulmalıdır.

## 9. Ürün hedefi örneği

```text
Target: https://example.com/products
Schema: product_name, price, brand, stock

Analyze target
  ↓
HTTP possible? yes
  ↓
HTTP Worker
  ↓
403? no
  ↓
Extract
  ↓
Validate
  ↓
Quality 96%
  ↓
Dataset
  ↓
DONE
```

Başarısız akışta sistem; policy izin veriyorsa ve maliyet bütçesi uygunsa sınırlı Browser fallback veya uyumlu provider değişimi önerir. Bu kararın her adımı audit/strategy event'i olarak saklanır; kullanıcı proxy, parser, retry veya worker ayrıntılarını elle yönetmek zorunda kalmaz.

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
