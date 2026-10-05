# ArxivActor Tasarım ve Uygulama Planı

Bu doküman, `protokol-7` mikroservisi bünyesinde `https://arxiv.org/` akademik arşivinden temiz, güvenli ve LLM ön-eğitimi/RAG kullanımına hazır veri çekilmesini sağlayan `ArxivActor` bileşeninin teknik mimari planını tanımlar.

---

## 1. Arka Plan ve Teknik Gereksinimler

`arXiv.org`, dünya çapında fizik, bilgisayar bilimi, matematik, istatistik ve biyoloji alanlarındaki ön baskı (preprint) makalelerinin ana merkezidir.
arXiv'e web scraping ile erişilmeye çalışıldığında katı Cloudflare/bot koruması, IP engellemeleri ve istek sınırları devreye girmektedir. Resmi olarak arXiv, veri madenciliği ve programatik sorgular için **arXiv Export API (Atom 1.0 XML Query)** arayüzünü sunar (`https://export.arxiv.org/api/query`).

### Temel Hedefler:
1. **Çok Modlu Sorgulama:** Hem arama sorguları (`search_query`, örn: `cat:cs.AI AND ti:diffusion`, `au:lecun`) hem de doğrudan arXiv ID listesi (`id_list`, örn: `["2301.07067", "1706.03762"]`) ile çalışabilme.
2. **Doğrudan URL Ayrıştırma:** Eğer `targetUrl` doğrudan bir arXiv makale linki ise (`https://arxiv.org/abs/2301.07067` veya `https://arxiv.org/pdf/2301.07067`), otomatik olarak ID listesine çevrilerek API üzerinden zengin metadata getirilmesi.
3. **Kapsamlı ve Normalleştirilmiş Metadata:**
   - `id`: Temiz arXiv ID'si (sürüm numaralı ve sürüm numarasız normalize edilmiş).
   - `title`: Fazlalık boşluk ve satır sonlarından arındırılmış temiz başlık.
   - `summary`: Temiz ve normalize edilmiş özet (abstract).
   - `authors`: Yazar adı ve opsiyonel kurum/bağlılık (`affiliation`) listesi.
   - `published`: ISO 8601 yayın tarihi.
   - `updated`: ISO 8601 son güncelleme tarihi.
   - `primaryCategory`: Birincil kategori (örn: `cs.AI`, `math.PR`).
   - `categories`: Tüm kategoriler dizisi.
   - `doi`: DOI numarası (varsa).
   - `comment`: Yorum alanı (sayfa sayısı, şekil sayısı vb.).
   - `journalRef`: Hakemli dergi referansı (varsa).
   - `pdfUrl`: Doğrudan PDF indirme linki (`https://arxiv.org/pdf/<id>`).
   - `htmlUrl`: HTML sürüm linki (`https://arxiv.org/abs/<id>` ve `https://arxiv.org/html/<id>`).
4. **Opsiyonel Tam Metin Çıkarımı (`downloadPdf` / `includeFullText`):**
   - Kullanıcı talep ederse PDF belgesi güvenli şekilde indirilip projedeki mevcut `unpdf` kütüphanesi ile metne dönüştürülerek `fullText`, `pageCount`, `pages` alanları doldurulur.
5. **Güvenlik ve Nezaket:**
   - Tüm HTTP istekleri `SSRFGuard` ve `safeRedirectFetch` üzerinden geçirilir (RFC 1918 ve bulut metadata koruması).
   - arXiv API nezaket kurallarına uyum: İstek hız sınırlandırması ve timeout yönetimi (AbortController).
6. **Protokol-7 ve MCP Uyumu:**
   - `ActorType` union'ına `"arxiv"` eklenmesi.
   - `ACTOR_MANIFESTS["arxiv"]` tanımı, Zod/JSON input/output şemaları ve `arxiv_query` MCP tool tanımı.
   - `ActorRegistry` entegrasyonu ve `src/index.ts` exportları.
   - REST API entegrasyonu: `POST /api/v1/actors/arxiv/run` ve `POST /api/v1/arxiv`.

---

## 2. Tip Tanımları (`src/core/types.ts`)

