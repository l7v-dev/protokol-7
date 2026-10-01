# Protokol-7 Aktörler Rehberi (Actor Catalog)

Bu rehber, **protokol-7** bünyesindeki 70 veri çıkarma aktörünün ne işe yaradığını, nasıl çalıştığını ve nasıl çağrılacağını en sade biçimde açıklar.

Tüm aktörler iki ana kanal üzerinden tetiklenebilir:
1. **HTTP REST API:** `http://localhost:4000/api/v1/<aktor-adi>` (veya `/api/v1/actors`)
2. **Model Context Protocol (MCP):** AI ajanları için JSON-RPC 2.0 veya SSE araçları (`tools/call`)

---

## 1. Hızlı Referans Tablosu

| # | Aktör Adı | Kategori | REST Endpoint | MCP Tool Adı | Ne İşe Yarar? (En Sade Anlatım) |
|---|---|---|---|---|---|
| 1 | `cheerio-scraper` | Web & Tarama | `POST /api/v1/scrape` | `scrape_static_html` | Hızlıca bir web sayfasını indirir ve içindeki yazıları toplar. |
| 2 | `playwright-browser` | Web & Tarama | `POST /api/v1/scrape` | `scrape_dynamic_page` | Gerçek bir Chrome tarayıcı açarak JavaScript ile yüklenen sayfaları okur. |
| 3 | `crawler` | Web & Tarama | `POST /api/v1/crawl` | `crawl_website` | Bir sitedeki tüm linkleri adım adım gezerek sitenin haritasını çıkarır. |
| 4 | `sitemap-xml` | Web & Tarama | `POST /api/v1/sitemap` | `parse_sitemap_xml` | Sitenin `sitemap.xml` dosyasını okuyup tüm sayfa adreslerini listeler. |
| 5 | `markdown-reader` | Web & Tarama | `POST /api/v1/reader` | `read_page_markdown` | Web sayfasındaki reklamları ve menüleri atıp sadece ana makaleyi Markdown yapar. |
| 6 | `network-interceptor` | Web & Tarama | `POST /api/v1/network/intercept` | `intercept_api_responses` | Tarayıcının arkasında dönen gizli API ve JSON veri akışlarını yakalar. |
| 7 | `serp-search` | Web & Tarama | `POST /api/v1/search` | `search_engine_results` | Arama motoruna soru sorup çıkan ilk sayfa linklerini ve özetlerini getirir. |
| 8 | `api-extractor` | Web & Tarama | `POST /api/v1/api-extractor` | `extract_rest_api` | Sayfalanmış (sayfa 1, sayfa 2...) JSON API verilerini otomatik toplar. |
| 9 | `arxiv` | Bilim & Akademi | `POST /api/v1/arxiv` | `query_arxiv` | Fizik, matematik ve yapay zeka ön-baskı makalelerini ve özetlerini çeker. |
| 10 | `europe-pmc` | Bilim & Akademi | `POST /api/v1/europe-pmc` | `query_europe_pmc` | Biyoloji ve tıp alanındaki milyonlarca bilimsel makaleyi arar ve getirir. |
| 11 | `openalex` | Bilim & Akademi | `POST /api/v1/openalex` | `query_openalex` | Dünyadaki tüm üniversite ve yazarların bilimsel makale ve atıf ağını çeker. |
| 12 | `dergipark` | Bilim & Akademi | `POST /api/v1/dergipark` | `query_dergipark` | Türkiye'deki hakemli akademik dergilerin makale ve PDF linklerini toplar. |
| 13 | `openstax` | Bilim & Akademi | `POST /api/v1/openstax` | `query_openstax` | Açık lisanslı üniversite ders kitaplarını bölüm bölüm temiz metin olarak çeker. |
| 14 | `mit-ocw` | Bilim & Akademi | `POST /api/v1/mit-ocw` | `query_mit_ocw` | MIT üniversitesinin açık ders notlarını, ders planlarını ve kaynaklarını getirir. |
| 15 | `sec-edgar` | Kamu & Hukuk | `POST /api/v1/sec-edgar` | `query_sec_edgar` | ABD borsasındaki şirketlerin yıllık ve çeyreklik resmi finans raporlarını çeker. |
| 16 | `court-listener` | Kamu & Hukuk | `POST /api/v1/court-listener` | `query_court_listener` | Amerikan mahkeme kararlarını ve emsal hukuki dava metinlerini arar. |
| 17 | `eur-lex` | Kamu & Hukuk | `POST /api/v1/eur-lex` | `query_eur_lex` | Avrupa Birliği kanunlarını, direktiflerini ve mahkeme kararlarını getirir. |
| 18 | `open-fda` | Kamu & Hukuk | `POST /api/v1/open-fda` | `query_open_fda` | İlaç etiketlerini, yan etkilerini ve tıbbi cihaz onaylarını resmi devletten çeker. |
| 19 | `clinical-trials` | Kamu & Hukuk | `POST /api/v1/clinical-trials` | `query_clinical_trials` | Dünyadaki tıp ve ilaç deneme testlerinin protokollerini ve sonuçlarını listeler. |
| 20 | `gutenberg` | Kitap & Kültür | `POST /api/v1/gutenberg` | `query_gutenberg` | Telif hakkı bitmiş binlerce dünya klasiği kitabı temiz metin olarak indirir. |
| 21 | `internet-archive` | Kitap & Kültür | `POST /api/v1/internet-archive` | `query_internet_archive` | Dünyanın en büyük dijital kütüphanesinden taranmış kitap ve metinleri çeker. |
| 22 | `ktb-ekitap` | Kitap & Kültür | `POST /api/v1/ktb-ekitap` | `query_ktb_ekitap` | Kültür Bakanlığı'nın e-kitap portalındaki tarihi ve edebi eserleri toplar. |
| 23 | `saglik-ekutuphane` | Kitap & Kültür | `POST /api/v1/saglik-ekutuphane` | `query_saglik_ekutuphane` | Sağlık Bakanlığı'nın tıp, aşı ve halk sağlığı rehberlerini ve kitaplarını çeker. |
| 24 | `epub-extractor` | Kitap & Kültür | `POST /api/v1/epub` | `extract_epub` | EPUB uzantılı dijital kitapları içindekiler tablosuyla Markdown metnine çevirir. |
| 25 | `software-heritage`| Kod & Standartlar | `POST /api/v1/software-heritage` | `query_software_heritage` | Dünya açık kaynak yazılım arşivinden kod dosyalarını ve dizinleri çeker. |
| 26 | `stack-exchange` | Kod & Standartlar | `POST /api/v1/stack-exchange` | `query_stack_exchange` | Yazılımcıların StackOverflow soru ve kabul edilmiş cevaplarını LLM çifti yapar. |
| 27 | `ietf-rfc` | Kod & Standartlar | `POST /api/v1/ietf-rfc` | `query_ietf_rfc` | İnternetin resmi teknik kurallarını (TCP/IP, HTTP) temiz metin olarak getirir. |
| 28 | `wikimedia` | Kod & Standartlar | `POST /api/v1/wikimedia` | `query_wikimedia` | Vikipedi maddelerini özet veya tam Markdown metni olarak anında getirir. |
| 29 | `wikipedia` | Kod & Standartlar | `POST /api/v1/wikipedia` | `query_wikipedia` | Yapılandırılmış Wikipedia maddelerini, bölümlerini, bilgi kutularını ve düz metnini çeker. |
| 30 | `pdf-document` | Belge & Arşiv | `POST /api/v1/pdf` | `extract_pdf` | PDF dosyalarındaki yazıları 2-3 sütunlu olsa bile doğru sırada okur ve çıkarır. |
| 31 | `document-extractor` | Belge & Arşiv | `POST /api/v1/documents` | `extract_document` | Word (.docx), Excel (.xlsx) ve CSV dosyalarını yapılandırılmış Markdown yapar. |
| 32 | `archive-extractor` | Belge & Arşiv | `POST /api/v1/archives` | `extract_archive` | ZIP ve TAR arşivlerini güvenlik kontrolleriyle (Zip-Slip koruması) açar. |
| 33 | `resmi-gazete` | Kamu & Hukuk | `POST /api/v1/resmi-gazete` | `query_resmi_gazete` | T.C. Resmî Gazete bültenlerini, kanun, kararname ve yönetmelikleri çeker. |
| 34 | `yargitay` | Kamu & Hukuk | `POST /api/v1/yargitay` | `query_yargitay` | Yargıtay ve Danıştay emsal içtihat kararlarını ve gerekçelerini çeker. |
| 35 | `kap` | Kamu & Hukuk | `POST /api/v1/kap` | `query_kap` | BIST şirketlerinin KAP bildirimlerini ve finansal raporlarını çeker. |
| 36 | `github` | Kod & Standartlar | `POST /api/v1/github` | `query_github` | GitHub ambarlarını, README, issues, PR ve kod ağaçlarını toplar. |
| 37 | `openreview` | Bilim & Akademi | `POST /api/v1/openreview` | `query_openreview` | OpenReview konferans makalelerini, hakem yorumlarını ve yazar yanıtlarını çeker. |
| 38 | `hacker-news` | Kod & Standartlar | `POST /api/v1/hacker-news` | `query_hacker_news` | Hacker News mühendislik tartışmalarını, mimari incelemelerini ve yorum ağaçlarını çeker. |
| 39 | `huggingface-datasets` | Yapay Zeka & Korpus | `POST /api/v1/huggingface-datasets` | `query_huggingface_datasets` | Hugging Face veri setlerini (CoT, muhakeme, kodlama) satır satır akıtarak çeker. |
| 40 | `math-reasoning` | Yapay Zeka & Korpus | `POST /api/v1/math-reasoning` | `query_math_reasoning` | Matematik ve muhakeme (GSM8K, MATH, SVAMP) sorularını, CoT adımlarını ve cevaplarını çeker. |
| 41 | `code-eval` | Yapay Zeka & Korpus | `POST /api/v1/code-eval` | `query_code_eval` | Kodlama değerlendirme (HumanEval, MBPP, SWE-bench) problemlerini, çözümlerini ve testlerini çeker. |
| 42 | `proofwiki` | Yapay Zeka & Korpus | `POST /api/v1/proofwiki` | `query_proofwiki` | ProofWiki teorem ifadelerini, çok adımlı biçimsel ispatlarını ve LaTeX matematik formüllerini çeker. |
| 43 | `lean-mathlib` | Yapay Zeka & Korpus | `POST /api/v1/lean-mathlib` | `query_lean_mathlib` | Lean 4 ve Mathlib4 biçimsel teorem tanımlarını, lemmaları ve ispat taktik adımlarını çeker. |
| 44 | `lesswrong` | Yapay Zeka & Korpus | `POST /api/v1/lesswrong` | `query_lesswrong` | LessWrong ve Alignment Forum rasyonalite, yapay zeka güvenliği ve epistemik muhakeme makaleleri ile yorum ağaçlarını çeker. |
| 45 | `youtube-transcripts` | Yapay Zeka & Korpus | `POST /api/v1/youtube-transcripts` | `query_youtube_transcripts` | YouTube video altyazılarını ve transkriptlerini çeker, zaman damgalarını ve akustik gürültüleri temizler. |
| 46 | `wikisource` | Kitap & Kültür | `POST /api/v1/wikisource` | `query_wikisource` | 85 dildeki Wikisource tarihi, edebi ve antik metinleri şiir ve dize formatını koruyarak Markdown olarak çeker. |
| 47 | `wiktionary` | Kitap & Kültür | `POST /api/v1/wiktionary` | `query_wiktionary` | 198 dildeki Wiktionary leksikal tanımları, etimoloji, sözcük türleri ve çevirileri yapılandırılmış Markdown olarak çeker. |
| 48 | `wikiquote` | Kitap & Kültür | `POST /api/v1/wikiquote` | `query_wikiquote` | 90+ dildeki tarihi, edebi, felsefi alıntıları ve aforizmaları çeker. |
| 49 | `wikibooks` | Kitap & Kültür | `POST /api/v1/wikibooks` | `query_wikibooks` | Açık ders kitaplarını, teknik ve akademik kılavuzları Markdown olarak çeker. |
| 50 | `wikiversity` | Bilim & Akademi | `POST /api/v1/wikiversity` | `query_wikiversity` | Üniversite düzeyinde ders modülleri ve açık pedagojik öğrenme kaynaklarını çeker. |
| 51 | `wikivoyage` | Kültür & Coğrafya | `POST /api/v1/wikivoyage` | `query_wikivoyage` | Coğrafi rotaları, şehir rehberlerini ve seyahat ansiklopedisini çeker. |
| 52 | `wikinews` | Haber & Medya | `POST /api/v1/wikinews` | `query_wikinews` | Gazetecilik haberlerini, olay kronolojilerini ve bültenleri çeker. |
| 53 | `wikispecies` | Biyoloji & Taksonomi | `POST /api/v1/wikispecies` | `query_wikispecies` | Canlıların taksonomik sınıflandırmasını ve biyolojik hiyerarşisini çeker. |
| 54 | `wikidata` | Bilgi Grafiği | `POST /api/v1/wikidata` | `query_wikidata` | Q-ID varlıklarını, iddiaları (claims) ve ontoloji ilişkilerini çeker. |
| 55 | `stanford-phil` | Felsefe & Mantık | `POST /api/v1/stanford-phil` | `query_stanford_phil` | Stanford Felsefe Ansiklopedisi maddelerini, argümanları ve kaynakçaları çeker. |
| 56 | `internet-phil` | Felsefe & Mantık | `POST /api/v1/internet-phil` | `query_internet_phil` | Internet Felsefe Ansiklopedisi rehberlerini, ontoloji ve mantık metinlerini çeker. |
| 57 | `metamath` | Biçimsel Mantık | `POST /api/v1/metamath` | `query_metamath` | Metamath biçimsel teorem ve aksiyomlarını, hipotezleri ve ispat tablolarını çeker. |
| 58 | `philpapers` | Felsefe & Mantık | `POST /api/v1/philpapers` | `query_philpapers` | 2.5M+ felsefe makale kaydını, özetlerini, atıfları ve taksonomileri çeker. |
| 59 | `devdocs` | Kod & Standartlar | `POST /api/v1/devdocs` | `query_devdocs` | 100+ teknolojinin resmi API dokümantasyonunu ve arama dizinlerini çeker. |
| 60 | `rosetta-code` | Kod & Standartlar | `POST /api/v1/rosetta-code` | `query_rosetta_code` | 800+ dildeki çok dilli algoritma çözümlerini ve kod karşılaştırmalarını çeker. |
| 61 | `papers-with-code` | Yapay Zeka & Korpus | `POST /api/v1/papers-with-code` | `query_papers_with_code` | Makine öğrenimi makalelerini, resmi GitHub kod ambarlarını ve kıyaslamaları çeker. |
| 62 | `libretexts` | STEM & Ders Kitapları | `POST /api/v1/libretexts` | `query_libretexts` | Açık üniversite STEM ve mühendislik ders kitaplarını, içindekiler tablosunu ve formülleri çeker. |
| 63 | `open-textbook` | STEM & Ders Kitapları | `POST /api/v1/open-textbook` | `query_open_textbook` | Hakemli açık ders kitaplarını, indirme linklerini ve akademik değerlendirmeleri çeker. |
| 64 | `semantic-scholar` | Bilim & Akademi | `POST /api/v1/semantic-scholar` | `query_semantic_scholar` | 200M+ akademik makale grafiğini, yapay zeka TLDR özetlerini ve atıf ağını çeker. |
| 65 | `anayasa-mahkemesi` | Hukuk & Emsal Karar | `POST /api/v1/anayasa-mahkemesi` | `query_anayasa_mahkemesi` | T.C. Anayasa Mahkemesi norm denetimi kararlarını, bireysel başvuru hak ihlali hükümlerini ve karşı oyları çeker. |
| 66 | `danistay` | Hukuk & Emsal Karar | `POST /api/v1/danistay` | `query_danistay` | T.C. Danıştay Başkanlığı idari ve vergi dava daireleri emsal kararlarını ve gerekçeli hükümleri çeker. |
| 67 | `google-patents` | Buluş & Patent | `POST /api/v1/google-patents` | `query_google_patents` | Dünya patent teknik iddialarını (claims), tarifnameleri, CPC kodlarını ve önceki teknik atıflarını çeker. |
| 68 | `perseus-dl` | Klasik Filoloji & Antik Metinler | `POST /api/v1/perseus-dl` | `query_perseus_dl` | Tufts Perseus Antik Yunanca, Latince metinlerini, paralel çevirileri, morfolojik analizleri ve CTS-URN pasajlarını çeker. |
| 69 | `sacred-texts` | Karşılaştırmalı Din & Mitoloji | `POST /api/v1/sacred-texts` | `query_sacred_texts` | Internet Sacred Text Archive üzerinden 1.700+ tam metin kutsal kitap, mitoloji, simya ve folklor eserini çeker. |
| 70 | `instagram` | Sosyal Medya & Multimodal | `POST /api/v1/instagram` | `query_instagram` | Kamuya açık Instagram profillerini, gönderi/reel detaylarını ve etiket akışlarını çeker. |

