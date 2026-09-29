# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif


- [/] **Klasik Filoloji, Antik Metinler & Dünya Mirası Paketi (Set 6: Perseus-DL, Sacred-Texts)** — `Tier: 2` — `docs/plans/wikimedia-kardesleri-ve-yeni-aktor-setleri-plani.md` kapsamındaki Tufts Perseus Digital Library (`perseus-dl`) ve Internet Sacred Text Archive (`sacred-texts`) aktörlerinin inşası, REST uç noktaları, MCP araçları, testleri ve dokümantasyonu.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Türk Hukuku & Küresel Patent Mühendisliği Paketi (Set 4: Anayasa-Mahkemesi, Danistay, Google-Patents)** — `Tier: 2` — T.C. Anayasa Mahkemesi kararları (`anayasa-mahkemesi`), T.C. Danıştay kararları (`danistay`) ve Google Patents / USPTO (`google-patents`) aktör sınıfları, REST uç noktaları (`POST /api/v1/<name>`), MCP araçları (`query_*`, toplam 77 araç), Zod/JSON şemaları, OpenAPI 3.1.0 tanımları, 34 birim/entegrasyon testi (`tests/*-actor.test.ts`), teknik wikileri (`docs/actors/*.md`), örnek yapılandırmaları (`examples/actors/*.json`) ve walkthrough dokümanı ile eksiksiz tamamlandı; 860 test ve 6 aşamalı doğrulama hattı başarıyla geçti.

- [x] **Açık Üniversite & STEM Ders Kitapları Aktörleri (Set 3: LibreTexts, Open-Textbook, Semantic-Scholar)** — `Tier: 2` — LibreTexts STEM ders kitapları ve formül çıkarıcı (`libretexts`), University of Minnesota Açık Ders Kitaplığı ve hakemli değerlendirme çıkarıcı (`open-textbook`), ve Semantic Scholar 200M+ akademik yayın ve atıf grafı çıkarıcı (`semantic-scholar`) aktör sınıfları, REST uç noktaları (`POST /api/v1/<name>`), MCP araçları (`query_*`, toplam 74 araç), Zod/JSON şemaları, OpenAPI 3.1.0 tanımları, 43 birim/entegrasyon testi (`tests/*-actor.test.ts`), teknik wikileri (`docs/actors/*.md`), örnek yapılandırmaları (`examples/actors/*.json`) ve walkthrough dokümanı ile eksiksiz tamamlandı; 826 test ve 6 aşamalı doğrulama hattı başarıyla geçti.

- [x] **Geliştirici Bilgi Tabanı ve Çok Dilli Kodlama Aktörleri (Set 5: DevDocs, Rosetta-Code, Papers-With-Code)** — `Tier: 2` — DevDocs API ve doküman çıkarıcı (`devdocs`), Rosetta Code çok dilli algoritma karşılaştırıcı (`rosetta-code`), ve Papers With Code / Hugging Face Papers makale ve kod deposu çıkarıcı (`papers-with-code`) aktör sınıfları, REST uç noktaları (`POST /api/v1/<name>`), MCP araçları (`query_*`, toplam 71 araç), Zod/JSON şemaları, OpenAPI 3.1.0 tanımları, birim/entegrasyon testleri (`tests/*-actor.test.ts`), teknik wikileri (`docs/actors/*.md`) ve örnek yapılandırmalarıyla eksiksiz tamamlandı; 806 test ve 6 aşamalı doğrulama hattı başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
