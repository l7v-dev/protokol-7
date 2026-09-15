# Format Standartları ve İki Aşamalı Çıkarım Sözleşmesi (Korteks)

Bu doküman; sistem bileşenleri, veri yapıları, istem tasarımı ve ajan çıktılarında kullanılacak veri formatlarının seçim kriterlerini, token optimizasyon katsayılarını ve mimari sözleşmelerini tanımlar.

Kaynaklar:
- Tam et al. (EMNLP 2024), "Let Me Speak Freely? A Study on the Impact of Format Restrictions on LLM Reasoning"
- Improving Agents & StructEval Benchmark Serileri
- Anthropic Prompt Engineering & XML Sectioning Standartları

---

## 1. Sistem Katmanlarına Göre Format Matrisi

| Sistem Katmanı | Format | Gerekçe ve Teknik Mekanizma | Yasaklanan / Kaçınılacak Yaklaşım |
|---|---|---|---|
| **Dokümantasyon & Bağlam** | Markdown (`.md`) | JSON'a kıyasla %30-%55 token tasarrufu. Transformatör self-attention mekanizmasının doğal başlık (`#`) ve liste düzeniyle uyumu. | Bağlam veya RAG belgelerini anahtar tekrarlı JSON dizileri olarak modele aktarmak. |
| **İç İçe Durum & Şema** | YAML (`.yaml`) | İç içe geçmiş veri yapılarında %62,1 anlama doğruluğu (JSON %50,3, XML %44,4). Parantez/tırnak gürültüsü olmadan girintiye dayalı hiyerarşik temsil. | Derin nesne ağaçlarını parantez ve tırnak gürültüsü içeren ham JSON dizileri olarak modele enjekte etmek. |
| **Dış İletişim & RPC** | JSON (`.json`) | Makineler arası standart veri takasında ve Model Context Protocol (MCP JSON-RPC 2.0) trafiğinde sıfır sözdizimi ayrıştırma hatası ve katı tip güvenliği. | Araç yürütme aşamasında sentaksı korunamayan deneysel sıkıştırılmış formatlara (TOON vb.) bel bağlamak. |
| **İstem İzolasyonu** | XML (`.xml`) | `<rules>`, `<context>`, `<tools>` etiketleriyle sistem talimatı ve kullanıcı girdisi arasında fiziksel sınır çekme. Claude modellerinde talimat takibini %23 artırma. | Dışarıdan gelen kontrolsüz verileri ve kuralları sınır belirteci olmaksızın ham metin olarak birleştirmek. |
| **Beceri Tanımları** | Hybrid (`SKILL.md`) | Metaveri YAML frontmatter bloğunda (`name`, `description`, `trigger`), prosedürel gövde Markdown formatında. Aşamalı açığa çıkarma ile bağlam tüketimini minimize etme. | Becerileri devasa JSON şemalarına hapsetmek veya tüm prosedürleri açılışta bağlama yüklemek. |

---

## 2. İki Aşamalı Çıkarım Sözleşmesi (NL-to-Format)

### Sorun Tanımı (Biçimlendirme Vergisi)
Model çıktısında doğrudan katı JSON-mode veya gramer kısıtlamalı decoding zorlanması, modelin token olasılık uzayını budayarak serbest Chain-of-Thought (CoT) akıl yürütmesini sakatlar. Sıfır örnekli JSON üretiminde modeller `"answer"` anahtarını `"reason"` anahtarından önce üretmeye zorlanır; bu da adım adım muhakemeyi atlayarak doğrudan tahmine yol açar ve matematik/mantık doğruluğunu %96,2'den %91,0'a düşürür.

### Zorunlu Mimari Protokol
Karmaşık akıl yürütme ve yapılandırılmış çıktı gerektiren tüm süreçlerde iki aşamalı çıkarım boru hattı işletilmelidir:

```
[Kullanıcı İstemi]
       |
       v
[Aşama 1: Serbest Muhakeme (Markdown / Doğal Dil)]
* Kısıtlanmamış token uzayı
* Eksiksiz Chain-of-Thought
* Hipotez ve invariant değerlendirmesi
       |
       v
[Aşama 2: Şema Dönüştürme (Hafif Dönüştürücü / Deterministik Parser)]
* Mantıksal çıkarımın katı JSON / YAML şemasına izdüşümü
* %96,2 akıl yürütme korunumu
       |
       v
[Doğrulanmış Yapılandırılmış Çıktı]
```

Doğrudan API düzeyinde serbest düşünceyi engelleyen zorlamalı JSON bayrakları kullanılmamalıdır.

---

## 3. Yasaklanan ve Dışlanan Formatlar

1. **TOON / JTON (Token-Oriented Object Notation):** Tablosal veride token tasarrufu sağlasa bile, iç içe geçmiş nesnelerde anlama doğruluğunu %43,1'e düşürdüğü ve paralel araç çağrılarında sentaks çöküşüne yol açtığı için üretim kod tabanında yasaktır.
2. **Ham Metin İstem Birleştirme:** Kullanıcı girdisi, dış araç çıktısı ve sistem kurallarının XML sınır etiketleri (`<input>`, `<system_rules>`) olmadan tek bir metin bloğunda karıştırılması kesinlikle yasaktır (prompt enjeksiyonu ve kural bulanıklaşması riski).
