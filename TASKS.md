# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- [ ] **GitHub Actions Uzak Wikipedia LLM Parquet ETL Boru Hatti** — `Tier: 1` — Durum: [1] arc, tk, lzh, la tamamlandi ve Google Drive'a muhurlendi (Drive'da 22 dil tamam). [2] dewiki (Run 36305934705) ve [3] enwiki (Run 36306339969) uzak sunucularda aktif calisiyor. Sifir yerel donanim yuku.

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
