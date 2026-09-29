# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **Wikimedia Kardeş Projeleri ve Yeni Korpus Aktörleri Uygulama Planı** — `Tier: 2` — `docs/plans/wikimedia-kardesleri-ve-yeni-aktor-setleri-plani.md` hazırlandı; Kalan Wikimedia Kardeşleri (Wikiquote, Wikibooks, Wikiversity, Wikivoyage, Wikinews, Wikispecies, Wikidata) ve 5 yeni yüksek değerli LLM korpus seti (Felsefe/Mantık, STEM Açık Ders Kitapları, Türk Hukuku & Patent, Çok Dilli Kodlama, Antik Miras) planlandı. Yeni oturumda Set 1 (Wikimedia Kardeşleri) ile başlanması hedeflendi.
## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Wiktionary Aktörü ve 198 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (wiktionary)** — `Tier: 2` — Wikimedia kardeş projesi Wiktionary için 47. aktör (`WiktionaryActor`) hayata geçirildi; 198 dünya dilini (Latince `la`, Sanskritçe `sa`, Eski İngilizce `ang`, Yidiş `yi`, Antik Yunanca `grc`, Gotça `got` gibi antik diller dahil) işleyen otonom ETL boru hattı (`scripts/wiktionary_pipeline/`) oluşturuldu; XML bz2 akışı -> leksikal tanım/etimoloji temizleyici -> Zstandard Parquet -> Google Drive v3 yükleme ve MD5 doğrulaması -> anında yerel silme döngüsü kuruldu; yerel diskte sıfır artık (zero disk residue) garanti edildi; REST rotası (`POST /api/v1/wiktionary`), MCP aracı (`query_wiktionary`, toplam 57 araç), birim/entegrasyon testleri ve teknik wiki (`docs/actors/wiktionary.md`) eksiksiz tamamlandı; `trash/` bağımlılığı tamamen kaldırılarak kök `.venv` ortamına taşındı.

- [x] **Wikisource Aktörü ve 85 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (wikisource)** — `Tier: 2` — Wikimedia kardeş projesi Wikisource için 46. aktör (`WikisourceActor`) hayata geçirildi; 85 dünya dilini (Latince `la`, Sanskritçe `sa`, Eski İngilizce `ang`, Çok Dilli / Antik Yunanca `sourceswiki`, Yidiş `yi` gibi antik/klasik diller dahil) işleyen otonom ETL boru hattı (`scripts/wikisource_pipeline/`) oluşturuldu; XML bz2 akışı -> wikitext/şiir temizleyici -> Zstandard Parquet -> Google Drive v3 yükleme ve MD5 doğrulaması -> anında yerel silme döngüsü kuruldu; yerel diskte sıfır artık (zero disk residue) garanti edildi; REST rotası (`POST /api/v1/wikisource`), MCP aracı (`query_wikisource`, toplam 56 araç), birim/entegrasyon testleri ve teknik wiki (`docs/actors/wikisource.md`) eksiksiz tamamlandı.

- [x] **Çok Dilli Wikipedia Dump ETL ve Google Drive Senkronizasyonu** — `Tier: 2` — Eksik olan tüm 40 dünya dili (`te`, `mk`, `hi`, `th`, `ta`, `bn`, `sl`, `ka`, `lt`, `gl`, `hr`, `sk`, `et`, `cy`, `bg`, `da`, `hy`, `eo`, `he`, `ms`, `eu`, `ro`, `hu`, `cs`, `fi`, `no`, `ur`, `sr`, `ko`, `id`, `ca`, `pt`, `vi`, `uk`, `ja`, `zh`, `pl`, `nl`, `sv`, `de`) XML bz2 dump'ları üzerinden kesintisiz işlendi; yarım kalan `de` (Almanca, 3.045.847 madde) ve `te` (Telugu, 125.217 madde) dahil tüm diller zstd Parquet parçalarına dönüştürülüp doğrudan Google Drive kök klasörüne (`1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL`) aktarıldı; Google Drive API üzerinden `md5Checksum` kriptografik sağlama doğrulaması yapıldı; geçici dump'lar ve yerel parçalar anında silinerek disk alanı korundu (233 GB boş alan); Google Drive üzerindeki toplam tamamlanmış dil sayısı 63'e ulaştı; 6 aşamalı doğrulama hattı başarıyla geçti.



- [x] **YouTube Transkript ve Altyazı Aktörü (youtube-transcripts)** — `Tier: 2` — Karamelo Apify aktörü mimarisinde, çift motorlu fallback (Hızlı HTTP Innertube + Playwright Chromium), LLM veri kümesi için işitsel gürültü temizleme filtresi (`[Music]`, `[Applause]`, `[Laughter]` vb. ayıklama), çoklu çıktı formatı (`captions`, `textWithTimestamps`, `singleStringText`, `xml`), SSRF koruması, Google Drive Zstd Parquet boru hattı (`examples/pipelines/youtube-transcripts-drive.yaml`), REST rotaları (`POST /api/v1/youtube-transcripts`), MCP aracı (`query_youtube_transcripts`), OpenAPI 3.1.0 ve birim/entegrasyon testleri eksiksiz tamamlandı (Toplam 45 aktör, 55 MCP aracı); 6 aşamalı verify ve testler başarıyla geçti.

- [x] **Formel Mantık, Teorem Kanıtlama ve Rasyonalite Aktörleri (Faz 4: ProofWiki, Lean Mathlib, LessWrong)** — `Tier: 2` — `proofwiki`, `lean-mathlib`, `lesswrong` aktörleri; tip sözleşmeleri (`src/api/types.ts`), manifestoları (`src/actors/actor-manifests.ts`), REST rotaları (`POST /api/v1/proofwiki`, `/lean-mathlib`, `/lesswrong`), MCP araçları (`query_proofwiki`, `query_lean_mathlib`, `query_lesswrong`), teknik wikileri (`docs/actors/*.md`), örnek boru hatları (`examples/pipelines/*.yaml`) ve birim testleri eksiksiz tamamlandı; 638/638 test, 6 aşamalı verify ve Biome format kontrolleri başarıyla geçti (Toplam 44 aktör, 54 MCP aracı).

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
