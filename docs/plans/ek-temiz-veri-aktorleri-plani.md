# Ek LLM Temiz ve Manipule Edilmemis Veri Aktorleri Uygulama Plani (P5)

## 1. Problem ve Amac

Temel yapay zeka arastirmalarinda (Llama 3, DeepSeek, Dolma, FineWeb, RedPajama, The Pile), modellerin uzun baglamli narrative kavrayisi, biyomedikal/klinik muhakemesi ve dagitik sistemler/protokol standartlari uzerinde guclu akil yurutebilmesi icin 3 kritik alan daha mevcuttur:

1. **Kamu Mali Edebi & Felsefi Eserler (Project Gutenberg)**: Sentetik cop, modern web reklamlari ve SEO manipülasyonundan 100% ari, zengin sozcuk dagarcikli uzun metinler.
2. **Biyomedikal & Klinik Arastirma Literaturu (Europe PMC / PubMed Central)**: 45M+ hakem denetimli biyomedikal makale ve acik erisim klinik calisma.
3. **Internet ve Ag Standartlari (IETF RFC & Datatracker)**: Ag protokolleri (HTTP, TCP, TLS, DNS, WebSocket), kriptografi ve dagitik sistemlerin kesin teknik spesifikasyonlari.

Bu gorevde, Protokol-7 mimarisine `GutenbergActor`, `EuropePmcActor` ve `IetfRfcActor` eklenerek kayitli aktör sayisi 13'ten 16'ya cikarilacaktir.

## 2. Platform ve Veri Stratejisi Analizi

| Platform | Kapsam | Neden Temiz & Manipulesiz? | Veri Erisim ve Temizleme Stratejisi |
|---|---|---|---|
| **Project Gutenberg (`gutenberg`)** | Klasik edebiyat, tarih, felsefe, bilimsel denemeler (70.000+ kitap) | 20. yuzyil oncesi/basi saf insan yazimi. Sifir SEO spam'i, sifir yapay zeka sentetik metni. | Gutendex REST API (`https://gutendex.com/books`) ile arama, dil ve konu filtreleme; ardindan dogrudan UTF-8 metin akisi cekilerek Gutenberg lisans baslik ve dipnot bloklari (`*** START OF THE PROJECT GUTENBERG EBOOK... ***`) ayiklanir. |
| **Europe PMC (`europe-pmc`)** | Biyoloji, tip, farmakoloji, genetik (45M+ kayit, PMC tam metinleri) | Hakem denetimli akademik tip literaturu, MeSH dizinleme, CrossRef/EBI dogrulamasi. | Europe PMC REST API (`/webservices/rest/search`). `core` detay modu ile abstract, yazarlar, dergi, atiflar ve acik erisim tam metin baglantilari cikarilir. |
| **IETF RFC (`ietf-rfc`)** | Internet protokolleri, kriptografi, ag mimarisi (9.500+ resmi standart) | IETF konsensusu ile yayinlanan baglayici protokol tanimlari (RFC 2119: MUST, SHOULD). | RFC Editor (`/rfc/rfc{number}.txt`) ve Datatracker REST API. Sayfa kesme (`\f`), calisan basliklar ve sayfa numaralari temizlenerek bolum hiyerarsisine gore akis olusturulur. |

## 3. Mimari Degisiklikler

### 3.1 Cekirdek Tipler (`src/core/types.ts`)
- `ActorType` union tipine `"gutenberg" | "europe-pmc" | "ietf-rfc"` eklenmesi.
- `GutenbergActorTaskOptions`, `GutenbergActorResult`, `GutenbergBookItem`.
- `EuropePmcActorTaskOptions`, `EuropePmcActorResult`, `EuropePmcArticleItem`.
- `IetfRfcActorTaskOptions`, `IetfRfcActorResult`, `IetfRfcItem`.
- `ActorTask.options` icerisine `gutenbergOptions`, `europePmcOptions`, `ietfRfcOptions` eklenmesi.

### 3.2 Aktor Katmani (`src/actors/`)
- `src/actors/gutenberg-actor.ts`: `GutenbergActor implements IActor<GutenbergActorResult>`
- `src/actors/europe-pmc-actor.ts`: `EuropePmcActor implements IActor<EuropePmcActorResult>`
- `src/actors/ietf-rfc-actor.ts`: `IetfRfcActor implements IActor<IetfRfcActorResult>`

### 3.3 Aktor Manifestleri & Kayit Defteri
- `src/actors/actor-registry.ts`: `createDefaultActorRegistry` icerisine 3 yeni aktorun eklenmesi.
- `src/actors/actor-manifests.ts`: Manifestler ve MCP araclari (`gutenberg_query`, `europe_pmc_query`, `ietf_rfc_query`).
- `src/core/server.ts`:
  - `POST /api/v1/gutenberg` ve `POST /gutenberg`
  - `POST /api/v1/europe-pmc` ve `POST /europe-pmc`
  - `POST /api/v1/ietf-rfc` ve `POST /ietf-rfc`
- `src/core/store-router.ts`: Store API parametre yonlendirmesi.
- `src/index.ts`: Modul disa aktarimlari.

### 3.4 Test ve Dogrulama
- `tests/gutenberg-actor.test.ts`: Arama, lisans baslik/dipnot ayiklama, SSRF korumasi, REST ucbirimi.
- `tests/europe-pmc-actor.test.ts`: Makale metadata, abstract, acik erisim filtreleme, SSRF korumasi, REST ucbirimi.
- `tests/ietf-rfc-actor.test.ts`: RFC numarasi ile arama, sayfa kesme temizligi, durum cikarimi, SSRF korumasi, REST ucbirimi.
- `tests/protokol-mcp-server.test.ts`: MCP arac sayisinin 13'ten 16'ya cikarilip dogrulanmasi.
- `context/architecture-schema.md`: Dosya envanterinin senkronizasyonu.
- `npm test` ve `npm run verify` calistirilmasi.