---

## 2. Kategori Bazlı Detaylı Kullanım ve Örnekler

---

### Kategori 1: Genel Web & Tarama Aktörleri

#### 1. Cheerio Scraper (`cheerio-scraper`)
* **Ne Yapar?** Bir internet sayfasını saniyeler içinde indirir ve içindeki yazıları, başlıkları ve linkleri çıkarır.
* **REST:** `POST /api/v1/scrape`
```json
{
  "targetUrl": "https://example.com",
  "renderJavaScript": false
}
```
* **Yanıt:**
```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "content": "# Example Domain\n\nThis domain is for use in illustrative examples...",
  "links": ["https://www.iana.org/domains/example"]
}
```

#### 2. Playwright Browser (`playwright-browser`)
* **Ne Yapar?** JavaScript kullanan, butonlara basılarak açılan veya dinamik yüklenen siteleri gerçek bir Chromium tarayıcı ile açıp okur.
* **REST:** `POST /api/v1/scrape`
```json
{
  "targetUrl": "https://news.ycombinator.com",
  "renderJavaScript": true,
  "waitForSelector": ".athing"
}
```

#### 3. Deep Crawler (`crawler`)
* **Ne Yapar?** Verilen bir adresten başlayarak sitenin içindeki diğer sayfalara tıklar, derinlemesine tüm siteyi dolaşır.
* **REST:** `POST /api/v1/crawl`
```json
{
  "targetUrl": "https://example.com",
  "maxDepth": 2,
  "maxPages": 10
}
```

