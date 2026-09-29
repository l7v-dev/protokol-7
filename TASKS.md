# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif


- [/] **Felsefe, Mantık ve Derin Muhakeme Aktörleri (Set 2: Stanford-Phil, Internet-Phil, Metamath, PhilPapers)** — `Tier: 2` — `docs/plans/wikimedia-kardesleri-ve-yeni-aktor-setleri-plani.md` kapsamındaki 4 derin muhakeme ve formel mantık aktörünün tip sözleşmeleri, sınıfları, manifestoları, REST rotaları, MCP araçları, testleri ve teknik dokümantasyonları inşa ediliyor.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Wikimedia Kardeş Projeleri Paketi (Set 1: Wikiquote, Wikibooks, Wikiversity, Wikivoyage, Wikinews, Wikispecies, Wikidata)** — `Tier: 2` — Wikimedia Vakfı'nın 7 temel kardeş projesi için aktör sınıfları (`WikiquoteActor`, `WikibooksActor`, `WikiversityActor`, `WikivoyageActor`, `WikinewsActor`, `WikispeciesActor`, `WikidataActor`), REST uç noktaları (`POST /api/v1/<name>`), MCP araçları (`query_*`, toplam 64 araç), Zod/JSON şemaları, OpenAPI 3.1.0 tanımları, birim/entegrasyon testleri (`tests/*-actor.test.ts`), teknik wikileri (`docs/actors/*.md`) ve örnek yapılandırmaları (`examples/actors/*.json`) eksiksiz hayata geçirildi; 749 test ve 6 aşamalı doğrulama hattı başarıyla geçti.

- [x] **Wiktionary Aktörü ve 198 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (wiktionary)** — `Tier: 2` — Wikimedia kardeş projesi Wiktionary için 47. aktör (`WiktionaryActor`) hayata geçirildi; 198 dünya dilini (Latince `la`, Sanskritçe `sa`, Eski İngilizce `ang`, Yidiş `yi`, Antik Yunanca `grc`, Gotça `got` gibi antik diller dahil) işleyen otonom ETL boru hattı (`scripts/wiktionary_pipeline/`) oluşturuldu; XML bz2 akışı -> leksikal tanım/etimoloji temizleyici -> Zstandard Parquet -> Google Drive v3 yükleme ve MD5 doğrulaması -> anında yerel silme döngüsü kuruldu; yerel diskte sıfır artık (zero disk residue) garanti edildi; REST rotası (`POST /api/v1/wiktionary`), MCP aracı (`query_wiktionary`, toplam 57 araç), birim/entegrasyon testleri ve teknik wiki (`docs/actors/wiktionary.md`) eksiksiz tamamlandı; `trash/` bağımlılığı tamamen kaldırılarak kök `.venv` ortamına taşındı.

- [x] **Wikisource Aktörü ve 85 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (wikisource)** — `Tier: 2` — Wikimedia kardeş projesi Wikisource için 46. aktör (`WikisourceActor`) hayata geçirildi; 85 dünya dilini (Latince `la`, Sanskritçe `sa`, Eski İngilizce `ang`, Çok Dilli / Antik Yunanca `sourceswiki`, Yidiş `yi` gibi antik/klasik diller dahil) işleyen otonom ETL boru hattı (`scripts/wikisource_pipeline/`) oluşturuldu; XML bz2 akışı -> wikitext/şiir temizleyici -> Zstandard Parquet -> Google Drive v3 yükleme ve MD5 doğrulaması -> anında yerel silme döngüsü kuruldu; yerel diskte sıfır artık (zero disk residue) garanti edildi; REST rotası (`POST /api/v1/wikisource`), MCP aracı (`query_wikisource`, toplam 56 araç), birim/entegrasyon testleri ve teknik wiki (`docs/actors/wikisource.md`) eksiksiz tamamlandı.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
