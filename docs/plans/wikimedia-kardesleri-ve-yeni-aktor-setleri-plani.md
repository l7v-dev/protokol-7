# Wikimedia Kardeş Projeleri ve Yeni Korpus Aktör Setleri Planı

## 1. Yönetici Özeti (Executive Summary)

Bu plan, **protokol-7** mimarisi altında geriye kalan tüm Wikimedia kardeş projelerinin ve LLM ön-eğitim / muhakeme (reasoning) / bilgi grafiği için en yüksek değere sahip yeni aktör setlerinin uçtan uca tasarımını, teknik sözleşmelerini ve veri akışlarını tanımlar.

Mevcut durumda tamamlanan aktörler:
- **Wikipedia** (Aktör 29) — 63 dünya dili tamamlandı.
- **Wikisource** (Aktör 46) — 85 dünya dili (%100) tamamlandı.
- **Wiktionary** (Aktör 47) — 198 dünya dili (%100) tamamlandı.

Tüm yeni aktörler 8 aşamalı Aktör Sözleşmesi (`docs/actor-contract.md`), sıfır emoji kuralı, katı teknik isimlendirme ve **sıfır yerel disk artığı (zero disk residue)** prensibine tam sadık kalarak inşa edilecektir.

---

## 2. SET 1: Kalan Wikimedia Kardeş Projeleri Paketi (Zorunlu Tamamlama)

Wikimedia Vakfı'nın geriye kalan 7 kardeş projesini kapsar. Her biri için REST API, MCP Aracı ve otonom çok dilli dump ETL boru hattı (`scripts/<proje>_pipeline/`) kurulacaktır.

| # | Aktör Kodu | Türkçe Adı | Tahmini Dil Sayısı | LLM Eğitim Değeri ve Veri Tipi | Veri Kaynağı & Dump Yapısı |
|---|---|---|---|---|---|
| **48** | `wikiquote` | Vikisöz | ~90 dil | Tarihi, edebi, felsefi alıntılar, aforizmalar, atasözleri ve diyaloglar. LLM üslup, retorik ve alıntı kabiliyeti için kritik. | `*wikiquote-latest-pages-articles.xml.bz2` |
| **49** | `wikibooks` | Vikikitap | ~120 dil | Açık ders kitapları, teknik ve akademik kılavuzlar, "nasıl yapılır" rehberleri. LLM eğitsel ve adım adım anlatım yeteneği. | `*wikibooks-latest-pages-articles.xml.bz2` |
| **50** | `wikiversity`| Vikiversite | ~17 dil | Üniversite düzeyinde ders modülleri, araştırma projeleri, açık öğrenme kaynakları. Akademik muhakeme ve pedagojik veri. | `*wikiversity-latest-pages-articles.xml.bz2` |
| **51** | `wikivoyage` | Vikigezgin | ~30 dil | Ülkeler, şehirler, coğrafi rotalar, mutfak kültürü, lojistik ve seyahat ansiklopedisi. Coğrafi ve kültürel dünya bilgisi. | `*wikivoyage-latest-pages-articles.xml.bz2` |
| **52** | `wikinews`   | Vikihaber | ~35 dil | Orijinal gazetecilik haberleri, tarihsel haber bültenleri, olay kronolojileri. Olay dizilimleri ve gazetecilik anlatımı. | `*wikinews-latest-pages-articles.xml.bz2` |
| **53** | `wikispecies`| Vikitür | 1 global db | Tüm canlıların taksonomik sınıflandırması, kladlar, sinonimler, biyolojik hiyerarşi. Biyoloji ve zooloji ontolojisi. | `specieswiki-latest-pages-articles.xml.bz2` |
| **54** | `wikidata`   | Vikiveri | 1 global db | Milyarlarca gerçek bilgi ilişkisi, Q-ID varlıkları, P-ID özellikleri. Bilgi grafiği (Knowledge Graph) ve olgu denetimi (Fact-checking). | `wikidatawiki-latest-all.json.bz2` veya entity dump |

---

## 3. SET 2: Felsefe, Mantık & Derin Muhakeme Paketi (Deep Reasoning)

LLM'lerin zincirleme düşünme (Chain-of-Thought), epistemoloji, biçimsel mantık ve felsefi argümantasyon gücünü en üst düzeye çıkaran kaynaklar:

| # | Aktör Kodu | Kaynak Adı | Alanı | LLM Değeri |
|---|---|---|---|---|
| **55** | `stanford-phil` | Stanford Encyclopedia of Philosophy (SEP) | Felsefe & Mantık | Dünyanın en saygın hakemli felsefe ve mantık ansiklopedisi. Derin kavramsal argümanlar, etik ve epistemoloji. |
| **56** | `internet-phil` | Internet Encyclopedia of Philosophy (IEP) | Felsefe & Bilim | Akademik felsefe rehberleri, ontoloji, zihin felsefesi ve mantıksal çıkarsama metinleri. |
| **57** | `metamath` | Metamath Proof Explorer | Biçimsel Mantık | ProofWiki ve Lean Mathlib'i tamamlayan, 40.000+ biçimsel teorem ve ZFC küme kuramı ispatı içeren sembolik veri kümesi. |
| **58** | `philpapers` | PhilPapers Archive | Felsefi Makaleler | 2.5 milyondan fazla felsefe makalesi, mantık tezleri ve tartışma kayıtları. |

