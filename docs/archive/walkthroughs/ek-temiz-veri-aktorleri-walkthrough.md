# Ek LLM Temiz ve Manipule Edilmemis Veri Aktorleri Walkthrough (P5)

## 1. Genel Bakis ve Kapsam

Kullanici talebi dogrultusunda ("Biraz daha aktör ekleyelim"), LLM'lerin uzun baglamli narrative kavrayisi, biyomedikal/klinik muhakemesi ve Internet protokol standartlari egitimi icin 3 yeni temiz veri aktoru gelistirildi:

1. **Project Gutenberg (`gutenberg`)**: Gutendex REST API uzerinden 70.000+ kamu mali edebi ve felsefi eserin metaverisi ve lisans baslik/dipnot bloklarindan (`*** START OF THE PROJECT GUTENBERG EBOOK... ***`) tamamen arindirilmis duz metin akisi.
2. **Europe PMC (`europe-pmc`)**: Europe PMC ve PubMed Central REST API uzerinden 45M+ hakem denetimli biyomedikal makale, yapilandirilmis abstract'lar ve acik erisim tam metin baglantilari.
3. **IETF RFC (`ietf-rfc`)**: RFC Editor ve IETF Datatracker REST API uzerinden baglayici Internet standartlari (RFC), normatif durumlar (Proposed Standard, Best Current Practice), form-feed (`\f`) ve calisan sayfa basliklarindan arindirilmis duz metinler.

## 2. Yapilan Mimari ve Kod Degisiklikleri

### 2.1 Cekirdek Tipler ve Veri Modelleri (`src/core/types.ts`)
- `ActorType` birligine `"gutenberg" | "europe-pmc" | "ietf-rfc"` eklendi.
- `GutenbergBookItem`, `GutenbergActorTaskOptions`, `GutenbergActorResult` tanimlandi.
- `EuropePmcArticleItem`, `EuropePmcActorTaskOptions`, `EuropePmcActorResult` tanimlandi.
- `IetfRfcItem`, `IetfRfcActorTaskOptions`, `IetfRfcActorResult` tanimlandi.
- `ActorTask.options` nesnesine opsiyon alanlari (`gutenbergOptions`, `europePmcOptions`, `ietfRfcOptions`) eklendi.

### 2.2 Aktor Katmani (`src/actors/`)
- `src/actors/gutenberg-actor.ts`: `GutenbergActor` sinifi; SSRF denetimi, Gutendex sorgulama, UTF-8 kitap metni indirme ve `stripGutenbergHeaders` fonksiyonu ile lisans bloklarini ayiklama.
- `src/actors/europe-pmc-actor.ts`: `EuropePmcActor` sinifi; SSRF korumasi, `core` detay modunda arama, `openAccessOnly` filtreleme, PDF/HTML tam metin URL cikarimi.
- `src/actors/ietf-rfc-actor.ts`: `IetfRfcActor` sinifi; RFC Editor duz metin indirme, `cleanRfcText` ile sayfa kesme ve sayfa numarasi temizligi, baslik ve abstract cikarimi, Datatracker API aramasi.

### 2.3 Kayit Defteri, MCP ve Sunucu Yonlendirmesi
- `src/actors/actor-registry.ts`: `GutenbergActor`, `EuropePmcActor` ve `IetfRfcActor` varsayilan kayit defterine eklendi.
- `src/actors/actor-manifests.ts`: Zod girdi semalari ve MCP araclari (`gutenberg_query`, `europe_pmc_query`, `ietf_rfc_query`) tanimlandi; toplam MCP arac sayisi 13'ten 16'ya cikti.
- `src/core/server.ts`:
  - `POST /api/v1/gutenberg` ve `POST /gutenberg`
  - `POST /api/v1/europe-pmc` ve `POST /europe-pmc`
  - `POST /api/v1/ietf-rfc` ve `POST /ietf-rfc`
- `src/core/store-router.ts`: Store API seceneklerinin aktore dogrudan iletilmesi saglandi.
- `src/core/openapi-spec.ts`: `Clean Datasets` etiketi ve 6 yeni ucbirim OpenAPI 3.1.0 semasina islendi.
- `src/index.ts`: Yeni aktorler disa aktarildi.

### 2.4 Sistem Belgeleri ve Envanter
- `context/architecture-schema.md`: 1.2 Aktorler ve 2. Test Suite tablolarina yeni dosyalar eklendi.
- `context/connectome.md`: `npm run connectome` ile guncellendi.

## 3. Test ve Dogrulama Sonuclari

### 3.1 Test Paketleri
- `tests/gutenberg-actor.test.ts` (5 test, 0 hata):
  - Kitap katalogu sorgulama ve metaveri ayristirma.
  - Kitap metni indirme ve Project Gutenberg lisans baslik/dipnot bloklarinin temizlenmesi.
  - `stripGutenbergHeaders` birim testi.
  - Bulut metaverisine yonelik SSRF korumasi.
  - `POST /api/v1/gutenberg` REST entegrasyonu.
- `tests/europe-pmc-actor.test.ts` (4 test, 0 hata):
  - Biyomedikal literatur ve abstract ayristirma.
  - `openAccessOnly` filtre parametresi iletimi.
  - SSRF korumasi.
  - `POST /api/v1/europe-pmc` REST entegrasyonu.
- `tests/ietf-rfc-actor.test.ts` (5 test, 0 hata):
  - RFC metni indirme, giris metaverisi (durum, tarih, abstract, obsoletes) ayristirma.
  - Datatracker arama indeksi sorgulama.
  - `cleanRfcText` ile form-feed ve baslik temizligi birim testi.
  - SSRF korumasi.
  - `POST /api/v1/ietf-rfc` REST entegrasyonu.
- `tests/protokol-mcp-server.test.ts` (9 test, 0 hata):
  - 16 Model Context Protocol araci dogrulandi.

### 3.2 Butunsel Dogrulama
- `npm test`: 161 test gecti, 0 basarisiz (9 test paketi).
- `npm run typecheck`: 0 TypeScript derleme hatasi.
- `npm run verify`: 6 asamali deterministik dogrulama hatti (Mimari Butunluk, Isimlendirme, Sifir Emoji, Secret Taramasi, SCA Bagimlilik, Biome Lint) basariyla tamamlandi.
- `npm run doctor`: Saglikli.
