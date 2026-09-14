# ADR 0004: Beyin İlhamlı ve Deterministik Katmanlı AI Ajan Mimarisi

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-14
- **Karar Vericiler:** Antigravity, Sistem Mimarı

## Bağlam ve Problem

Geleneksel LLM tabanlı otonom kodlama ajanları, tekil monolitik istemlerle veya devasa depo içeriklerinin context penceresine kontrolsüzce doldurulmasıyla çalıştırıldığında şu ampirik sorunlara yol açmaktadır:
1. **Context Kayması ve Kirliliği (Context Drift):** Modelin geniş bağlam pencerelerinde mimari sınırları unutması ve token maliyetlerinin patlaması.
2. **Sistematik Hata Modelleri:** SWE-bench Verified analizlerine göre arızaların %79,5'i yanlış öncül (%30,7), bilgi eksikliği (%24,0) ve şartname ihmalinden (%14,9) kaynaklanmaktadır.
3. **Deterministik Doğrulama Eksikliği:** Modellerin güvenlik açığı barındıran kodlarda bile yüksek güven (overconfidence) göstermesi ve totolojik/sahte testler üretmesi.

## Karar

Proje, nöro-biyolojik metaforlarla modellenmiş ancak tamamen deterministik mühendislik kapılarıyla sınırlanmış 7 katmanlı bir ajan mimarisine geçirilmiştir:

1. **Prefrontal Korteks (Router) — `AGENTS.md`:** Her oturumda tek preload edilen, kısa ve talep üzerine çalışan giriş noktası.
2. **Hipokampüs (Görev Belleği) — `TASKS.md`:** Aktif görev, durum ve son 5 tamamlanan işi tutan çalışan bellek.
3. **Amigdala (Güvenlik & Blast Radius) — `rules/trust-tiers.md`:** Tier 0 (salt okunur) ile Tier 3 (tam otonom) arasında yetki sınırları.
4. **Bazal Ganglia (Refleks Hata Denetimi) — `rules/failure-checklist.md`:** İş bitmeden önce taranan refleks kontrol listesi.
5. **Prefrontal Üst-Biliş — `rules/metacognition.md`:** Kalibrasyon açığı düzeltmesi, bilişsel döngü tespiti ve insana eskalasyon kuralları.
6. **Serebellum (Prosedürler) — `skills/`:** Görev bazlı talep üzerine yüklenen beceri kütüphaneleri.
7. **Korteks (Kalıcı Bilgi) — `context/`:** Proje mimari sözleşmeleri ve otomatik türetilen sembol haritası (`connectome.md`).
8. **Epizodik Arşiv — `archive/`:** `index.jsonl` ve gzip transkriptleri ile bellek konsolidasyonu.

## Sonuçlar ve Kazanımlar

- Ajanın ilk oturum açılışındaki token yükü minimum seviyeye indirildi ("Retrieve, don't preload").
- Ajanın kendi kendine yetkisini genişletmesi prosedürel olarak engellendi.
- Doğrulama, metin tabanlı prompt yönlendirmesinden deterministik harici araçlara ve testlere bağlandı.