---

### Kategori 2: Akademik ve Bilimsel Araştırma Aktörleri

#### 4. arXiv Aktörü (`arxiv`)
* **Ne Yapar?** arXiv üzerindeki bilimsel makaleleri arar; başlık, yazar, özet ve istenirse tam PDF metnini getirir.
* **REST:** `POST /api/v1/arxiv`
* **MCP:** `query_arxiv`
```json
{
  "searchQuery": "quantum computing",
  "maxResults": 5,
  "downloadPdf": false
}
```
* **Yanıt:**
```json
{
  "totalResults": 5,
  "papers": [
    {
      "id": "2301.00001",
      "title": "Quantum Error Mitigation",
      "summary": "We present a comprehensive framework...",
      "authors": ["John Doe", "Jane Smith"],
      "published": "2023-01-01T00:00:00Z"
    }
  ]
}
```

#### 5. Europe PMC Aktörü (`europe-pmc`)
* **Ne Yapar?** Tıp, genetik ve biyoloji alanındaki makaleleri Europe PMC veri tabanından arar.
* **REST:** `POST /api/v1/europe-pmc`
* **MCP:** `query_europe_pmc`
```json
{
  "query": "CRISPR Cas9",
  "pageSize": 5,
  "openAccessOnly": true
}
```

#### 6. OpenAlex Aktörü (`openalex`)
* **Ne Yapar?** Bilimsel araştırmaları ve akademik yayınları OpenAlex API'sinden arar, ters dizinlenmiş özetleri metne dönüştürür.
* **REST:** `POST /api/v1/openalex`
* **MCP:** `query_openalex`
```json
{
  "search": "artificial intelligence safety",
  "perPage": 5
}
```

