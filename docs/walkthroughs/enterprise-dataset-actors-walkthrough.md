# Kurumsal ve Akademik LLM Veri Cikarim Aktorleri (Faz 1 Walkthrough)

## Ozet
Bu dogrulama raporu, `protokol-7` mikroservisinde yer almayan yuksek sinyalli acik platformlar arasindan **Faz 1: Biyomedikal ve Klinik Regulasyon** kapsamindaki `ClinicalTrialsActor` ve `OpenFdaActor` gelistirmelerini, testlerini ve MCP entegrasyonunu belgeler.

## Yapilan Degisiklikler ve Eklemeler

1. **Cekirdek Tipler (`src/core/types.ts`)**:
   - `ActorType` birligine `"clinical-trials"` ve `"open-fda"` eklendi.
   - `ClinicalTrialsActorTaskOptions`, `ClinicalStudySummary`, `ClinicalTrialsActorResult` tanimlandi.
   - `OpenFdaActorTaskOptions`, `OpenFdaActorResult` tanimlandi.
   - `ActorTask.options` nesnesine `clinicalTrialsOptions` ve `openFdaOptions` dahil edildi.

2. **Aktor Uygulamalari**:
   - [`src/actors/clinical-trials-actor.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/clinical-trials-actor.ts):
     - ClinicalTrials.gov API v2 entegrasyonu.
     - NCT ID dorudan calisma sorgusu (`/api/v2/studies/{nctId}`).
     - Durum (`status`), hastalik (`condition`), mudahale (`intervention`), anahtar kelime sorgulari ve sayfalandirma (`pageSize`, `pageToken`).
     - LLM-ready yapilandirilmis Markdown uretimi.
     - `SSRFGuard` ve `safeRedirectFetch` ile ozel IP izolasyonu.
   - [`src/actors/open-fda-actor.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/open-fda-actor.ts):
     - openFDA REST API (`api.fda.gov`) entegrasyonu (`drug/label`, `drug/event`, `device/510k`, `food/enforcement`).
     - Otomatik arama kalibi secimi ve sayfalandirma (`limit`, `skip`).
     - 404 bos sonuc durumunda basarili/bos sonuc dondurme guvencesi.
     - LLM-ready yapilandirilmis Markdown uretimi.
     - `SSRFGuard` ve `safeRedirectFetch` ile tam guvenlik.

