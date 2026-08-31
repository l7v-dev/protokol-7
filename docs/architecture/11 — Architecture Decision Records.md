# 11 — Architecture Decision Records

**Sürüm:** 0.1.0  
**Durum:** Tasarım kararları  
**Format:** Context, Decision, Consequences

## ADR-001 — TypeScript/Node.js ile başlama

**Durum:** Kabul edildi

**Bağlam:** Platform; API, scheduler, orkestrator ve birden fazla worker içerir. İlk hedef, tek bir monorepo içinde hızlı iterasyon ve ortak tip sözleşmesidir.

**Karar:** MVP için TypeScript ve Node.js kullanılacaktır. API için Fastify, frontend için Next.js/React/TypeScript, UI katmanı için Tailwind ve shadcn/ui, veri sorgulama için TanStack Query tercih edilir.

**Sonuçlar:** Ortak `packages/types` üzerinden API, queue ve worker sözleşmeleri paylaşılabilir. Browser runtime ve yüksek throughput gerektiren crawler/worker bileşenleri ileride Go'ya ayrılabilir. Bu ayrışma, mesaj sözleşmesi korunarak yapılmalıdır.

## ADR-002 — PostgreSQL kalıcı kaynak olarak kullanılacak

**Durum:** Kabul edildi

**Bağlam:** Tenant, project, target, job, task, attempt, schema, dataset ve audit ilişkisel bütünlük gerektirir.

**Karar:** İş metadata'sı, durumlar, ilişkiler, idempotency kayıtları ve kullanım olayları PostgreSQL'de tutulacaktır. Büyük artifact ve export dosyaları object storage'a yazılacaktır.

**Sonuçlar:** Domain sorguları ve audit tutarlılığı korunur. Büyük ham veri database'e yığılmaz. Migration ve tenant filtreleme standardı kritik hale gelir.

## ADR-003 — Redis/BullMQ ile asenkron orchestration

**Durum:** Kabul edildi

**Bağlam:** Crawl, browser, extraction ve validation işlemleri HTTP request yaşam süresinden uzun sürebilir; retry ve queue backpressure gerekir.

**Karar:** Redis/BullMQ, task dispatch, delayed retry, priority ve dead-letter iş akışları için kullanılacaktır. PostgreSQL, job/task/attempt gerçeğinin kalıcı kaynağı olmaya devam edecektir.

**Sonuçlar:** API hızlı biçimde job kabul edebilir. Queue ve database arasında idempotency, outbox veya eşdeğer güvenilir event yazımı tasarlanmalıdır. Redis kaybında tekrar oluşturulabilir ve güvenli requeue yolu bulunmalıdır.

## ADR-004 — HTTP-first, browser fallback

**Durum:** Kabul edildi

**Bağlam:** Browser başlatmak, HTTP isteğine göre daha ağır ve karmaşıktır. Hedeflerin bir kısmı doğrudan HTTP ile çıkarılabilirken bir kısmı JavaScript veya session gerektirir.

**Karar:** Strategy Engine önce HTTP uygunluğunu değerlendirir; Browser Worker yalnızca policy izin verirse ve HTTP yetersiz kalırsa çalıştırılır.

**Sonuçlar:** Ortalama maliyet ve gecikme düşebilir. Strategy kararları gözlemlenebilir olmalı; browser fallback sınırsız retry mekanizmasına dönüşmemelidir.

## ADR-005 — Dış provider'lar adapter arkasında tutulacak

**Durum:** Kabul edildi

**Bağlam:** Proxy ve LLM sağlayıcılarının kapasite, fiyat, health ve response biçimleri değişebilir. Platform tek şirkete bağlanmamalıdır.

**Karar:** `ProxyProvider` ve `LLMProvider` arayüzleri tanımlanacak; Bright Data, Oxylabs, Zyte, OpenAI, Anthropic, Gemini ve local provider gibi uygulamalar adapter olarak eklenecektir. MVP'de yalnızca gerçekten kullanılan provider'lar etkinleştirilecektir.

**Sonuçlar:** Provider değişimi çekirdek iş mantığını etkilemez. Provider-specific özelliklerin ortak arayüzü aşmaması ve capability olarak raporlanması gerekir.

