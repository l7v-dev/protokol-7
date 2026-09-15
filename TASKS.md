# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Şu an aktif görev yok. Sıradaki faz veya talep bekleniyor)*

## Bekleyen (Blok var)

- *(Bekleyen görev yok)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Faz 4: Tarayıcı/Ağ Aktörleri ve NixOS Entegrasyonu** — `Tier: 2` — NetworkInterceptorActor, SerpSearchActor, NixOS flake/devenv/.envrc entegrasyonu tamamlandı; 68/68 test ve doğrulama hattı başarıyla geçti.
- [x] **Faz 3: Çekirdek Aktörlerin Entegrasyonu (sitemap-xml & markdown-reader)** — `Tier: 2` — SitemapXmlActor ve MarkdownReaderActor geliştirildi; 7 yeni birim testi, 2 yeni API rotası ve connectome haritası doğrulandı (60/60 test yeşil).
- [x] **Faz 2: Doğrulama ve Bilişsel Altyapı Düzeltmeleri** — `Tier: 2` — Connectome sistem haritası eksiksiz üretildi, ADR çakışması giderildi, Biome tüm projeye (43 dosya) entegre edildi ve emoji denetimi genişletildi.
- [x] **Faz 1: Güvenlik ve Çekirdek Düzeltmeler** — `Tier: 2` — SSRFGuard IPv6 bypass, BrowserPool context.route & launch kilidi, PolitenessLimiter yuva rezervasyonu, link mutlaklaştırma, 10MB payload limiti uygulandı; 53 test ve doğrulama hattı başarıyla geçti.
- [x] **Omega-3 Bilişsel Mimari Entegrasyonu** — `Tier: 2` — Proje çalışma alanına Omega-3 kuralları, hafızası ve araçları bağlandı.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