3. **Manifest ve Kayit Entegrasyonu**:
   - [`src/actors/actor-manifests.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-manifests.ts): `clinical-trials` (`query_clinical_trials`) ve `open-fda` (`query_open_fda`) manifest ve girdi semalari eklendi.
   - [`src/actors/actor-registry.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-registry.ts): Aktorler varsayilan katalogda kaydedildi.
   - [`src/index.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/index.ts): Disa aktarimlar guncellendi.

4. **MCP Motoru & REST Rotalari**:
   - [`src/mcp/protokol-mcp-server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/mcp/protokol-mcp-server.ts): Toplam arac sayisi 23'ten 25'e yukseltildi.
   - [`src/core/server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/server.ts): `POST /api/v1/clinical-trials` ve `POST /api/v1/open-fda` rotalari eklendi.
   - [`src/core/store-router.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/store-router.ts): Store actor run secenekleri ve calisma kayitlari eslendi.
   - [`src/core/openapi-spec.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/openapi-spec.ts): OpenAPI 3.1.0 semasina yeni endpoint'ler eklendi.

5. **Mimari Sema**:
   - [`context/architecture-schema.md`](file:///home/l7v/l7v-dev/play/protokol-7/context/architecture-schema.md): Yeni aktorler ve test suiteleri kaydedildi.

## Dogrulama Sonuclari

- **Birim & Entegrasyon Testleri**:
  ```bash
  NODE_ENV=test npx tsx --test tests/clinical-trials-actor.test.ts tests/open-fda-actor.test.ts tests/server.test.ts tests/protokol-mcp-server.test.ts
  ```
  Tum testler sifir hata ile gecti.

- **Tam Test Suite**:
  - Toplam Test: 390
  - Suite Sayisi: 62
  - Basarisiz: 0

- **Deterministik Dogrulama Boru Hatti**:
  ```bash
  npm run verify
  ```
  - [1/6] Mimari Dosya Butunlugu: [OK]
  - [2/6] Isimlendirme & Jargon Taramasi: [OK]
  - [3/6] Sifir Emoji: [OK]
  - [4/6] Secret Detection: [OK]
  - [5/6] SCA Paket Halusinasyonu: [PASS] (11 paket dogrulandi)
  - [6/6] Biome Lint & Format: [OK]

- **Canli MCP Entegrasyon Dogrulamasi**:
  - `query_open_fda`: `ibuprofen` aramasi yapildi, gercek FDA sunucusundan 1167 kayit icerisinden prospektus bilgileri (endikasyon, uyari, dozaj) canli cekildi.
  - `query_clinical_trials`: `melanoma pembrolizumab` aramasi yapildi, NCT03229278 calismasi protokol ozeti ve uygunluk kriterleri canli cekildi.

---

# Kurumsal Finans ve Mahkeme Ictihatlari (Faz 2 Walkthrough)

## Ozet
Bu dogrulama raporu, **Faz 2: Kurumsal Finans ve Mahkeme Ictihatlari** kapsamindaki `SecEdgarActor` ve `CourtListenerActor` gelistirmelerini, testlerini ve MCP entegrasyonunu belgeler.

## Yapilan Degisiklikler ve Eklemeler

1. **Cekirdek Tipler (`src/core/types.ts`)**:
   - `ActorType` birligine `"sec-edgar"` ve `"court-listener"` eklendi.
   - `SecFilingItem`, `SecEdgarActorTaskOptions`, `SecEdgarActorResult` tanimlandi.
   - `CourtListenerDocumentItem`, `CourtListenerActorTaskOptions`, `CourtListenerActorResult` tanimlandi.
   - `ActorTask.options` nesnesine `secEdgarOptions` ve `courtListenerOptions` dahil edildi.

2. **Aktor Uygulamalari**:
   - [`src/actors/sec-edgar-actor.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/sec-edgar-actor.ts):
     - SEC EDGAR Submissions API (`data.sec.gov/submissions/CIK{cik}.json`) entegrasyonu.
     - CIK formatlama (10 haneli sifir dolgulu CIK) ve bilinen borsa kodlari (AAPL, MSFT, GOOGL, NVDA, AMZN vb.) otomatik donusumu.
     - 10-K, 10-Q, 8-K form filtreleme (`formType`), rapor tarihi ve accession baglanti uretimi (`sec.gov/Archives/edgar/data/...`).
     - SEC zorunlu User-Agent basligi (`SEC_EDGAR_USER_AGENT`).
     - LLM-ready yapilandirilmis Markdown uretimi ve SSRFGuard korumasi.
   - [`src/actors/court-listener-actor.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/court-listener-actor.ts):
     - Free Law Project CourtListener v4 REST API entegrasyonu (`/api/rest/v4/search/` ve `/api/rest/v4/opinions/{id}/`).
     - Arama kriterleri: metin aramasi (`query`), mahkeme (`court`: scotus, ca9 vb.), yargic (`judge`), gorus ID (`opinionId`).
     - Mahkeme ictihatlari, emsal kararlar, atiflar (`citations`), dava docket baglantilari ve gorus metinleri damatimi.
     - LLM-ready yapilandirilmis Markdown uretimi ve SSRFGuard korumasi.

3. **Manifest ve Kayit Entegrasyonu**:
   - [`src/actors/actor-manifests.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-manifests.ts): `sec-edgar` (`query_sec_edgar`) ve `court-listener` (`query_court_listener`) manifestleri eklendi.
   - [`src/actors/actor-registry.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/actors/actor-registry.ts): Aktorler kaydedildi.
   - [`src/index.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/index.ts): Disa aktarimlar guncellendi.