#### 7. DergiPark Aktörü (`dergipark`)
* **Ne Yapar?** Türkiye'deki hakemli akademik dergileri OAI-PMH protokolü üzerinden tarar, makale ve PDF linklerini listeler.
* **REST:** `POST /api/v1/dergipark`
* **MCP:** `query_dergipark`
```json
{
  "keyword": "yapay zeka",
  "maxRecords": 10
}
```

#### 8. OpenStax Aktörü (`openstax`)
* **Ne Yapar?** Üniversite ve lise seviyesindeki açık lisanslı ders kitaplarını ve bölümlerini çeker.
* **REST:** `POST /api/v1/openstax`
* **MCP:** `query_openstax`
```json
{
  "subject": "Math",
  "maxBooks": 5
}
```

#### 9. MIT OpenCourseWare Aktörü (`mit-ocw`)
* **Ne Yapar?** MIT üniversitesinin açık ders malzemelerini ve müfredat kaynaklarını çeker.
* **REST:** `POST /api/v1/mit-ocw`
* **MCP:** `query_mit_ocw`
```json
{
  "query": "Algorithms",
  "maxCourses": 5
}
```

#### 9b. OpenReview Aktörü (`openreview`)
* **Ne Yapar?** ICLR, NeurIPS ve ICML gibi konferanslardaki makaleleri, hakem puanlarını, değerlendirmeleri ve yazar yanıtlarını diyalektik biçimde çeker.
* **REST:** `POST /api/v1/openreview`
* **MCP:** `query_openreview`
```json
{
  "action": "forum",
  "forumId": "ICLR_2024_sample_id"
}
```

---

### Kategori 3: Kamu, Hukuk ve Regülasyon Aktörleri

#### 10. SEC EDGAR Aktörü (`sec-edgar`)
* **Ne Yapar?** Amerikan Sermaye Piyasası Kurulu'ndaki (SEC) şirketlerin yıllık (10-K) ve çeyreklik (10-Q) raporlarını çeker.
* **REST:** `POST /api/v1/sec-edgar`
* **MCP:** `query_sec_edgar`
```json
{
  "ticker": "AAPL",
  "formType": "10-K",
  "maxFilings": 2
}
```

