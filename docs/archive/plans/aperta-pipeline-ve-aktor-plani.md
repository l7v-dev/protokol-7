# TUBITAK ULAKBIM Aperta Boru Hatti ve Cekirdek Aktor Mimarisi Plani

Bu plan; TUBITAK ULAKBIM Aperta Turkiye Acik Arsivi (InvenioRDM tabanli acik bilim ve arastirma veri deposu) icin OAI-PMH ve Invenio REST API v1 protokollerini entegre eden yuksek verimli, sifir yerel disk artikli veri akis boru hattinin (`pipelines/api_stream/aperta/`), iliskisel SQLite katalog defterinin (`data/catalogs/aperta_catalog.sqlite`), Google Drive senkronizasyonunun, TypeScript mikroservis aktorunun (`ApertaActor`, `POST /api/v1/aperta`, `query_aperta` MCP araci), sistem sozlesmelerinin (`contracts/`) ve tam dogrulama testlerinin gelistirilmesini tanimlar.

---

## 1. Hedef Platform Analizi ve Teknik Parametreler

1. **Platform Kimligi:**
   - **Hedef:** TUBITAK ULAKBIM Aperta (Turkiye Acik Arsivi)
   - **Altyapi:** CERN Invenio 3 / InvenioRDM acik veri havuzu mimarisi.
   - **URL:** `https://aperta.ulakbim.gov.tr/`
   - **Toplam Envanter:** 91.188 kayit (makaleler, tezler, veri setleri, arastirma raporlari, yazilimlar).

2. **Protokoller ve Erisim Noktalari:**
   - **OAI-PMH 2.0 Servisi:** `https://aperta.ulakbim.gov.tr/oai2d`
     - Desteklenen formatlar: `oai_dc`, `datacite`, `datacite4`, `marcxml`, `marc21`, `dcat`.
     - Sayfalama Mantigi: `resumptionToken` ile kesintisiz katalog taramasi (`cursor` ve `completeListSize="91188"`).
     - Kullanim Alani: 91K kaydin toplu, kararlı ve derin sayfalama kisitlamalarina takilmadan akitilmasi.
   - **Invenio REST API:** `https://aperta.ulakbim.gov.tr/api/records`
     - Arama Parametreleri: `q=...`, `sort=...`, `page=...`, `size=...` (Elasticsearch `max_result_window=10000` siniri mevcuttur).
     - Tekil Kayit Detayi: `GET https://aperta.ulakbim.gov.tr/api/records/{id}`
     - Dosya / Ek Nesne API: `GET https://aperta.ulakbim.gov.tr/api/records/{id}/files/{filename}/content`
     - Nesne Deposu: `https://s3ank.ulakbim.gov.tr/`
     - Hız Sinirlamasi: `x-ratelimit-limit: 10`, `retry-after: 1`. 1.0 - 1.5 saniyelik nezaket gecikmesi zorunludur.

3. **Guven Kademesi (Trust Tier):**
   - **Tier 1 (Oneri ve Izole Taslak):** Yeni modul ve dosya olusturma, izole boru hatti ve aktor entegrasyonu.

---

## 2. Mimari Prensipler ve Degismezler (Invariants)

1. **Katman Izolasyonu:**
   - Python Akis Boru Hatti (`pipelines/api_stream/aperta/`): Toplu OAI-PMH ve REST tarama, sayfalama, Zstandard Parquet parcalama, Google Drive senkronizasyonu ve iliskisel katalog yonetimi.
   - TypeScript Aktoru (`src/actors/corpus/aperta-actor.ts`): Canli REST ve MCP sorgulari, anlik arama, JSON ve LLM-ready GFM markdown sentezi.
   - Kontrol Duzlemi Defteri: `data/catalogs/aperta_catalog.sqlite` uzerinde dayanikli (durable) ACID durum takibi.

2. **Sifir Yerel Disk Artigi (Zero Disk Residue):**
   - Uretilen Parquet shard'lari Google Drive `Aperta/` hedef klasorune aktarildiktan ve cift kriptografik dogrulama (yerel MD5 == uzak MD5) saglandiktan sonra yerel diskten derhal silinir (`purge_on_success=True`).

3. **Metadata ve Agir Yuk (Asset) Ayrimi:**
   - Metadata akis sureci yalnizca kayit bilgilerini ve bagli dosya metaverilerini (`aperta_files` tablosu) indeksler.
   - Veri setlerinin ikili dosyalari (PDF, TAR.GZ, CSV, ZIP vb.) ayri bir asenkron indirme sureci icin `file_status = 'pending'` olarak isaretlenir; ana akis bloke edilmez.

---

## 3. Uygulama Adimlari

### Faz 1: Kontrol Duzlemi Sozlesmeleri ve Tanimlayicilar
- [ ] `contracts/source-descriptors/aperta.json`: Kaynak tanimlayici sozlesmesi (`source_id: aperta`, `method: oai_pmh`, `budget`, `rights_status: approved`, `purpose: LLM Pre-training and Academic RAG Corpus`).
- [ ] `contracts/field-mappings/aperta.json`: Aperta / Invenio alanlarinin protokol-7 ortak semasina donusum haritasi.

