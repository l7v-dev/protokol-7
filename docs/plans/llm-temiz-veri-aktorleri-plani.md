# LLM Temiz ve Manipule Edilmemis Veri Cekme Stratejisi ve Aktor Uygulama Plani

## 1. Problem ve Amac

Yapay zeka buyuk dil modellerinin (LLM) egitimi, ince ayari (fine-tuning) ve RAG (Retrieval-Augmented Generation) sistemleri icin internetten toplanan verilerin buyuk kismi SEO manipülasyonu, reklam dolgusu, yapay zeka tarafindan uretilmis sentetik metinler (slop) ve kullanici yorumu gurultusu ile kirlenmistir.

Bu gorevde, LLM'ler icin dogrulanabilir, manipulasyondan arindirilmis, hakem denetimli veya editoriyel suzgecli birincil kaynak platformlar belirlenmis; bu platformlarin resmi REST API protokolleri uzerinden calisan 3 yeni yuksek sinyalli mikro-aktor (`WikimediaActor`, `OpenAlexActor`, `StackExchangeActor`) Protokol-7 mimarisine kazandirilacaktir.

## 2. Platform ve Veri Stratejisi Analizi

| Platform | Kapsadigi Bilgi Alani | Neden Temiz ve Manipulesiz? | Veri Erisim Stratejisi |
|---|---|---|---|
| **Wikimedia (Wikipedia / Wiktionary)** | Ansiklopedik olgusal bilgi, tarih, kavramlar, tanimlar | Tarafsiz Bakis Acisi (NPOV), zorunlu birincil/ikincil kaynak atfi, kolektif denetim. Reklamsiz ve SEO spamsiz. | Resmi Wikimedia REST API v1 (`/page/summary`, `/page/html`, `/w/rest.php/v1/search/page`). Parsoid HTML'i `ReadabilityExtractor` / Turndown ile temiz GFM Markdown'a donusturulur. |
| **OpenAlex** | Kuresel akademik ve bilimsel literatur (250M+ calisma) | Hakem denetimli yayinlar, CrossRef DOI kayitlari, kurumsal yazar baglantilari. Sentetik cop ve SEO manipülasyonu sifir. | Resmi OpenAlex REST API (`/works`). Ters cevrilmis dizinden (inverted index) tam soyut (abstract) rekonstrüksiyonu, atif sayisi filtreleme ve acik erisim (OA) baglantilari. |
| **Stack Exchange** | Algoritmik akil yurutme, kodlama, matematik ve sistem cozumu | Topluluk oylamasi ve soru sahibi tarafindan kabul edilmis (accepted) yanit dogrulamasi. | Resmi Stack Exchange REST API v2.3 (`/search/advanced`). `minScore` ve `acceptedOnly` filtreleri ile gurultusuz (soru-kabul edilmis yanit) instruction-tuning ciftleri. |

## 3. Mimari Degisiklikler ve Bilesenler

### 3.1 Cekirdek Tipler (`src/core/types.ts`)
- `ActorType` union tipine `"wikimedia" | "openalex" | "stack-exchange"` eklenmesi.
- `WikimediaActorTaskOptions`, `WikimediaActorResult`, `WikimediaArticleItem`.
- `OpenAlexActorTaskOptions`, `OpenAlexActorResult`, `OpenAlexWorkItem`.
- `StackExchangeActorTaskOptions`, `StackExchangeActorResult`, `StackExchangeQuestionItem`.

### 3.2 Aktor Katmani (`src/actors/`)
- `src/actors/wikimedia-actor.ts`: `WikimediaActor`
  - `/page/summary/{title}`, `/page/html/{title}` ve arama endpointleri.
  - Parsoid HTML -> GFM Markdown donusumu.
  - Cok dilli dil destegi (`lang` parametresi, ornek: `tr`, `en`, `de`).
  - SSRFGuard ve PolitenessLimiter uyumlulugu.
- `src/actors/openalex-actor.ts`: `OpenAlexActor`
  - `/works?search=...&filter=...` sorgusu.
  - `abstract_inverted_index` uzerinden metin rekonstrüksiyon algoritmasi.
  - DOI, atif sayisi, acik erisim URL'si, konu etiketleri (concepts) cikarimi.
  - SSRFGuard korumasi.
- `src/actors/stack-exchange-actor.ts`: `StackExchangeActor`
  - `/search/advanced` ve `/questions/{id}/answers` endpointleri.
  - Site parametresi (`stackoverflow`, `math`, `physics`, `serverfault`, `askubuntu`, `cs`).
  - `minScore`, `acceptedOnly`, `tagged` filtreleri.
  - Markdown/HTML govde cikarimi ve instruction-tuning cifti formatlama.
  - SSRFGuard korumasi.

### 3.3 Aktor Kaydi ve Manifestleri
- `src/actors/actor-registry.ts`: `createDefaultActorRegistry` icerisine yeni aktorlerin kaydedilmesi.
- `src/actors/actor-manifests.ts`: Zod/JSON semalari, aciklamalar, ornek girdiler ve MCP arac bildirimleri (`wikimedia_query`, `openalex_query`, `stack_exchange_query`).
- `src/index.ts`: Yeni aktor siniflari ve arayuzlerinin disa aktarilmasi.

### 3.4 REST API & MCP Sunucusu
- `src/core/server.ts`:
  - `POST /api/v1/wikimedia` ve `POST /wikimedia`
  - `POST /api/v1/openalex` ve `POST /openalex`
  - `POST /api/v1/stack-exchange` ve `POST /stack-exchange`
- `src/core/store-router.ts`: `/api/v1/store/actors/:name/run` icin secenek yonlendirmesi.
- `tests/protokol-mcp-server.test.ts`: Arac sayisi kontrolunun 10'dan 13'e guncellenmesi ve yeni araclarin dogrulanmasi.

### 3.5 Mimari Sema Belgesi
- `context/architecture-schema.md`: Yeni aktorler ve test dosyalarinin envantere eklenmesi.

## 4. Dogrulama ve Test Plani

1. Birim ve Entegrasyon Testleri:
   - `tests/wikimedia-actor.test.ts`: Ozet, tam makale HTML->Markdown, dil degisimi, arama, SSRF engelleme (en az 5 test).
   - `tests/openalex-actor.test.ts`: Ters dizin soyut rekonstrüksiyonu, atif filtreleme, acik erisim tespiti, SSRF engelleme (en az 5 test).
   - `tests/stack-exchange-actor.test.ts`: Soru/yanit ciftleme, puan filtreleme, kabul edilen yanit secimi, SSRF engelleme (en az 5 test).
   - `tests/protokol-mcp-server.test.ts`: 13 aracin MCP uzerinden listelenmesi ve cagrilmasi.
2. Tum Sistem Regresyonu:
   - `npm test` (134 + ~15 yeni test, toplam 149+ test gecisi).
3. Deterministik Dogrulama Hatti:
   - `npm run verify` (Mimari butunluk, isimlendirme disiplini, sifir emoji, gizli anahtar, SCA, Biome lint).