#### 11. CourtListener Aktörü (`court-listener`)
* **Ne Yapar?** ABD mahkeme kararlarını, yargıç görüşlerini ve hukuki emsal metinleri arar.
* **REST:** `POST /api/v1/court-listener`
* **MCP:** `query_court_listener`
```json
{
  "query": "copyright fair use",
  "maxOpinions": 5
}
```

#### 12. EUR-Lex Aktörü (`eur-lex`)
* **Ne Yapar?** Avrupa Birliği regülasyonlarını, direktiflerini ve Adalet Divanı kararlarını CELLAR üzerinden sorgular.
* **REST:** `POST /api/v1/eur-lex`
* **MCP:** `query_eur_lex`
```json
{
  "celex": "32016R0679"
}
```

#### 13. openFDA Aktörü (`open-fda`)
* **Ne Yapar?** Amerikan İlaç Dairesi'nin (FDA) onaylı ilaç etiketlerini ve tıbbi cihaz kayıtlarını çeker.
* **REST:** `POST /api/v1/open-fda`
* **MCP:** `query_open_fda`
```json
{
  "endpoint": "drug_label",
  "search": "openfda.brand_name:aspirin",
  "limit": 3
}
```

#### 14. ClinicalTrials Aktörü (`clinical-trials`)
* **Ne Yapar?** Dünyadaki klinik ilaç deneylerini, hasta kriterlerini ve test sonuçlarını sorgular.
* **REST:** `POST /api/v1/clinical-trials`
* **MCP:** `query_clinical_trials`
```json
{
  "condition": "diabetes",
  "pageSize": 5
}
```

#### 14.b. T.C. Resmî Gazete Aktörü (`resmi-gazete`)
* **Ne Yapar?** Cumhurbaşkanlığı Resmî Gazete günlük bültenlerini, kanunları, cumhurbaşkanlığı kararnamelerini ve yönetmelikleri çeker.
* **REST:** `POST /api/v1/resmi-gazete`
* **MCP:** `query_resmi_gazete`
```json
{
  "date": "2024-03-15",
  "category": "kanun",
  "limit": 5
}
```

#### 14.c. Yargıtay & Danıştay İçtihat Aktörü (`yargitay`)
* **Ne Yapar?** Yargıtay ve Danıştay emsal kararlarını, daire kararlarını ve gerekçeli metinleri çeker.
* **REST:** `POST /api/v1/yargitay`
* **MCP:** `query_yargitay`
```json
{
  "court": "yargitay",
  "chamber": "1. Hukuk Dairesi",
  "query": "tapu iptali ve tescil",
  "limit": 10
}
```

#### 14.d. Kamuoyu Aydınlatma Platformu Aktörü (`kap`)
* **Ne Yapar?** BIST şirketlerinin KAP özel durum açıklamalarını, finansal tablolarını ve kurumsal duyurularını çeker.
* **REST:** `POST /api/v1/kap`
* **MCP:** `query_kap`
```json
{
  "companyTicker": "THYAO",
  "disclosureType": "oda",
  "limit": 10
}
```

---

### Kategori 4: Kütüphane, Kitap ve Kültür Aktörleri

#### 15. Project Gutenberg Aktörü (`gutenberg`)
* **Ne Yapar?** Telifsiz dünya edebiyatı klasiklerini arar ve lisans yazılarından arındırılmış temiz metin olarak indirir.
* **REST:** `POST /api/v1/gutenberg`
* **MCP:** `query_gutenberg`
```json
{
  "search": "Dostoevsky",
  "language": "en",
  "maxBooks": 2
}
```

#### 16. Internet Archive Aktörü (`internet-archive`)
* **Ne Yapar?** archive.org koleksiyonlarındaki kamuya açık kitapların OCR metinlerini indirir.
* **REST:** `POST /api/v1/internet-archive`
* **MCP:** `query_internet_archive`
```json
{
  "query": "history of science",
  "maxItems": 3
}
```

#### 17. KTB e-Kitap Aktörü (`ktb-ekitap`)
* **Ne Yapar?** Kültür ve Turizm Bakanlığı e-kitap portalındaki eserleri ve katalog kayıtlarını toplar.
* **REST:** `POST /api/v1/ktb-ekitap`
* **MCP:** `query_ktb_ekitap`
```json
{
  "category": "Edebiyat",
  "maxPages": 2
}
```

#### 18. Sağlık e-Kütüphane Aktörü (`saglik-ekutuphane`)
* **Ne Yapar?** Sağlık Bakanlığı'nın halk sağlığı rehberlerini ve tıbbi yayınlarını çeker.
* **REST:** `POST /api/v1/saglik-ekutuphane`
* **MCP:** `query_saglik_ekutuphane`
```json
{
  "category": "kitaplar",
  "maxItems": 5
}
```

#### 19. EPUB Extractor Aktörü (`epub-extractor`)
* **Ne Yapar?** Bir `.epub` dosyasını açar, içindekiler tablosunu ve tüm bölümleri sırayla Markdown yapar.
* **REST:** `POST /api/v1/epub`
* **MCP:** `extract_epub`
```json
{
  "fileUrl": "https://example.com/sample.epub",
  "maxChapters": 20
}
```

---

### Kategori 5: Açık Kod ve Teknik Standart Aktörleri

#### 20. Software Heritage Aktörü (`software-heritage`)
* **Ne Yapar?** Dünya yazılım mirasındaki kalıcı kod parçalarını (SWHID) veya dizin ağaçlarını çeker.
* **REST:** `POST /api/v1/software-heritage`
* **MCP:** `query_software_heritage`
```json
{
  "swhid": "swh:1:cnt:94a9ed024d3859793618152ea559a168bbcbb5e2"
}
```

