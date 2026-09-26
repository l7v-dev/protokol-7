# LLM Temiz Manipule Edilmemis Veri Aktorleri Dogrulama ve Tamamlama Raporu (Walkthrough)

Bu calisma, LLM on egitim, ince ayar (fine-tuning), RAG ve mantiksal akil yurutme sistemleri icin internetteki sentetik cop (slop), reklam dolgusu ve SEO manipülasyonundan arindirilmis veri saglayan 3 birincil platformun (`Wikimedia`, `OpenAlex`, `Stack Exchange`) resmi REST API'leri uzerinden calisan mikro-aktorlerini Protokol-7 mimarisine kazandirmistir.

## 1. Eklenen Bilesenler ve Aktorler

### 1.1 Wikimedia REST Aktor (`src/actors/wikimedia-actor.ts`)
- **Amac**: Olgusal ve ansiklopedik bilginin resmi Wikimedia REST API v1 uzerinden cekilmesi.
- **Kabiliyetler**:
  - `action: "summary"`: Temiz giris ozeti ve metadata (`title`, `extract`, `description`, `coordinates`, `thumbnail`).
  - `action: "article"`: Parsoid HTML'inin Turndown servisi ile reklamsiz, script/style ayiklanmis GFM Markdown'a donusturulmesi.
  - `action: "search"`: `/w/rest.php/v1/search/page` uzerinden sayfa arama ve HTML etiketlerinden arindirilmis pasaj cikarimi.
  - Cok dilli dil destegi (`lang: "tr"`, `"en"`, `"de"` vb.).

### 1.2 OpenAlex Akademik Aktor (`src/actors/openalex-actor.ts`)
- **Amac**: Hakem denetimli kuresel bilimsel literatur (250M+ calisma) ve atif grafiginin cekilmesi.
- **Kabiliyetler**:
  - `/works` sorgusu (arama, DOI dogrudan erisimi, yazar, konu filtreleri).
  - Ters cevrilmis dizinden (`abstract_inverted_index`) dogrusal, deterministik tam soyut (abstract) rekonstrüksiyonu.
  - Kalite esigi filtresi (`minCitations`), acik erisim URL (`isOpenAccess`, `openAccessUrl`) ve konu etiketleri (`concepts`).

### 1.3 Stack Exchange Akil Yurutme Aktor (`src/actors/stack-exchange-actor.ts`)
- **Amac**: Topluluk tarafindan oylanmis ve teyit edilmis algoritmik, teknik ve mantiksal soru-cozum ciftlerinin toplanmasi.
- **Kabiliyetler**:
  - `/search/advanced` ve `/questions/{ids}/answers` uzerinden ag siteleri (`stackoverflow`, `math`, `physics`, `askubuntu`, `serverfault`, `cs` vb.) taramasi.
  - `minScore` ve `acceptedOnly` kalite filtreleri.
  - Soru ve kabul edilmis en yuksek puanli yanittan LLM egitimi icin dogrudan kullanilabilir instruction-tuning cifti (`instructionPair: { prompt, completion }`) olusturma.

### 1.4 REST API & MCP Entegrasyonu
- `src/core/server.ts`:
  - `POST /api/v1/wikimedia` ve `POST /wikimedia`
  - `POST /api/v1/openalex` ve `POST /openalex`
  - `POST /api/v1/stack-exchange` ve `POST /stack-exchange`
- `src/core/store-router.ts`: Store API `/api/v1/store/actors/:name/run` icin opsiyon iletimi.
- `src/actors/actor-manifests.ts`: Zod/JSON girdi semalari ve MCP araclari (`wikimedia_query`, `openalex_query`, `stack_exchange_query`).
- `src/mcp/protokol-mcp-server.ts`: MCP JSON-RPC sunucusunda kayitli arac sayisi 10'dan 13'e cikarildi.

## 2. Test ve Dogrulama Sonuclari

### 2.1 Birim ve Entegrasyon Testleri
- `tests/wikimedia-actor.test.ts`: 5/5 basarili (Ozet, HTML->Markdown, Arama, SSRF korumasi, REST endpoint).
- `tests/openalex-actor.test.ts`: 4/4 basarili (Inverted index abstract rekonstrüksiyonu, bos soyut yonetimi, SSRF korumasi, REST endpoint).
- `tests/stack-exchange-actor.test.ts`: 4/4 basarili (Soru/yanit ciftleme, instructionPair formati, bos sonuc yonetimi, SSRF korumasi, REST endpoint).
- `tests/protokol-mcp-server.test.ts`: 9/9 basarili (13 MCP araci dogrulandi).

### 2.2 Tam Sistem Test Paketi
- Calistirilan komut: `npm test`
- Sonuc: **147/147 test basariyla gecti** (0 hata, 0 atlama).

### 2.3 Deterministik Dogrulama Hatti (Verification Pipeline)
- Calistirilan komut: `npm run verify`
- Kontroller:
  1. Mimari dosya butunlugu: GECTI.
  2. Isimlendirme ve dokumantasyon disiplini (Sifir buzzword & sohbet dili): GECTI.
  3. Loglama disiplini (Sifir emoji): GECTI.
  4. Gizli anahtar (Secret detection) taramasi: GECTI.
  5. SCA paket halusinasyonu denetimi: 8 bagimlilik resmi kayit defterinde dogrulandi: GECTI.
  6. Biome kod stili ve statik analiz (0 hata, 1 uyarili symlink istisnasi): GECTI.
- `npm run doctor`: Depo sagligi tam (GECTI).
- `npm run connectome`: Sistem baglanti grafigi guncellendi.