---

## 4. SET 3: Açık Üniversite & STEM Ders Kitapları Paketi (Open Textbooks)

OpenStax ve MIT-OCW aktörlerimizi tamamlayan, üniversite düzeyinde temiz, telifsiz ve formüllü ders kitabı kütüphaneleri:

| # | Aktör Kodu | Kaynak Adı | Alanı | LLM Değeri |
|---|---|---|---|---|
| **59** | `libretexts` | LibreTexts Global | STEM & Mühendislik | Fizik, kimya, biyoloji, ileri matematik, mühendislik ve tıp alanında binlerce açık üniversite ders kitabı ve alıştırma problemi. |
| **60** | `open-textbook` | Open Textbook Library (UMN) | Üniversite Müfredatı | Minnesota Üniversitesi öncülüğünde 1.400'den fazla hakemli, akredite üniversite ders kitabı. |
| **61** | `semantic-scholar` | Semantic Scholar Graph API | Bilimsel Literatür | 200 milyondan fazla makalenin yapılandırılmış abstract, atıf bağıntıları, TLDR özetleri ve metodoloji bölümleri. |

---

## 5. SET 4: Türk Hukuku & Küresel Patent Mühendisliği Paketi (Legal & Patent)

Resmî Gazete ve Yargıtay aktörlerimize ek olarak hukuki muhakeme ve mühendislik buluş metinlerini kapsayan paket:

| # | Aktör Kodu | Kaynak Adı | Alanı | LLM Değeri |
|---|---|---|---|---|
| **62** | `anayasa-mahkemesi` | T.C. Anayasa Mahkemesi (AYM) | Anayasa Hukuku | Norm denetimi kararları, bireysel başvuru gerekçeli hükümleri ve temel hak içtihatları. |
| **63** | `danistay` | T.C. Danıştay Başkanlığı | İdare & Vergi Hukuku | İdari işlemler, vergi uyuşmazlıkları ve kamu hukuku emsal kararları. |
| **64** | `google-patents` | Google Patents / USPTO Public Data | Buluş & Mühendislik | Milyonlarca patentin teknik iddiaları (claims), buluş özeti ve teknik mekanizma tarifleri. Teknik problem çözme veri kümesi. |

---

## 6. SET 5: Çok Dilli Kodlama & Mühendislik Bilgi Tabanı Paketi (Developer Knowledge)

| # | Aktör Kodu | Kaynak Adı | Alanı | LLM Değeri |
|---|---|---|---|---|
| **65** | `devdocs` | DevDocs Comprehensive | API & Dokümantasyon | Python, Rust, Go, TypeScript, C++, Linux, Docker vb. 100+ teknolojinin güncel, reklamsız resmi API dokümantasyonu. |
| **66** | `rosetta-code` | Rosetta Code | Çok Dilli Algoritmalar | 1.000'den fazla algoritmanın 800+ farklı programlama dilindeki eşzamanlı uygulamaları (Cross-language kod çevirisi ve CoT için benzersiz). |
| **67** | `papers-with-code` | Papers With Code | Yapay Zeka & Benchmark | SOTA modeller, kıyaslama veri setleri, görev tanımları ve resmi ambar kodları. |

---

## 7. SET 6: Klasik Filoloji, Antik Metinler & Dünya Mirası Paketi (Classical Heritage)

Wikisource antik dillerini derinleştiren klasik filoloji kaynakları:

| # | Aktör Kodu | Kaynak Adı | Alanı | LLM Değeri |
|---|---|---|---|---|
| **68** | `perseus-dl` | Tufts Perseus Digital Library | Antik Diller & Filoloji | Antik Yunanca, Klasik Latince, Eski İbranice ve Arapça metinlerin morfolojik analizleri ve çift dilli edisyonları. |
| **69** | `sacred-texts` | Internet Sacred Text Archive | Karşılaştırmalı Din & Mitoloji | Karşılaştırmalı mitoloji, felsefe, teoloji ve dünya folkloru arşivi (1.700+ tam metin kitap). |

---

## 8. Uygulama ve İlerleme Sıralaması Önerisi

Yeni oturum açıldığında izlenebilecek operasyonel yol haritası:

1. **Öncelik 1: Set 1 (Wikimedia Kardeşleri Tamamlama):**
   - Sırasıyla: `wikiquote` -> `wikibooks` -> `wikivoyage` -> `wikiversity` -> `wikinews` -> `wikispecies` -> `wikidata`.
   - Her kardeş için dump boru hattı, REST API, MCP aracı, testler ve Google Drive senkronizasyonu.
2. **Öncelik 2: Set 2 & Set 5 (Felsefe/Mantık ve Geliştirici Bilgi Tabanı):**
   - `stanford-phil` (SEP) + `rosetta-code` + `devdocs` ile muhakeme ve kodlama yeteneğinin tahkim edilmesi.
3. **Öncelik 3: Set 3 & Set 4 (STEM Kitapları ve Hukuk Tamamlama):**
   - `libretexts` + `anayasa-mahkemesi` + `google-patents`.