#### 21. Stack Exchange Aktörü (`stack-exchange`)
* **Ne Yapar?** StackOverflow veya diğer teknik ağlardaki yüksek puanlı soruları ve kabul edilmiş cevapları çeker.
* **REST:** `POST /api/v1/stack-exchange`
* **MCP:** `query_stack_exchange`
```json
{
  "query": "typescript async await",
  "site": "stackoverflow",
  "minScore": 5,
  "maxResults": 5
}
```

#### 22. IETF RFC Aktörü (`ietf-rfc`)
* **Ne Yapar?** İnternet standartlarını (HTTP, DNS, TLS vb.) temizlenmiş düz metin olarak getirir.
* **REST:** `POST /api/v1/ietf-rfc`
* **MCP:** `query_ietf_rfc`
```json
{
  "rfcNumber": 9110
}
```

#### 23. Wikimedia Aktörü (`wikimedia`)
* **Ne Yapar?** Vikipedi sayfalarını özet veya HTML'den temizlenmiş tam Markdown olarak çeker.
* **REST:** `POST /api/v1/wikimedia`
* **MCP:** `query_wikimedia`
```json
{
  "title": "Yapay zekâ",
  "language": "tr",
  "action": "article"
}
```

#### 24. Wikipedia Aktörü (`wikipedia`)
* **Ne Yapar?** Yapılandırılmış Wikipedia maddelerini, bölümlerini, bilgi kutularını ve düz metnini çeker.
* **REST:** `POST /api/v1/wikipedia`
* **MCP:** `query_wikipedia`
```json
{
  "title": "Alan Turing",
  "lang": "en",
  "action": "article"
}
```

#### 24b. GitHub Aktörü (`github`)
* **Ne Yapar?** GitHub açık kaynak ambarlarının metaverilerini, README belgelerini, issue ve PR tartışmalarını, sürümlerini ve dosya ağacını yapılandırılmış biçimde çeker.
* **REST:** `POST /api/v1/github`
* **MCP:** `query_github`
```json
{
  "owner": "torvalds",
  "repo": "linux",
  "action": "readme"
}
```

#### 24c. Hacker News Aktörü (`hacker-news`)
* **Ne Yapar?** Y Combinator Hacker News platformundaki mühendislik tartışmalarını, mimari incelemelerini ve iç içe geçmiş yorum ağaçlarını temiz GFM Markdown olarak ayıklar.
* **REST:** `POST /api/v1/hacker-news`
* **MCP:** `query_hacker_news`
```json
{
  "action": "story",
  "storyId": 38870197,
  "maxComments": 20
}
```

---

### Kategori 6: Belge, Ofis ve Arşiv Aktörleri

#### 25. PDF Document Aktörü (`pdf-document`)
* **Ne Yapar?** İki veya üç sütunlu zorlu PDF belgelerini okuma sırasına göre düzgün metne dönüştürür.
* **REST:** `POST /api/v1/pdf`
* **MCP:** `extract_pdf`
```json
{
  "targetUrl": "https://example.com/document.pdf",
  "maxPages": 10
}
```

#### 26. Document Extractor Aktörü (`document-extractor`)
* **Ne Yapar?** Word (`.docx`), Excel (`.xlsx`) ve CSV tablolarını okur ve Markdown tablolarına çevirir.
* **REST:** `POST /api/v1/documents`
* **MCP:** `extract_document`
```json
{
  "fileUrl": "https://example.com/data.xlsx",
  "format": "xlsx"
}
```

#### 27. Archive Extractor Aktörü (`archive-extractor`)
* **Ne Yapar?** ZIP ve TAR arşivlerini açar, içindeki dosyaları listeler ve çıkarır (Zip Bomb korumalıdır).
* **REST:** `POST /api/v1/archives`
* **MCP:** `extract_archive`
```json
{
  "fileUrl": "https://example.com/dataset.zip"
}
```

---

### Kategori 7: Yapay Zeka, Muhakeme ve Benchmark Aktörleri

#### 28. Hugging Face Datasets Aktörü (`huggingface-datasets`)
* **Ne Yapar?** Hugging Face hub üzerindeki açık veri setlerini (CoT, kodlama, talimat) yerel depolama ve RAM tüketmeden satır satır akıtarak çeker.
* **REST:** `POST /api/v1/huggingface-datasets`
* **MCP:** `query_huggingface_datasets`
```json
{
  "dataset": "tatsu-lab/alpaca",
  "split": "train",
  "limit": 20
}
```

#### 29. Mathematical Reasoning Aktörü (`math-reasoning`)
* **Ne Yapar?** GSM8K, MATH, SVAMP ve OlympiadBench gibi standart matematik kıyaslama kümelerinden soru, çok adımlı Chain-of-Thought (CoT) akıl yürütme ve nihai cevap çiftlerini çıkarır.
* **REST:** `POST /api/v1/math-reasoning`
* **MCP:** `query_math_reasoning`
```json
{
  "benchmark": "gsm8k",
  "limit": 10
}
```

#### 30. Code Evaluation Benchmark Aktörü (`code-eval`)
* **Ne Yapar?** HumanEval, MBPP ve SWE-bench gibi standart kodlama kıyaslama kümelerinden problem tanımı, fonksiyon giriş noktası, kanonik çözüm ve doğrulama birim testlerini çıkarır.
* **REST:** `POST /api/v1/code-eval`
* **MCP:** `query_code_eval`
```json
{
  "benchmark": "humaneval",
  "limit": 10
}
```

