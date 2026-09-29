# Felsefe, Mantık ve Derin Muhakeme Aktörleri Paketi (Set 2) Walkthrough

Bu doküman, felsefe, formel mantık, epistemoloji ve akademik muhakeme alanında dünyanın en saygın açık kaynakları için geliştirilen 4 aktörün (`stanford-phil`, `internet-phil`, `metamath`, `philpapers`) mimari entegrasyonunu, teknik sözleşmelerini ve doğrulama sonuçlarını belgeler.

---

## 1. Hayata Geçirilen Aktörler ve Teknik Kapsam

| Aktör | Sınıf | Port / Endpoint | MCP Aracı | Veri Tipi ve Kaynak Mimarisi |
|---|---|---|---|---|
| **stanford-phil** | `StanfordPhilActor` | `POST /api/v1/stanford-phil` | `query_stanford_phil` | Stanford Encyclopedia of Philosophy (SEP) — Hakemli felsefe maddeleri, analitik argüman dizilimleri, dipnotlar ve zengin kaynakça (`plato.stanford.edu`). |
| **internet-phil** | `InternetPhilActor` | `POST /api/v1/internet-phil` | `query_internet_phil` | Internet Encyclopedia of Philosophy (IEP) — Akademik felsefe rehberleri, ontoloji, zihin felsefesi ve mantıksal çıkarsama metinleri (`iep.utm.edu`). |
| **metamath** | `MetamathActor` | `POST /api/v1/metamath` | `query_metamath` | Metamath Proof Explorer — ZFC küme kuramı, sezgisel mantık ve kuantum mantığı veritabanlarında 40.000+ teorem, aksiyom ve adım adım biçimsel ispat tabloları (`us.metamath.org`). |
| **philpapers** | `PhilPapersActor` | `POST /api/v1/philpapers` | `query_philpapers` | PhilPapers Archive — 2.5 milyondan fazla akademik felsefe makalesi, tezler, özetler ve 5.000+ kategorili felsefe taksonomisi (`philpapers.org`). |

---

## 2. Mimari Entegrasyon ve Sözleşmeler

Tüm aktörler 8 aşamalı Aktör Sözleşmesi (`docs/actor-contract.md`) gereksinimlerine göre entegre edilmiştir:

1. **Tip Tanımları (`src/api/types.ts`):**
   - `ActorType` union listesine `"stanford-phil" | "internet-phil" | "metamath" | "philpapers"` eklendi.
   - Her aktör için `Options` ve `Result` arayüzleri tanımlandı ve `ActorTask` seçeneklerine bağlandı.
2. **Aktör Sınıfları (`src/actors/corpus/`):**
   - `StanfordPhilActor`: Cheerio ve Turndown ile makale ana hatları, bölümleri, bibliyografyası ve arama sonuçlarını ayrıştırır.
   - `InternetPhilActor`: IEP WordPress arama ve makale DOM yapısını ayrıştırır, temiz GFM Markdown üretir.
   - `MetamathActor`: Biçimsel ispat tablosunu (Step, Hyp, Ref, Expression), Unicode sembollerini (`⊢`, `→`, `∈`), hipotezleri ve çapraz referansları yapılandırır.
   - `PhilPapersActor`: Kayıt metaverilerini, yazar dizilerini, DOI/indirme bağlantılarını, arama listelerini ve kategori ağaçlarını ayrıştırır.
3. **Kategori ve Kök İhracatları (`src/actors/corpus/index.ts`, `src/index.ts`):**
   - 4 aktör sınıfı hem kategori hem de kök barelinden ihraç edildi.
4. **Manifesto ve Şemalar (`src/actors/actor-manifests.ts`):**
   - Zod/JSON şemaları ve MCP araç tanımları (`query_stanford_phil`, `query_internet_phil`, `query_metamath`, `query_philpapers`) eklendi.
5. **Merkezi Kayıt (`src/actors/actor-registry.ts`):**
   - `createDefaultActorRegistry()` içine 4 aktör kaydedildi.
6. **HTTP Sunucu ve OpenAPI 3.1.0 (`src/api/server.ts`, `src/api/openapi-spec.ts`):**
   - `POST /api/v1/<name>` ve `POST /<name>` rotaları bağlandı.
   - OpenAPI 3.1.0 tanımları tam şemalarıyla eklendi.
7. **MCP Sunucu Araç Haritalaması (`src/mcp/protokol-mcp-server.ts`):**
   - Toplam MCP araç sayısı 64'ten 68'e yükseltildi.
8. **Testler, Örnekler ve Wiki Dokümantasyonu:**
   - Örnek yapılandırmalar: `examples/actors/<name>.json`
   - Teknik wiki sayfaları: `docs/actors/<name>.md`
   - Birim ve entegrasyon testleri: `tests/<name>-actor.test.ts`
