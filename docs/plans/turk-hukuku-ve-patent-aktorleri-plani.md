# Türk Hukuku ve Küresel Patent Mühendisliği Aktörleri Planı (Set 4)

## 1. Genel Bakış ve Amaç

Bu plan, **protokol-7** mimarisi altında Türk Hukuk sisteminin en üst yargı mercileri olan **T.C. Anayasa Mahkemesi** ve **T.C. Danıştay Başkanlığı** ile mühendislik, buluş ve fikri mülkiyet dünyasının en kapsamlı veritabanı olan **Google Patents** kaynakları için 3 yeni üretim standardında aktörün inşasını tanımlar:

1. `anayasa-mahkemesi` (`AnayasaMahkemesiActor`): Anayasa norm denetimi, bireysel başvuru gerekçeli ihlal hükümleri ve temel hak içtihatları.
2. `danistay` (`DanistayActor`): İdari ve vergi dava daireleri, İçtihatları Birleştirme Kurulu, iptal/onama/bozma ve yürütmenin durdurulması kararları.
3. `google-patents` (`GooglePatentsActor`): Küresel patent teknik iddiaları (claims), buluş tarifnameleri, CPC/IPC sınıflandırması ve önceki teknik (prior art) atıf grafı.

Tüm aktörler 8 aşamalı Aktör Sözleşmesi (`docs/actor-contract.md`), sıfır emoji kuralı, katı teknik isimlendirme ve **sıfır yerel disk artığı (zero disk residue)** prensibine tam sadık kalarak inşa edilecektir.

---

## 2. Aktörlerin Teknik Sözleşmeleri

### 2.1. `anayasa-mahkemesi` (AnayasaMahkemesiActor)
- **Aktör Tipi**: `anayasa-mahkemesi`
- **Kategori**: `DOCUMENT`
- **Kaynak Endpoint'ler**:
  - `https://kararlarbilgibankasi.anayasa.gov.tr`
  - `https://normdenetimi.anayasa.gov.tr`
  - `https://bireysel.anayasa.gov.tr`
- **Eylemler (Actions)**:
  - `individual_application`: Bireysel başvuru kararları (Başvuru no, başvuru tarihi, karar tarihi, ihlal edilen hak, sonuç [ihlal/ihlal yok/kabul edilemezlik], gerekçe, karşı oy).
  - `norm_review`: Norm denetimi kararları (Esas No, Karar No, Resmi Gazete Tarihi/Sayısı, denetlenen norm, iptal edilen hükümler, karşı oylar).
  - `search`: Anahtar kelime sorgusu, başvuru no, esas no, karar no, yıl ve kategori filtreli arama.
  - `decision`: Belirli bir karar ID veya doğrudan URL üzerinden tam metin, olaylar, hukuki değerlendirme, hüküm ve karşı oylar.

### 2.2. `danistay` (DanistayActor)
- **Aktör Tipi**: `danistay`
- **Kategori**: `DOCUMENT`
- **Kaynak Endpoint'ler**:
  - `https://karararama.danistay.gov.tr`
  - `https://www.danistay.gov.tr`
- **Eylemler (Actions)**:
  - `search`: Arama sorgusu, daire seçimi (1-13 Daireler, İDDK, VDDK, İBK), esas no, karar no, karar yılı, hukuk alanı (idare, vergi, imar vb.), karar sonucu filtreleri.
  - `decision`: Tekil karar ID veya URL ile tam gerekçeli karar, ilk derece mahkemesi kararı, temyiz istemi, tetkik hakimi düşüncesi, savcı düşüncesi, hüküm ve karşı oylar.

### 2.3. `google-patents` (GooglePatentsActor)
- **Aktör Tipi**: `google-patents`
- **Kategori**: `DOCUMENT`
- **Kaynak Endpoint'ler**:
  - `https://patents.google.com`
  - `https://patents.google.com/patent/{patentId}/en`
- **Eylemler (Actions)**:
  - `patent`: Belirli bir patent numarası (ör. `US10123456B2`, `EP3123456A1`, `WO2020123456A1`, `TR202012345B`) veya URL ile künye, özet, bağımsız ve bağımlı iddialar, detaylı tarifname, mucitler, başvuru sahibi, tarihler ve sınıflandırma kodları (CPC/IPC).
  - `search`: Anahtar kelime sorgusu, mucit, başvuru sahibi, patent ofisi/ülke, patent durumu ve tarih filtreli patent keşfi.
  - `claims`: Patent iddialarını (patent claims) bağımsız ve bağımlı hiyerarşik numaralandırmayla yalın teknik formatta çıkarma.

---

## 3. Mimari Entegrasyon Adımları

1. **Tip Tanımları (`src/api/types.ts`)**:
   - `ActorType` union'a `"anayasa-mahkemesi" | "danistay" | "google-patents"` eklenmesi.
   - Her aktör için `*ActorTaskOptions`, `*Item`, `*Result` arayüzlerinin tanımlanması.
   - `ActorTask["options"]` içine ilgili alanların bağlanması.
2. **Aktör Sınıfları (`src/actors/corpus/`)**:
   - `anayasa-mahkemesi-actor.ts`: `AnayasaMahkemesiActor`
   - `danistay-actor.ts`: `DanistayActor`
   - `google-patents-actor.ts`: `GooglePatentsActor`
   - `src/actors/corpus/index.ts` ve `src/index.ts` re-export.
3. **Manifest ve Araç Kaydı (`src/actors/actor-manifests.ts` & `src/actors/actor-registry.ts`)**:
   - 3 yeni aktör manifestosu, Zod ve JSON Schema validatörleri.
   - 3 yeni MCP aracı: `query_anayasa_mahkemesi`, `query_danistay`, `query_google_patents` (Toplam 77 MCP aracı).
   - `createDefaultActorRegistry()` içine kayıt (Toplam 60 aktör).
4. **REST API ve OpenAPI (`src/api/server.ts` & `src/api/openapi-spec.ts`)**:
   - `POST /api/v1/anayasa-mahkemesi`, `POST /api/v1/danistay`, `POST /api/v1/google-patents` ve bare alias rotaları.
   - OpenAPI 3.1.0 şema tanımları (Tag: `Corpus - Legal & Patent`).
5. **MCP Sunucu Entegrasyonu (`src/mcp/protokol-mcp-server.ts`)**:
   - Yeni MCP araçları için `actorType` ve seçenek haritalamaları.
6. **Örnek Yapılandırmalar (`examples/actors/`)**:
   - `anayasa-mahkemesi.json`, `danistay.json`, `google-patents.json`.
7. **Teknik Dokümantasyon (`docs/actors/`)**:
   - `anayasa-mahkemesi.md`, `danistay.md`, `google-patents.md`.
8. **Birim ve Entegrasyon Testleri (`tests/`)**:
   - `tests/anayasa-mahkemesi-actor.test.ts`
   - `tests/danistay-actor.test.ts`
   - `tests/google-patents-actor.test.ts`
   - `tests/protokol-mcp-server.test.ts` ve `tests/server.test.ts` güncellemeleri.
9. **Mimari Şema Senkronizasyonu (`context/architecture-schema.md`)**:
   - Aktör sayısı 60'a güncellenir, yeni dosyalar ve testler envantere işlenir.
10. **Doğrulama ve Teslim**:
    - `npm run verify` ve `npm test` tam başarı.