#### 31. ProofWiki Formal Proofs Aktörü (`proofwiki`)
* **Ne Yapar?** ProofWiki MediaWiki API üzerinden biçimsel matematiksel teorem ifadelerini, çok adımlı ispat zincirlerini, tanımları ve LaTeX matematik formüllerini ayıklar.
* **REST:** `POST /api/v1/proofwiki`
* **MCP:** `query_proofwiki`
```json
{
  "action": "theorem",
  "title": "Pythagorean Theorem",
  "limit": 10
}
```

#### 32. Lean 4 & Mathlib Aktörü (`lean-mathlib`)
* **Ne Yapar?** Lean 4 ve Mathlib4 ambarlarından bilgisayar tarafından doğrulanabilir teorem tanımlarını, lemmaları, tip imzalarını ve taktik adımlarını (`rw`, `simp`, `exact`, `apply`, `induction`) ayıklar.
* **REST:** `POST /api/v1/lean-mathlib`
* **MCP:** `query_lean_mathlib`
```json
{
  "action": "file",
  "repo": "leanprover-community/mathlib4",
  "path": "Mathlib/Data/Nat/Basic.lean",
  "limit": 20
}
```

#### 33. LessWrong & Alignment Forum Aktörü (`lesswrong`)
* **Ne Yapar?** LessWrong ve Alignment Forum GraphQL API üzerinden Bayesyen rasyonalite, karar teorisi, yapay zeka güvenliği/hizalama (AI alignment) ve epistemik muhakeme makalelerini, yazarları, oyları ve diyalektik yorum ağaçlarını ayıklar.
* **REST:** `POST /api/v1/lesswrong`
* **MCP:** `query_lesswrong`
```json
{
  "action": "posts",
  "view": "curated",
  "limit": 10
}
```

#### 34. YouTube Transcripts Aktörü (`youtube-transcripts`)
* **Ne Yapar?** YouTube video altyazılarını ve transkriptlerini çeker, zaman damgalarını ve akustik gürültüleri temizleyerek kesintisiz LLM eğitim metni üretir.
* **REST:** `POST /api/v1/youtube-transcripts`
* **MCP:** `query_youtube_transcripts`
```json
{
  "videoId": "dQw4w9WgXcQ",
  "language": "en",
  "cleanAcousticNoise": true
}
```

#### 35. Wikisource Aktörü (`wikisource`)
* **Ne Yapar?** 85 dildeki Wikisource tarihi, edebi ve antik metinleri şiir, dize ve bölüm yapısını koruyarak temiz Markdown formatında çeker.
* **REST:** `POST /api/v1/wikisource`
* **MCP:** `query_wikisource`
```json
{
  "lang": "la",
  "action": "page",
  "title": "De brevitate vitae",
  "extractMarkdown": true
}
```

#### 36. Wiktionary Aktörü (`wiktionary`)
* **Ne Yapar?** 198 dildeki Wiktionary kelime tanımlarını, etimolojik kökenleri, sözcük türlerini ve diller arası çevirileri çeker.
* **REST:** `POST /api/v1/wiktionary`
* **MCP:** `query_wiktionary`
```json
{
  "lang": "en",
  "action": "definition",
  "word": "algorithm",
  "extractMarkdown": true
}
```

#### 37. Stanford Encyclopedia of Philosophy Aktörü (`stanford-phil`)
* **Ne Yapar?** Stanford Encyclopedia of Philosophy (SEP) üzerindeki hakemli felsefe maddelerini, kavramsal argüman dizilimlerini, önsözleri, ana hatları ve kaynakçaları çeker.
* **REST:** `POST /api/v1/stanford-phil`
* **MCP:** `query_stanford_phil`
```json
{
  "slug": "goedel-incompleteness",
  "action": "entry",
  "includeBibliography": true
}
```

#### 38. Internet Encyclopedia of Philosophy Aktörü (`internet-phil`)
* **Ne Yapar?** Internet Encyclopedia of Philosophy (IEP) üzerindeki akademik felsefe rehberlerini, ontoloji, mantık ve epistemoloji makalelerini çeker.
* **REST:** `POST /api/v1/internet-phil`
* **MCP:** `query_internet_phil`
```json
{
  "slug": "goedel",
  "action": "entry"
}
```

#### 39. Metamath Proof Explorer Aktörü (`metamath`)
* **Ne Yapar?** Metamath Proof Explorer veritabanlarındaki (`set.mm`, `iset.mm`, `ql.mm`) 40.000'den fazla biçimsel matematik teorem ve aksiyomunu, hipotezleri ve adım adım doğrulama tablolarını çeker.
* **REST:** `POST /api/v1/metamath`
* **MCP:** `query_metamath`
```json
{
  "theorem": "mpc2",
  "database": "set.mm",
  "action": "theorem",
  "includeProofSteps": true
}
```

#### 40. PhilPapers Archive Aktörü (`philpapers`)
* **Ne Yapar?** 2.5 milyondan fazla akademik felsefe yayınını barındıran PhilPapers üzerindeki makale kayıtlarını, yazarları, özetleri, atıfları ve kategori taksonomilerini çeker.
* **REST:** `POST /api/v1/philpapers`
* **MCP:** `query_philpapers`
```json
{
  "id": "CHADCO",
  "action": "record"
}
```

#### 41. DevDocs Aktörü (`devdocs`)
* **Ne Yapar?** 100+ programlama dili ve kütüphanesinin (Rust, Python, Go, C++, JS vb.) resmi API dokümantasyonunu, arama dizinlerini ve kılavuz sayfalarını Markdown olarak çeker.
* **REST:** `POST /api/v1/devdocs`
* **MCP:** `query_devdocs`
```json
{
  "doc": "rust",
  "path": "book/ch01-00-getting-started",
  "action": "entry"
}
```