## ADR-006 — Dataset version değişmez yayınlanacak

**Durum:** Kabul edildi

**Bağlam:** Aynı target farklı zamanlarda farklı kayıtlar üretir. Schema veya extraction planı değiştiğinde eski sonuçların neyle üretildiği bilinmelidir.

**Karar:** Dataset sonuçları version'lanacak; published version değişmez olacaktır. Yeni job varsayılan olarak yeni version üretir. Schema, extraction planı, source job, kalite ve checksum metadata'sı version'a bağlanır.

**Sonuçlar:** Reproducibility ve karşılaştırma güçlenir. Storage retention ve version cleanup ayrıca tasarlanmalıdır.

## ADR-007 — Policy engine worker'dan önce çalışacak

**Durum:** Kabul edildi

**Bağlam:** URL, redirect, proxy, browser action ve webhook girdileri güvenilmeyen dış girdilerdir. Sadece başarı oranına odaklanan bir retry mekanizması güvenlik ve uyum riski oluşturabilir.

**Karar:** Target, tenant ve platform policy'leri erişim ve worker eyleminden önce değerlendirilir. Policy ihlali retry edilmez; açık error code ile durdurulur.

**Sonuçlar:** Uyum sınırı merkezi ve denetlenebilir olur. Policy kararlarının nedenleri attempt metadata'sına yazılmalıdır.

## ADR-008 — Telemetri korelasyonu zorunlu olacak

**Durum:** Kabul edildi

**Bağlam:** Bir işin başarısızlığı API, queue, worker, proxy, target, parser veya storage katmanlarından kaynaklanabilir.

**Karar:** `requestId`, `traceId`, `jobId`, `taskId` ve `attemptId` tüm iç mesaj ve log zincirinde taşınacaktır. OpenTelemetry ortak instrumentation katmanı olacaktır.

**Sonuçlar:** Root-cause analizi ve maliyet attribution yapılabilir. Yüksek cardinality ve secret sızıntısı önlenmelidir.

## ADR-009 — AI extraction kontrollü fallback olacak

**Durum:** Kabul edildi

**Bağlam:** AI, değişken sayfa yapılarından anlamlı alanlar çıkarabilir; ancak model çıktısı deterministik veya otomatik olarak güvenilir değildir.

**Karar:** CSS/XPath ve JSONPath öncelikli kalacak; AI extraction yalnızca izinli ve maliyet bütçeli fallback olarak kullanılacaktır. Model çıktısı strict parse, schema validation ve quality scoring olmadan publish edilmeyecektir.

**Sonuçlar:** AI değer üretirken veri sözleşmesi korunur. Prompt/model sürümü, token maliyeti ve başarısızlıklar izlenmelidir.

## ADR-010 — MVP tek bölge ve sınırlı kapsamla teslim edilecek

**Durum:** Kabul edildi

**Bağlam:** Mobile proxy, residential network, marketplace, multi-region Kubernetes, gelişmiş agent ve no-code builder ürün yüzeyini büyütür.

**Karar:** MVP; Project, Target, Job, HTTP/Browser Worker, queue, schema/extraction/validation, Dataset, API, dashboard, log ve metric ile sınırlandırılacaktır.

**Sonuçlar:** Temel ürün değerinin daha erken doğrulanması ve operasyonel riskin sınırlanması sağlanır. İleri özellikler mevcut sözleşmeleri bozmayacak biçimde fazlandırılır.

## ADR şablonu

Yeni mimari kararlar aşağıdaki şablonla eklenmelidir:

```markdown
## ADR-XXX — Başlık

**Durum:** Öneri / Kabul edildi / Reddedildi / Yerine yenisi geçti

**Bağlam:** Kararı doğuran teknik ve ürün problemi.

**Karar:** Seçilen yaklaşım ve sınırları.

**Alternatifler:** Değerlendirilen seçenekler ve nedenleri.

**Sonuçlar:** Pozitif etkiler, trade-off'lar, yeni operasyon yükü ve geri dönüş etkisi.
```

## References

[1]: ../source/pasted_content.txt "Kullanıcı tarafından sağlanan sistem taslağı"
