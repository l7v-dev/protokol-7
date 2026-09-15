# ADR 0007: Hibrit Format Standartları, Duraklama Kontrolü ve Ajan Baskısı Koruması

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-15
- **Karar Vericiler:** Antigravity, Sistem Mimarı
- **İlgili Belgeler:**
  - `Resource-Pool/AI Ajanlarında Telemetry ve Gözlemlenebilirlik Üzerine Akademik Araştırmalar.md`
  - `Resource-Pool/AI Ajan Protokolleri ve Formatları.md`
  - `Resource-Pool/Akademik Araştırmalar Işığında AI Ajan Disiplin Kuralları, Kod Standartları ve Performans Yöntemleri.md`
  - `context/format-standards.md`
  - `rules/failure-checklist.md`

## Bağlam ve Problem

Büyük dil modellerinde katı yapısal biçim zorlamaları (doğrudan JSON-mode, gramer kısıtlamalı decoding), modelin Chain-of-Thought (CoT) akıl yürütme uzayını budamakta ve matematiksel doğruluğu %96,2'den %91,0'a düşürmektedir (Tam et al., EMNLP 2024). Aynı zamanda, uzun soluklu iş akışlarında çevresel direnç ile kalan bağlam penceresi arasındaki dengesizlik (Ajan Baskısı: $W / C_{rem}$) modellerin kuralları esnetmesine ve var olmayan fonksiyon/parametre uydurmasına (enstrümantal halüsinasyon) yol açmaktadır. SWE-bench arızalarının %75'i ise modelin somut durum farkı üretmeksizin token tükettiği anlamsal döngülerden (epipleksite duraklaması) kaynaklanmaktadır.

## Karar (Y-İfadesi)

*Katı biçimlendirme vergisi, anlamsal döngü kilitlenmeleri ve ajan baskısı riskleri bağlamında; akıl yürütme kalitesini, token verimliliğini ve sistemik duraklama direncini maksimize etmek adına; doğrudan katı JSON zorlaması ve kısıtsız döngü denemeleri yerine aşağıdaki standartlara karar verilmiştir:*

1. **Hibrit Format Standartları ve İki Aşamalı Çıkarım (NL-to-Format):**
   - Dokümantasyon, RAG bağlamı ve `SKILL.md` gövdelerinde %30-%55 token tasarrufu sağlayan Markdown (`.md`) zorunludur.
   - İç içe durumlar, durum makineleri ve kural şemalarında %62,1 doğruluk sağlayan YAML (`.yaml`) kullanılacaktır.
   - Dış API ve MCP RPC iletişiminde tip güvenliği için JSON (`.json`) kullanılacaktır.
   - İstem içi bölümlendirme ve prompt enjeksiyon izolasyonunda XML etiketleri (`<rules>`, `<context>`) kullanılacaktır.
   - Yapılandırılmış veri üretiminde modelin doğrudan JSON üretmesi yerine; 1. Aşamada serbest CoT muhakemesi, 2. Aşamada şema dönüştürücü kullanımı (NL-to-Format) uygulanacaktır.

2. **Epipleksite ve Duraklama İndeksi (Stagnation Detection):**
   - Model arka arkaya jeton veya araç çalıştırmasına rağmen çalışma alanında doğrulanabilir bir durum farkı (`git diff` == 0) 3 adım boyunca sıfır kalırsa yürütme durdurulacak ve üst bilişsel değerlendirme (`metacognition`) başlatılacaktır.

3. **Ajan Baskısı ve Normatif Sapma Koruması ($W / C_{rem}$):**
   - Çevresel kısıtlar ve hata mesajları birikip kalan bağlam penceresi daraldığında, ajanın kuralları ihlal etme veya halüsinatif araç türetme eğilimi refleks kontrol listesi (`failure-checklist.md`) ile denetlenecektir.

## Kesin Dışlamalar (Ban Decisions)

- **YASAK:** Akıl yürütme gerektiren adımlarda modelin düşünme zincirini atlayarak doğrudan tahmin yapmasına yol açan katı JSON zorlaması.
- **YASAK:** İç içe nesnelerde %43,1 doğruluğa düşen ve paralel çağrılarda sentaksı çöken sıkıştırılmış formatlar (TOON / JTON).
- **YASAK:** Çalışma alanında hiçbir doğrulanabilir fark üretmeksizin aynı problem uzayında 3 adımdan fazla anlamsal döngüde kalmak.

## Sonuçlar ve Ödünleşimler

- **Pozitif:** CoT akıl yürütme kalitesi %96,2 korunur; token tüketimi optimize edilir.
- **Pozitif:** Ajanın batık maliyet safsatası ve bilişsel kilitlenme yaşaması engellenir.
- **Ödünleşim:** Yapılandırılmış çıktılarda iki aşamalı çıkarım boru hattı ekstra bir ayrıştırma adımı gerektirebilir.
