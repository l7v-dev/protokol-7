# ADR 0008: Dokuz Katmanlı Açıklık (Span) Mimarisi ve Korelasyon Telemetrisi

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-15
- **Karar Vericiler:** Antigravity, Sistem Mimarı
- **İlgili Belgeler:**
  - `Resource-Pool/AI Ajanlarında Telemetry ve Gözlemlenebilirlik Üzerine Akademik Araştırmalar.md`
  - `docs/adr/0006-engineering-telemetry-doctor-and-documentation-discipline.md`
  - `scripts/telemetry-logger.mjs`

## Bağlam ve Problem

Geleneksel APM ve OpenTelemetry (OTel) GenAI anlamsal standartları, sistemi yalnızca dış model çağrıları (`chat`, `completion`) ve münferit araç çalıştırmaları (`execute_tool`) üzerinden takip etmektedir. Bu eksiklik planlama, muhakeme, güvenlik ve geri bildirim aşamalarını görünmez kılmakta; arıza tespit oranını (FDR) 0,429 seviyesinde sınırlamaktadır. TelemetrySuffBench kıyaslaması ise yüzeysel telemetrinin arıza varlığını saptamasına karşın (%99,5-%100 F1), gecikmeli bağlama (delayed-binding) hatalarında kök neden lokalizasyon başarısının %0,5'in altına düştüğünü ve teşhislerin %97,9'unun kök neden yerine son patlak veren belirtiye odaklandığını kanıtlamaktadır.

## Karar (Y-İfadesi)

*Gecikmeli bağlama hataları, düşük kök neden lokalizasyonu ve akıl yürütme döngüleri bağlamında; arıza tespit oranını 1,000 üst sınırına ve kök neden teşhis doğruluğunu %97,2'ye çıkarmak adına; yüzeysel tekil log akışı yerine aşağıdaki 9 katmanlı açıklık ve korelasyon taksonomisine karar verilmiştir:*

1. **9 Katmanlı Açıklık (Span) Taksonomisi (`SPAN_TYPES`):**
   - `PLANNING`: Görev ayrıştırma ağacı, dinamik hedefler, revizyon kütüğü.
   - `REASONING`: Düşünce zinciri (CoT), ara hipotezler, belirsizlik ve entropi.
   - `TOOL_EXECUTION`: Şema tanımları, ham argümanlar, dönüş yükü, çalışma süresi.
   - `SAFETY_MONITOR`: Ray değerlendirme kütüğü, girdi/çıktı filtreleri, kural ihlalleri.
   - `DELEGATION`: Kaynak/hedef ajan kimlikleri, görev yükü, sözleşme arayüzü.
   - `MEMORY_ACCESS`: Getirilen bağlam parçaları, vektör benzerliği, bellek yazma/silme.
   - `CONTEXT_BUDGET`: Token tüketim ivmesi, kalan bağlam yüzdesi, ajan baskısı ($W / C_{rem}$).
   - `FEEDBACK_INTEG`: Terminal çıktısı, derleyici/linter mesajı, dosya/DB durum farkı (`diff`).
   - `SYSTEM_SYSCALL`: Soket (`connect`) ve dosya (`openat`) çekirdek çağrıları.

2. **Korelasyon Kimlikleri (`trace_id`, `span_id`, `parent_span_id`):**
   - Her olay tekil bir `span_id` ve çok adımlı görevi birbirine bağlayan `trace_id` taşır.
   - Nedensellik ağacı kurabilmek için hiyerarşik `parent_span_id` yapısı desteklenir.
   - `createTraceSession` fonksiyonu ile görev bazlı otomatik korelasyon bağlamı sağlanır.

3. **Geriye Dönük Uyumluluk ve Sıfır Dış Bağımlılık:**
   - Standart `logTrace` fonksiyonu mevcut parametreleri korur; `span_type` verilmediğinde `TOOL_EXECUTION` varsayılan atanır.
   - Ağır OTel daemon veya Postgres yerine atomik yerel JSONL (`archive/telemetry.jsonl`) formatı korunur.

## Kesin Dışlamalar (Ban Decisions)

- **YASAK:** Açıklık türü ve korelasyon kimliği taşımayan yapılandırılmamış serbest metin loglama.
- **YASAK:** Arızanın yalnızca terminal belirtisine odaklanıp kök neden kökenini (provenance) kaydetmemek.

## Sonuçlar ve Ödünleşimler

- **Pozitif:** Kök neden lokalizasyonu ve gecikmeli bağlama analizi deterministik hale gelir.
- **Pozitif:** SWE-bench hatalarının %75'ini oluşturan akıl yürütme döngüleri telemetrik olarak izlenebilir.
- **Ödünleşim:** Her açıklık kaydı JSONL'e ek metaveri ve ID alanları ekler.
