# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [x] **Proje Konsolidasyonu, Adlandirma Disiplini, Atil Dosya Temizligi ve Tasinabilirlik** — `Tier: 2` — `trash/` klasoru olusturuldu; bagimsiz `wikipedia_pipeline/`, artik loglar ve gecici XML dumplar tasindi. `bigdata_pipeline` pazarlama adlandirmasi `corpus_pipeline` ile degistirildi. 31 aktor `src/actors/README.md` ve `examples/actors/` altinda ornek JSON konfigurasyonlari ile belgelendi. `Dockerfile`, `docker-compose.yml` ve `.github/workflows/ci.yml` uretildi; 438/438 test ve 6 asamali dogrulama basariyla gecti.
- [x] **GitHub Actions Uzak Wikipedia LLM Parquet ETL Boru Hatti** — `Tier: 1` — Durum: enwiki (6.581.817 makale) ve dewiki uzak sunucularda basariyla tamamlandi; zstd Parquet sardlari ve manifestler Google Drive'a MD5 dogrulamasiyla yuklendi. 24 dil uzak bulut altyapisinda sifir yerel yukle muhurlendi.
- [x] **LLM Veri Fabrikasi Boru Hatti Damitma Katmani (Normalizasyon, Kalite Kapisi, Tekillesme ve Denetim Defteri)** — `Tier: 2` — `TextNormalizer` (Unicode NFKC, bosluk kanonizasyonu, kriptografik SHA-256 soykutuk izleme), `QualityFilter` (FineWeb/Gopher sezgisel kalite metrikleri ve gecis/veto kapisi), `DedupFilter` (birebir SHA-256 ve 64-bit SimHash yakin benzerlik tespiti) tamamlandi. `PipelineConfigSchema` ve `PipelineRunner` uzerine entegre edilerek `RegistryDatabase.recordVerificationAudit` ve `recordDatasetShard` baglandi; 449/449 test ve 6 asamali dogrulama basariyla gecti.

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 5, eskiler archive/'a taşınır)

- [x] **Kurumsal ve Akademik LLM Veri Cikarim Aktorleri (Faz 4: OpenStaxActor ve MitOcwActor)** — `Tier: 1` — OpenStax CMS/Wagtail API ve MIT OpenCourseWare OpenSearch DSL aktorleri, 30. ve 31. MCP araclari (`query_openstax`, `query_mit_ocw`), `POST /api/v1/openstax` ve `POST /api/v1/mit-ocw` REST rotalari; 417/417 test ve deterministik dogrulama hatti basariyla gecti.
- [x] **Kurumsal ve Akademik LLM Veri Cikarim Aktorleri (Faz 3: SoftwareHeritageActor ve EurLexActor)** — `Tier: 1` — Software Heritage SWHID kayitlari ve EUR-Lex CELLAR SPARQL/HTML aktorleri, 28. ve 29. MCP araclari (`query_software_heritage`, `query_eur_lex`), `POST /api/v1/software-heritage` ve `POST /api/v1/eur-lex` REST rotalari; 408/408 test ve deterministik dogrulama hatti basariyla gecti.
- [x] **Kurumsal ve Akademik LLM Veri Cikarim Aktorleri (Faz 2: SecEdgarActor ve CourtListenerActor)** — `Tier: 1` — SEC EDGAR Submissions API ve CourtListener v4 REST aktorleri, 26. ve 27. MCP araclari (`query_sec_edgar`, `query_court_listener`), `POST /api/v1/sec-edgar` ve `POST /api/v1/court-listener` REST rotalari; 399/399 test ve dogrulama basariyla gecti.
- [x] **Kurumsal ve Akademik LLM Veri Cikarim Aktorleri (Faz 1: ClinicalTrialsActor ve OpenFdaActor)** — `Tier: 1` — ClinicalTrials.gov API v2 ve openFDA REST aktorleri, 24. ve 25. MCP araclari (`query_clinical_trials`, `query_open_fda`), `POST /api/v1/clinical-trials` ve `POST /api/v1/open-fda` REST rotalari; 390/390 test ve dogrulama basariyla gecti.
- [x] **Kitap, Dergi ve Sureli Yayin Cikarim Motoru (Faz 4: REST API, OpenAPI 3.1.0 ve Uc-Uca Dogrulama)** — `Tier: 1` — tamamlandı; `POST /api/v1/epub`, `POST /api/v1/dergipark`, `POST /api/v1/internet-archive` REST rotalari, OpenAPI 3.1.0 sema tanimlari ve interaktif Swagger dokumantasyonu; 381/381 test ve 6 katmanli deterministik dogrulama basariyla gecti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