```typescript
export interface ArxivAuthor {
  name: string;
  affiliation?: string;
}

export interface ArxivPaperItem {
  id: string;
  entryUrl: string;
  title: string;
  summary: string;
  authors: ArxivAuthor[];
  published: string;
  updated: string;
  primaryCategory: string;
  categories: string[];
  doi?: string;
  comment?: string;
  journalRef?: string;
  pdfUrl: string;
  htmlUrl: string;
  fullText?: string;
  pageCount?: number;
}

export interface ArxivActorTaskOptions {
  searchQuery?: string;
  idList?: string[];
  start?: number;
  maxResults?: number;
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
  sortOrder?: "ascending" | "descending";
  downloadPdf?: boolean;
  timeoutMs?: number;
}

export interface ArxivActorResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  papers: ArxivPaperItem[];
  queryUrl: string;
}
```

---

## 3. Bileşen Mimarisi

### 3.1 `ArxivActor` (`src/actors/arxiv-actor.ts`)
- `IActor<ArxivActorResult>` arayüzünü uygular.
- URL parametreleri oluşturma:
  - `export.arxiv.org/api/query` için `search_query`, `id_list`, `start`, `max_results`, `sortBy`, `sortOrder` query string inşası.
  - Hedef URL `https://arxiv.org/abs/...` veya `https://arxiv.org/pdf/...` ise arXiv ID'si regex (`(\d{4}\.\d{4,5}(v\d+)?|[a-z\-]+(\.[A-Z]{2})?\/\d{7})`) ile ayrıştırılır.
- Atom XML Ayrıştırma:
  - Cheerio `cheerio.load(xml, { xmlMode: true })` ile `<entry>` düğümlerinin taranması.
  - İsim alanı (namespace) önekleri (`arxiv:primary_category`, `arxiv:doi`, `arxiv:comment`, `opensearch:totalResults`) için esnek etiket sorgulama.
- PDF İndirme ve Metin Çıkarımı:
  - `downloadPdf: true` verildiğinde `safeRedirectFetch` ile PDF indirilir ve `unpdf` modülü (`extractText`) kullanılarak saf metin ayrıştırılır.
  - Maksimum PDF boyutu (30 MB) ve sayfa sınırı koruması uygulanır.

### 3.2 Manifest ve MCP Entegrasyonu (`src/actors/actor-manifests.ts`)
- `"arxiv"` anahtarı ile katalog manifesti.
- Girdi alanları: `searchQuery`, `idList`, `start`, `maxResults`, `sortBy`, `sortOrder`, `downloadPdf`.
- MCP Tool: `arxiv_query` fonksiyonu.

### 3.3 Kayıt ve Dağıtım (`src/actors/actor-registry.ts` & `src/index.ts`)
- `createDefaultActorRegistry()` içine `new ArxivActor()` eklenmesi.
- `src/index.ts` üzerinden dışa aktarım.
- `src/server.ts` içinde `POST /api/v1/arxiv` kolaylık endpoint'i eklenmesi.

---

## 4. Doğrulama ve Test Planı

1. **Birim Testleri (`tests/arxiv-actor.test.ts`):**
   - Mock Atom XML yanıtı ile XML ayrıştırma ve metadata normalizasyon testi.
   - `searchQuery` ve `idList` parametreleri ile query URL oluşturma testi.
   - `targetUrl` üzerinden (örn: `https://arxiv.org/abs/2301.07067`) arXiv ID tespiti testi.
   - SSRF engelleme testi (RFC 1918 / loopback hedeflerine karşı `SSRFGuard`).
   - `downloadPdf: true` opsiyonunun çalışması veya hata durumunda toleransı.
   - `maxResults` ve pagination sınırları testi.
2. **Sistem ve API Testi:**
   - `POST /api/v1/store/actors/arxiv/run` ve `POST /api/v1/arxiv` uçlarının testi.
   - `tests/store-api.test.ts` ve `tests/server.test.ts` uyumluluğu.
   - Tam test koşumu (`npm test`).
   - Statik analiz (`npm run lint` / `npm run lint:naming`).