#### 42. Rosetta Code Aktörü (`rosetta-code`)
* **Ne Yapar?** Rosetta Code üzerindeki 1.000'den fazla programlama algoritmasının 800+ farklı dildeki eşzamanlı çözümlerini, kaynak kodlarını ve açıklamalarını çeker.
* **REST:** `POST /api/v1/rosetta-code`
* **MCP:** `query_rosetta_code`
```json
{
  "task": "100 doors",
  "language": "Python",
  "action": "task"
}
```

#### 43. Papers With Code Aktörü (`papers-with-code`)
* **Ne Yapar?** Makine öğrenimi makalelerini, arXiv özetlerini, resmi GitHub kod ambarlarını ve trend yapay zeka benchmarklarını yapılandırılmış formatta çeker.
* **REST:** `POST /api/v1/papers-with-code`
* **MCP:** `query_papers_with_code`
```json
{
  "arxivId": "1706.03762",
  "action": "paper"
}
```

#### 44. LibreTexts Aktörü (`libretexts`)
* **Ne Yapar?** LibreTexts kütüphanelerindeki (kimya, fizik, matematik, biyoloji, mühendislik vb.) açık üniversite ders kitaplarını, bölüm içeriklerini, LaTeX formüllerini ve alt sayfa hiyerarşisini çeker.
* **REST:** `POST /api/v1/libretexts`
* **MCP:** `query_libretexts`
```json
{
  "library": "phys",
  "query": "quantum mechanics",
  "action": "search"
}
```

#### 45. Open Textbook Library Aktörü (`open-textbook`)
* **Ne Yapar?** Minnesota Üniversitesi öncülüğündeki Open Textbook Library kataloğundan hakemli açık ders kitaplarını, PDF/EPUB indirme linklerini, içindekiler tablosunu ve akademik değerlendirmeleri çeker.
* **REST:** `POST /api/v1/open-textbook`
* **MCP:** `query_open_textbook`
```json
{
  "query": "calculus",
  "action": "search"
}
```

#### 46. Semantic Scholar Aktörü (`semantic-scholar`)
* **Ne Yapar?** 200 milyondan fazla bilimsel makaleyi kapsayan Semantic Scholar Graph API (S2AG) üzerinden makale özetlerini, yapay zeka TLDR özetlerini, yazar profillerini, atıf ve referans ağlarını çeker.
* **REST:** `POST /api/v1/semantic-scholar`
* **MCP:** `query_semantic_scholar`
```json
{
  "paperId": "ARXIV:1706.03762",
  "action": "paper"
}
```

#### 47. Anayasa Mahkemesi Aktörü (`anayasa-mahkemesi`)
* **Ne Yapar?** T.C. Anayasa Mahkemesi (AYM) norm denetimi iptal/itiraz kararlarını, bireysel başvuru hak ihlali hükümlerini, olayları, gerekçeli kararları ve karşı oy yazılarını çeker.
* **REST:** `POST /api/v1/anayasa-mahkemesi`
* **MCP:** `query_anayasa_mahkemesi`
```json
{
  "applicationNumber": "2019/12345",
  "action": "individual_application"
}
```

#### 48. Danıştay Aktörü (`danistay`)
* **Ne Yapar?** T.C. Danıştay Başkanlığı idari ve vergi dava daireleri (1-13), İDDK, VDDK ve İBK emsal kararlarını, ilk derece mahkemesi bilgilerini, tetkik hakimi ve savcı düşüncelerini çeker.
* **REST:** `POST /api/v1/danistay`
* **MCP:** `query_danistay`
```json
{
  "chamber": "iddk",
  "query": "kamulaştırmasız el atma",
  "action": "search"
}
```

#### 49. Google Patents Aktörü (`google-patents`)
* **Ne Yapar?** Google Patents ve küresel patent ofislerinden teknik buluş iddialarını (claims) hiyerarşik bağımsız/bağımlı yapıda, detaylı tarifnameleri, CPC/IPC kodlarını ve önceki teknik atıflarını çeker.
* **REST:** `POST /api/v1/google-patents`
* **MCP:** `query_google_patents`
```json
{
  "patentId": "US10123456B2",
  "action": "claims"
}
```

#### 50. Tufts Perseus Digital Library Aktörü (`perseus-dl`)
* **Ne Yapar?** Antik Yunanca, Klasik Latince, Eski İbranice ve Arapça metinleri, paralel çevirileri, morfolojik kelime tahlillerini (fiil çekimi, isim hali, kip) ve CTS-URN pasajlarını çeker.
* **REST:** `POST /api/v1/perseus-dl`
* **MCP:** `query_perseus_dl`
```json
{
  "doc": "Perseus:text:1999.01.0133:book=1:card=1",
  "action": "text"
}
```

#### 51. Internet Sacred Text Archive Aktörü (`sacred-texts`)
* **Ne Yapar?** Dünya dinleri (Hinduizm, Budizm, İslam, Hristiyanlık, Taoizm), antik mitoloji (Yunan, Roma, Mısır, Kelt, İskandinav), simya ve folklor alanında 1.700+ tam metin kitabı ve dipnotlarını çeker.
* **REST:** `POST /api/v1/sacred-texts`
* **MCP:** `query_sacred_texts`
```json
{
  "tradition": "hin",
  "path": "/hin/sbe01/sbe01003.htm",
  "action": "text"
}
```

#### 52. Instagram Aktörü (`instagram`)
* **Ne Yapar?** Kamuya açık Instagram profillerini, gönderi/reel detaylarını, karusel slaytlarını ve etiket akışlarını çift motorlu (HTTP API + Playwright Stealth) mimariyle çeker.
* **REST:** `POST /api/v1/instagram`
* **MCP:** `query_instagram`
```json
{
  "username": "natgeo",
  "action": "profile",
  "extractMarkdown": true
}
```


