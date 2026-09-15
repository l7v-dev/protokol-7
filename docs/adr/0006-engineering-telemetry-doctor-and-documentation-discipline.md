# ADR 0006: Engineering Telemetrisi, Depo Denetimi (Doctor) ve Açıklama Disiplini

- **Durum:** Kabul Edildi
- **Tarih:** 2026-09-15
- **Karar Vericiler:** Antigravity, Sistem Mimarı
- **İlgili Belgeler:**
  - `Resource-Pool/LLM Ajanlarının Çözülmemiş Sorunları.md`
  - `Resource-Pool/Yazılım ve AI Dokümantasyon Stratejileri.md`
  - `docs/adr/0004-brain-inspired-agent-architecture.md`
  - `docs/adr/0005-deterministic-oracle-and-aci-boundaries.md`
  - `rules/documentation-discipline.md`

## Bağlam ve Problem

Yazılım yaşam döngüsünde otonom ajanların eylemlerini gözlemleyememek, ajanların kod içi yorumlarda sohbet/dolgu dili kullanarak bağlamı kirletmesi ve kaynak kodda unutulan gizli anahtarlar (secrets) sistem bütünlüğünü zedelemektedir. Salt metin üretiminin ötesine geçerek bir mühendislik zekası platformu (Engineering Intelligence Platform) kurmak; adım adım ajan telemetrisi (Agent Trace), katı yorum/açıklama disiplini ve depo düzeyinde sağlık denetimi (`doctor`) gerektirmektedir.

## Karar (Y-İfadesi)

*Ajanların görünmeyen icra adımları ve kod içi anlatı kirliliği bağlamında; sessiz arızalar, güvenlik açıkları ve niyet kaybı riskleri karşısında; deterministik gözlemlenebilirlik ve sıfır bağlam kirliliğine ulaşmak adına; serbest metin logları ve denetimsiz yorumlar yerine aşağıdaki standartlara karar verilmiştir:*

1. **Açıklama ve Yorum Disiplini (Documentation Discipline):**
   Kod içi yorumlarda ve dosya başlıklarında sohbet/dolgu dili ("şimdi burada bunu yapıyoruz", "hadi bakalım", "kolayca hallediyoruz") ve pazarlama sıfatları (`smart`, `seamless`, `powerful`, `harika`) kesinlikle yasaklanmıştır. Yorumlar yalnızca mimari invariant'ları, algoritmik kısıtları, beklenmeyen yan etkileri ve tasarım gerekçelerini içerecektir. Aşikar kodun yorumlanması yasaklanmıştır.

2. **Gizli Anahtar (Secret Detection) Taraması:**
   Doğrulama boru hattına ve `doctor` denetimine kaynak kodda unutulan özel anahtarları (Private Keys, JWT, API tokens) tarayan statik güvenlik süzgeci entegre edilmiştir.

3. **Hafif Ajan Telemetrisi (Agent Trace):**
   `scripts/telemetry-logger.mjs` aracılığıyla her doğrulama, sağlık kontrolü ve araç çalıştırma adımı `archive/telemetry.jsonl` dosyasına yapılandırılmış olay olarak (`task`, `tool`, `duration_ms`, `status`, `error_class`) mühürlenecektir.

4. **Kapsamlı Depo Sağlık Denetçisi (`npm run doctor`):**
   Geliştirme ortamı, git durumu, kural bütünlüğü, gizli anahtar, dokümantasyon dili, SCA ve Biome linter'ı tek adımda çalıştıran `scripts/doctor.mjs` aracı sisteme dahil edilmiştir.

## Kesin Dışlamalar (Ban Decisions)

- **YASAK:** Kod içi yorumlarda konuşma dili, dolgu cümleler veya ajanın iç sesini yansıtan ifadeler.
- **YASAK:** Kaynak kodda şifrelenmemiş/maskelenmemiş gizli anahtarların (secrets) depoya commit edilmesi.
- **YASAK:** Ağır harici veritabanı veya OTel daemon çalıştırma zorunluluğu (hafif JSONL tercih edilir).

## Sonuçlar ve Ödünleşimler

- **Pozitif:** Ajanın neden ve hangi araçla ne yaptığı milisaniye düzeyinde şeffaflaşır.
- **Pozitif:** Kod tabanındaki gereksiz yorum kirliliği temizlenir, token tasarrufu sağlanır.
- **Ödünleşim:** Yeni kod yazılırken yorumların teknik disiplin filtresinden geçmesi gerekir.