4. **MCP Motoru & REST Rotalari**:
   - [`src/mcp/protokol-mcp-server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/mcp/protokol-mcp-server.ts): Toplam arac sayisi 25'ten 27'ye yukseltildi.
   - [`src/core/server.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/server.ts): `POST /api/v1/sec-edgar` ve `POST /api/v1/court-listener` rotalari eklendi.
   - [`src/core/store-router.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/store-router.ts): Store calistirma secenekleri eslendi.
   - [`src/core/openapi-spec.ts`](file:///home/l7v/l7v-dev/play/protokol-7/src/core/openapi-spec.ts): OpenAPI 3.1.0 semasina yeni endpoint'ler eklendi.

5. **Dogrulama Sonuclari**:
   - **Birim & Entegrasyon Testleri**:
     - `tests/sec-edgar-actor.test.ts`: CIK sorgulama, ticker arama, 10-K form filtreleme, SSRF korumasi.
     - `tests/court-listener-actor.test.ts`: Ictihat aramasi, mahkeme/yargic filtreleri, dogrudan gorus ID sorgusu, SSRF korumasi.
     - `tests/server.test.ts` ve `tests/protokol-mcp-server.test.ts`: 29 testin tamami gecti.
   - **Tam Test Suite**:
     - Toplam Test: 399
     - Suite Sayisi: 62
     - Basarisiz: 0
   - **Deterministik Dogrulama Boru Hatti**:
     - `npm run verify`: [PASS] Tum katmanlar (Mimari, Jargon, Emoji, Secret, SCA, Biome) basarili.
   - **Canli MCP Entegrasyon Dogrulamasi**:
     - `query_sec_edgar`: Apple Inc. (`AAPL`) icin son 10-K yillik raporu gercek SEC EDGAR API'sinden canli cekildi.
     - `query_court_listener`: "fair use software copyright" icin ABD Yuksek Mahkemesi (SCOTUS) emsal kararlari (ABC v. Aereo, MGM v. Grokster) canli cekildi.

---

## Asama 3 — Evrensel Kod Arsivi & Cok Dilli Hukuk (Software Heritage & EUR-Lex)

1. **SoftwareHeritageActor (`src/actors/software-heritage-actor.ts`)**:
   - **SWHID Kalici Tanimlayici Ayrirma**: `swh:1:cnt:` (blob/icerik), `swh:1:dir:` (dizin agaci), `swh:1:rev:` (revizyon) tanimlayicilari cozumlenir.
   - **Kaynak Kod Blob Cekimi**: Ham kod icerigi `/api/1/content/sha1_git:{hash}/raw/` uzerinden guvenli sekilde alinir.
   - **Depo Ziyaret Gecmisi**: Git depo origin URL'si uzerinden en son ziyaret ve snapshot ID'leri `/api/1/origin/{url}/visit/latest/` uzerinden sorgulanir.

2. **EurLexActor (`src/actors/eur-lex-actor.ts`)**:
   - **CELEX Tanimlayici Cozumu**: AB mevzuati standart CELEX kodlari (ornek: `32016R0679` - GDPR, `32024R1689` - EU AI Act) uzerinden dogrudan EUR-Lex portalindan cekilir.
   - **Cok Dilli Metinler**: `en`, `fr`, `de`, `es`, `it` gibi AB dillerinde HTML formatinda resmi hukuki metin ayiklanir.
   - **CELLAR SPARQL Entegrasyonu**: Semantic Web SPARQL endpoint'i uzerinden CELEX ve baslik aramalari yapilir.

3. **Manifest & Katalog Entegrasyonu**:
   - `query_software_heritage` ve `query_eur_lex` manifestleri `src/actors/actor-manifests.ts` dosyasina eklendi.
   - Aktorler kaydedildi ve disa aktarildi.
   - Protokol MCP sunucusunda toplam aktif arac sayisi 27'den 29'a yukseltildi.
   - REST rotalari: `POST /api/v1/software-heritage` ve `POST /api/v1/eur-lex`.

4. **Dogrulama Sonuclari**:
   - **Testler**: 408 testin 408'i gecti (62 suite).
   - **Boru Hatti**: `npm run verify` basariyla tamamlandi (Exit code: 0).
   - **Canli MCP Entegrasyonu**:
     - `query_software_heritage`: Linux kernel deposunun Software Heritage uzerindeki 491. snapshot ziyareti canli olarak dogrulandi.
     - `query_eur_lex`: GDPR CELEX `32016R0679` direktifi cok dilli mevzuat motorundan canli olarak basariyla cekildi.

---

## Asama 4 — Pedagojik & Acik Universite Ders Materyalleri (OpenStax & MIT OCW)

1. **OpenStaxActor (`src/actors/openstax-actor.ts`)**:
   - **Ders Kitabi Katalogu & Wagtail Arama**: OpenStax CMS API (`/apps/cms/api/v2/pages/?type=books.Book`) uzerinden 100+ universite ve AP duzeyinde akran denetimli ders kitabi taranir.
   - **Detay & PDF/Webview Baglantilari**: Kitap ID veya slug'i ile lisans, yuksek cozunurluklu PDF indirme baglantisi, yazar bilgileri ve web okuyucu baglantisi alinir.
   - **Bolum/Madde Icerik Ayiklama**: HTML webview bolumleri Cheerio ile arindirilarak temiz GFM Markdown formatina donusturulur.

2. **MitOcwActor (`src/actors/mit-ocw-actor.ts`)**:
   - **MIT OpenSearch Entegrasyonu**: `https://open.mit.edu/api/v0/search/` POST ucu ile MIT OCW'ye ozgu filtreleme (`offered_by: OCW`) ve cok alanli terim aramasi yapilir.
   - **Ders & Mufredat Detayi**: `https://ocw.mit.edu/courses/{slug}/data.json` uzerinden birincil ders kodu, ogretim uyeleri, akademik seviye (Lisans/Lisansustu), donem, yil, kaynak tipleri (video, sinav, odev) ve mufredat ozeti ayiklanir.

3. **Manifest, Katalog & MCP Entegrasyonu**:
   - `query_openstax` ve `query_mit_ocw` manifestleri `src/actors/actor-manifests.ts` dosyasina eklendi.
   - Aktorler varsayilan katalogda kaydedildi ve `src/index.ts` uzerinden disa aktarildi.
   - Protokol MCP sunucusunda toplam aktif arac sayisi 29'dan 31'e yukseltildi.
   - REST rotalari: `POST /api/v1/openstax` ve `POST /api/v1/mit-ocw`.

4. **Dogrulama Sonuclari**:
   - **Birim & Entegrasyon Testleri**:
     - `tests/openstax-actor.test.ts`: Katalog listeleme, kitap ID sorgulama, bolum HTML donusumu, SSRF korumasi (4 test).
     - `tests/mit-ocw-actor.test.ts`: Ders aramasi, slug uzerinden mufredat veri cekimi, SSRF korumasi (3 test).
     - `tests/server.test.ts`: Yeni REST rotalari dogrulandi.
     - `tests/protokol-mcp-server.test.ts`: 31 MCP araci listelendi ve test edildi.
   - **Tam Test Suite**: 417 testin 417'si gecti (62 test suite).
   - **Deterministik Dogrulama**: `npm run verify` basariyla tamamlandi (Exit code: 0).
   - **Canli MCP & REST Entegrasyon Dogrulamasi**:
     - `query_openstax`: Canli OpenStax servisinden "physics" ders kitabi basariyla cekildi (`College Physics`).
     - `query_mit_ocw`: Canli MIT OCW servisinden "computer science" dersleri (6.042J) ve "linear algebra" (18.06) mufredati basariyla cekildi.

---

## Ozet & Nihai Durum

8 yeni kurumsal platform aktoru (ClinicalTrials.gov, openFDA, SEC EDGAR, CourtListener, Software Heritage, EUR-Lex, OpenStax, MIT OCW) 4 asama halinde eksiksiz tamamlanmistir:
- Toplam Test Sayisi: 417 (0 basarisiz).
- Aktif MCP Arac Sayisi: 31 arac.
- Dogrulama Boru Hatti: Tum katmanlar (Mimari, Jargon, Sifir Emoji, Secret, SCA, Biome) %100 basarili.