### Faz 2: Python Akis Boru Hatti (`pipelines/api_stream/aperta/`)
- [ ] `downloader.py`: `ApertaDownloader`
  - OAI-PMH 2.0 (`oai_dc` ve `datacite` formatlari) resumption-token akisi.
  - Invenio REST API v1 (`/api/records`) anlik arama ve tekil kayit sorgulama yetenegi.
  - `ThreadSafeRateLimiter` ile Invenio 10 req/s kuralina uyumlu nezaket araligi ve eksponansiyel geri cekilme (exponential backoff).
- [ ] `cleaner.py`: `ApertaCleaner`
  - Baslik, yazar, ozet, bilim dali/kategori (`aperta:science_branches`), anahtar kelime, lisans ve iliskili dosya metaverisi temizligi.
  - Karakter, kelime ve veri seti metriklerinin hesaplanmasi.
- [ ] `ledger.py`: `ApertaLedger`
  - `data/catalogs/aperta_catalog.sqlite` veritabaninda `aperta_records` ve `aperta_files` tablolarinin olusturulmasi.
  - ACID checkpoint yonetimi ve resumptionToken durumu.
- [ ] `packer.py`: `ApertaParquetSharder`
  - 50.000 kayit veya 512 MB esiginde Zstandard seviye 6 sikistirmali Parquet dosyalama.
  - SHA-256 ve MD5 saglama toplamlarinin uretimi.
- [ ] `pdf_tar_packer.py`: `ApertaPdfTarSharder`
  - Ham PDF ve veri ikililerinin WebDataset/Cold Vault uyumlu 10 GB - 50 GB (maks 51 GB) TAR.GZ arsiv paketleyicisi.
  - Dinamik disk headroom guvenlik korumasi (`min_free_disk_gb=25.0 GB`).
  - Cift kriptografik saglama (SHA-256 + MD5).
- [ ] `pdf_downloader.py`: `ApertaPdfDownloader`
  - SQLite tablosundaki `aperta_files` kuyrugundan PDF linklerini ceken, dogrulayan ve Google Drive'a TAR.GZ veya dogrudan dosya olarak aktaran asenkron isci.
  - PDF'lerin silinmeme garantisi: Drive MD5 dogrulamasi tamamlanmadan gecici tampon temizlenmez.
- [ ] `drive_sync.py`: `ApertaDriveSync`
  - Google Drive `Aperta/` (ve `Aperta/PDFs/` veya `Aperta/Raw_Archives/`) hedef klasorlerine Parquet ve TAR.GZ arsivlerinin aktarimi.
- [ ] `orchestrator.py`: `ApertaOrchestrator`
  - CLI arayuzu (`--all`, `--limit`, `--batch-size`, `--method oai|rest`, `--status`, `--dry-run`, `--download-pdfs`).
- [ ] `test_aperta_pipeline.py`: Python birim ve mock entegrasyon testleri.

### Faz 3: TypeScript Mikroservis Aktoru ve Sistem Entegrasyonlari
- [ ] `src/actors/corpus/aperta-actor.ts`: `ApertaActor` implementasyonu (arama, kayit detayi, dosya listesi, GFM Markdown formatlama).
- [ ] `src/actors/corpus/domains/academic.ts`: `ApertaActor`'un akademik etki alanina eklenmesi.
- [ ] `src/actors/actor-manifests.ts`: `aperta` manifesti ve `query_aperta` MCP tanimi.
- [ ] `src/actors/actor-registry.ts`: `ApertaActor` sinifinin kayit defterine baglanmasi.
- [ ] `src/api/server.ts`: `POST /api/v1/aperta` ve `POST /aperta` HTTP uc noktalarinin yonlendirilmesi.
- [ ] `src/mcp/protokol-mcp-server.ts`: `query_aperta` aracinin MCP sunucusuna eklenmesi.
- [ ] `tests/aperta-actor.test.ts`: TypeScript birim ve rota testleri.

### Faz 4: Yonetimsel Entegrasyonlar ve Veritabanı Haritalama
- [ ] `package.json`: `"aperta:pipeline"` ve test script'lerinin tanimlanmasi.
- [ ] `scripts/sync-dbx-connections.py`: `protokol-aperta` baglantisinin dbx sistemine kaydedilmesi.
- [ ] `context/architecture-schema.md`: Yeni bilesenlerin ve veri yapisinin mimari semaya islenmesi.

### Faz 5: Dogrulama ve Pilot Calisma (Verification)
- [ ] Birim testlerinin kosturulmasi (`pytest` ve `tsx --test`).
- [ ] 50 kayitlik pilot calisma ile canli OAI-PMH ve REST akislarinin, SQLite defterinin ve Parquet paketlemesinin dogrulanmasi.
- [ ] `npm run verify` calistirilarak 6 asamali dogrulama hattinin tamamlanmasi.
