# Kurumsal ve Akademik LLM Veri Cikarim Aktorleri Mimari Plani

Bu plan, LLM egitimi, RAG boru hatlari ve alan uyarlamasi (domain adaptation) icin yuksek sinyal-gurultu oranina sahip 8 yeni platformun `protokol-7` mimarisine entegre edilmesini hedefler.

## Kapsam ve Ilkeler
1. **Sifir Emoji ve Pazarlama Jargonsuzlugu**: Kod, sema ve dokumantasyonda purely teknik tanimlar kullanilir.
2. **SSRF Korumasi**: Tum giden HTTP istekleri `SSRFGuard` ve `safeRedirectFetch` suzgecinden gecirilir.
3. **Deterministik Semalar**: Tum aktorler Zod girdi semalarina, `ActorManifest` tanimlarina ve `ActorRegistry` entegrasyonuna sahip olur.
4. **Katmanli Cikarim**: 
   - Zengin JSON metadata
   - LLM-ready sadelestirilmis Markdown/metin katmani
   - Token butce kontrolu (`ContextGuard`)

---

## Faz Dagilimi

### Faz 1: Biyomedikal ve Klinik Regulasyon Motoru
- **`ClinicalTrialsActor` (`clinical-trials`)**:
  - Kaynak: ClinicalTrials.gov API v2 (`clinicaltrials.gov/api/v2/studies`)
  - Girdi: `query`, `condition`, `intervention`, `status`, `pageSize`, `pageToken`
  - Cikti: NCTId, baslik, protokol ozeti, dahil etme/haric tutma (eligibility) kriterleri, sonuc olcutleri.
  - MCP Araci: `query_clinical_trials`
  - REST Endpoint: `POST /api/v1/clinical-trials`
- **`OpenFdaActor` (`open-fda`)**:
  - Kaynak: openFDA REST API (`api.fda.gov/drug/label.json`, `event.json`, `device/510k.json`)
  - Girdi: `endpoint`, `search`, `limit`, `skip`
  - Cikti: Ilac prospektusleri, etken maddeler, endikasyonlar, yan etkiler, cihaz onay kayitlari.
  - MCP Araci: `query_open_fda`
  - REST Endpoint: `POST /api/v1/open-fda`

### Faz 2: Finansal Raporlama ve Yargi Ictihadi Motoru
- **`SecEdgarActor` (`sec-edgar`)**:
  - Kaynak: SEC Submissions API (`data.sec.gov/submissions/CIK{cik}.json`) ve SEC sirket arama
  - Girdi: `cik`, `ticker`, `form` (10-K, 10-Q, 8-K), `limit`
  - Cikti: Sirket kunyesi, son bildirimler, dosya URL'leri, finansal rapor metin ozetleri.
  - MCP Araci: `query_sec_edgar`
  - REST Endpoint: `POST /api/v1/sec-edgar`
- **`CourtListenerActor` (`court-listener`)**:
  - Kaynak: CourtListener REST API v4 (`www.courtlistener.com/api/rest/v4/search/`)
  - Girdi: `query`, `court`, `judge`, `type`, `page`, `pageSize`
  - Cikti: Mahkeme kararlari (opinions), emsal ictihatlar, gerekceli karar metinleri, dava kunyesi.
  - MCP Araci: `query_court_listener`
  - REST Endpoint: `POST /api/v1/court-listener`

### Faz 3: Kaynak Kod ve Cok Dilli Hukuk Standartlari
- **`SoftwareHeritageActor` (`software-heritage`)**:
  - Kaynak: Software Heritage Web API (`archive.softwareheritage.org/api/1/`)
  - Girdi: `originUrl`, `lookupType`, `swhid`
  - Cikti: Merkle DAG repo anlik goruntuleri, dogrulanmis kaynak kod dizinleri ve icerik SHA1 hash'leri.
  - MCP Araci: `query_software_heritage`
  - REST Endpoint: `POST /api/v1/software-heritage`
- **`EurLexActor` (`eur-lex`)**:
  - Kaynak: EUR-Lex REST / CELLAR SPARQL Endpoint
  - Girdi: `celex`, `query`, `language` (varsayilan: ENG)
  - Cikti: AB direktifleri, tuzukleri ve Adalet Divani kararlarinin cok dilli madde metinleri.
  - MCP Araci: `query_eur_lex`
  - REST Endpoint: `POST /api/v1/eur-lex`

### Faz 4: Pedagojik ve Acik Ders Kitaplari Motoru
- **`OpenStaxActor` (`open-stax`)**:
  - Kaynak: OpenStax acik lisansli ders kitaplari deposu ve API'si
  - Girdi: `bookSlug`, `chapter`, `query`
  - Cikti: Ders kitabi bolumleri, ogrenim hedefleri, kavram aciklamalari ve cozumlu sorular.
  - MCP Araci: `query_open_stax`
  - REST Endpoint: `POST /api/v1/open-stax`
- **`MitOcwActor` (`mit-ocw`)**:
  - Kaynak: MIT OpenCourseWare acik icerik depolari (`github.com/mitodl/courses`)
  - Girdi: `courseId`, `contentType`, `query`
  - Cikti: Ders notlari, odevler, cozumlu sinav sorulari ve syllabus metinleri.
  - MCP Araci: `query_mit_ocw`
  - REST Endpoint: `POST /api/v1/mit-ocw`

---

## Dogrulama ve Entegrasyon
1. Her aktor icin bagimsiz birim ve entegrasyon test suite'i (`tests/<actor-name>.test.ts`).
2. `src/actors/actor-manifests.ts` ve `src/actors/actor-registry.ts` kayitlari.
3. `src/mcp/protokol-mcp-server.ts` stdio ve HTTP MCP arac deklarasyonu (toplam 31 arac).
4. `src/core/openapi-spec.ts` uzerinde OpenAPI 3.1.0 semalarinin tanimlanmasi.
5. `context/architecture-schema.md` dosyasinin atomik guncellenmesi.
6. `npm test` ve `npm run verify` tam deterministik boru hatti dogrulamasi.
