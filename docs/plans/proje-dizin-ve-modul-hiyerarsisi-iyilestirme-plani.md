# Plan: Protokol-7 Kurumsal Dizin ve Modül Hiyerarşisi İyileştirme Planı

Bu doküman, `protokol-7` projesindeki dağınık dosya/klasör yapılarını, heterojen script yığınlarını, veri dizini kalıntılarını ve 69 aktörlük geniş korpus mimarisini kurumsal standartlarda kategorize edilmiş, bakımı kolay ve modüler bir mimariye dönüştürme planını tanımlar.

---

## 1. Mevcut Durum Analizi ve Dağınıklık Tespiti

Yapılan detaylı denetimde 4 ana bölgede mimari katman kirliliği ve dağınıklık tespit edilmiştir:

### 1.1. `scripts/` Dizini Aşırı Yüklenmesi (36 Parça Heterojen Yığın)
`scripts/` dizininde birbiriyle ilgisiz üç farklı paradigma tek bir klasöre yığılmıştır:
1. **Node.js Geliştirici ve Doğrulama Araçları (14 dosya):** `doctor.mjs`, `pulse.mjs`, `checkpoint.mjs`, `verify-pipeline.mjs`, `sca-check.mjs`, `telemetry-logger.mjs` vb.
2. **Akademik & Bilimsel Hasat Boru Hatları (6 bağımsız Python paketi):** `openalex_snapshot_pipeline/`, `openalex_pipeline/`, `semanticscholar_pipeline/`, `gutenberg_pipeline/`, `stackexchange_pipeline/`, `corpus_pipeline/`.
3. **Wikimedia Çok Dilli Dump Boru Hatları (8 Python paketi + 7 JSON konfigürasyonu + 2 master runner):** `wikibooks_pipeline/`, `wikinews_pipeline/`, `wikiquote_pipeline/`, `wikisource_pipeline/`, `wikispecies_pipeline/`, `wikiversity_pipeline/`, `wikivoyage_pipeline/`, `wiktionary_pipeline/`, `*_dbs.json` dosyaları ve `run_*.py` betikleri.

### 1.2. `data/` Dizini Kirliliği (50+ Öğe)
- **30+ Dil Parquet Klasörü:** `bgwiki_parquet/`, `zhwiki_parquet/`, `dewiki_parquet/` gibi Wikipedia çıktıları doğrudan `data/` köküne saçılmıştır.
- **10 SQLite Veritabanı:** `catalog.sqlite`, `openalex_snapshot_catalog.sqlite`, `gutenberg_catalog.sqlite` vb. doğrudan `data/` kökündedir.
- **8 Geçici Dizin:** `temp_openalex_snapshot/`, `temp_gutenberg/`, `temp_stackexchange/` vb. geçici kazıma dizinleri kalıcı veritabanlarıyla aynı dizinde yer almaktadır.

### 1.3. `src/actors/corpus/` Dizin Yoğunluğu (59 Aktör Tek Klasörde)
- `src/actors/web/` (8 aktör) ve `src/actors/documents/` (4 aktör) derli topludur.
- Ancak `src/actors/corpus/` altında 59 farklı aktör (tıp, hukuk, felsefe, kod, matematik, vikipedi) tek bir düz dizinde tutulmaktadır.

### 1.4. Kök Dizin Hijyeni
- `openalex_snapshot.log`: Çalışma logu kök dizine bırakılmıştır (kurallara göre `logs/` veya `ledger/logs/` altında olmalıdır).
- `run_openalex.sh`: Kök dizinde sahipsiz shell betiği.
- `credentials.json`, `token.json`: Kök dizinde yer almaktadır.

---

## 2. Hedef Kurumsal Dizin Taksonomisi

```text
protokol-7/
├── config/                                 # Proje çalışma zamanı ve servis konfigürasyonları
│   ├── auth/                               # OAuth token ve API anahtar referansları (.gitignored)
│   └── dbs/                                # Harici dump DB referans listeleri (*_dbs.json)
│
├── data/                                   # Veri katmanı (tamamen alt kategorilere ayrılmış)
│   ├── catalogs/                           # ACID SQLite işlem defterleri
│   │   ├── catalog.sqlite                  # Protokol-7 merkezi sicil defteri
│   │   ├── openalex_snapshot_catalog.sqlite
│   │   ├── gutenberg_catalog.sqlite
│   │   └── wikimedia_*.sqlite
│   ├── parquets/                           # Yerel Parquet veri depoları
│   │   ├── wikimedia/                      # Çok dilli Wikipedia/Wikimedia parçaları
│   │   └── corpus/                         # Yerel saklanan diğer korpus parçaları
│   └── scratch/                            # Geçici işlem ve indirme tamponları (Sıfır disk artığı)
│       ├── openalex_snapshot/
│       ├── gutenberg/
│       └── wikimedia/
│
├── logs/                                   # Sistem ve pipeline çalışma logları
│   └── openalex_snapshot.log
│
├── scripts/
│   ├── ops/                                # Operasyonel & Doğrulama CLI Araçları (Node.js)
│   │   ├── checkpoint.mjs
│   │   ├── consolidate-memory.mjs
│   │   ├── doctor.mjs
│   │   ├── generate-connectome.mjs
│   │   ├── logs.mjs
│   │   ├── omega-mcp-server.mjs
│   │   ├── omega-memory.mjs
│   │   ├── pipedream-cli.mjs
│   │   ├── pulse.mjs
│   │   ├── sca-check.mjs
│   │   ├── scaffold-actor.mjs
│   │   ├── telemetry-logger.mjs
│   │   ├── terminal-theme.mjs
│   │   └── verify-pipeline.mjs
│   │
│   └── pipelines/                          # Tüm ETL / Hasat Boru Hatları (Python)
│       ├── corpus/                         # Akademik, Bilimsel ve Kod Korpus Boru Hatları
│       │   ├── openalex_snapshot/          # AWS S3 Parquet Snapshot İndirici & Paketleyici
│       │   ├── openalex_api/               # REST API Cursor Hasatçısı
│       │   ├── semantic_scholar/           # S2 Bulk API + OCR Hattı
│       │   ├── gutenberg/                  # Gutenberg Kitap & Görsel Hattı
│       │   ├── stack_exchange/             # Archive.org 7z Soru-Cevap Hattı
│       │   └── common/                     # Ortak tekilleştirici ve sharder araçları
│       │
│       └── wikimedia/                      # Çok Dilli Wikimedia XML Dump Boru Hatları
│           ├── wikibooks/
│           ├── wikinews/
│           ├── wikiquote/
│           ├── wikisource/
│           ├── wikispecies/
│           ├── wikiversity/
│           ├── wikivoyage/
│           ├── wiktionary/
│           └── runners/                    # Master orkestratörler (run_all_wikimedia.py vb.)
│
├── src/
│   ├── actors/                             # Alan Aktörleri (Kategorize)
│   │   ├── web/                            # Web, tarayıcı, sitemap, serp (8 aktör)
│   │   ├── documents/                      # PDF, EPUB, Arşiv, OCR (4 aktör)
│   │   └── corpus/                         # Geniş Külliyat Aktörleri (5 alt domain)
│   │       ├── academic/                   # arxiv, openalex, s2, europe-pmc, openreview, dergipark, clinical-trials, open-fda, openstax, mit-ocw, saglik-ekutuphane (11 aktör)
│   │       ├── legal/                      # court-listener, eur-lex, sec-edgar, resmi-gazete, yargitay, danistay, anayasa-mahkemesi, kap, google-patents (9 aktör)
│   │       ├── reasoning_code/             # github, hacker-news, stack-exchange, math-reasoning, code-eval, proofwiki, lean-mathlib, metamath, devdocs, rosetta-code, papers-with-code, huggingface-datasets (12 aktör)
│   │       ├── wikimedia/                  # wikipedia, wikisource, wiktionary, wikiquote, wikibooks, wikiversity, wikivoyage, wikinews, wikispecies, wikidata (11 aktör)
│   │       └── philosophy_humanities/      # stanford-phil, internet-phil, philpapers, gutenberg, ktb-ekitap, perseus-dl, sacred-texts, lesswrong, internet-archive, libretexts, open-textbook, youtube-transcripts, ietf-rfc (13 aktör)
│   │
│   ├── api/                                # REST API, Router'lar, RegistryDatabase
│   ├── browser/                            # Playwright havuzu, gizlilik, kaynak bloklama
│   ├── extractors/                         # HTML, PDF, Markdown, Tablo çıkarıcılar
│   ├── pipeline/                           # TypeScript bildirimsel YAML pipeline motoru
│   └── mcp/                                # MCP sunucu protokol adaptörleri
│
└── tests/                                  # Birim ve Entegrasyon Testleri
```

---

## 3. Canlı Süreç ve Kısıt Yönetimi (Kritik Mimari Not)

> [!WARNING]
> Şu anda sistemde **PID 958059** olarak OpenAlex S3 Snapshot pipeline'ı canlı çalışmaktadır (`scripts/openalex_snapshot_pipeline/orchestrator.py --all --max-part-gb 50.0`).
> Bu süreç `scripts/openalex_snapshot_pipeline/` dosyalarını aktif olarak okumakta ve `data/openalex_snapshot_catalog.sqlite` veritabanına yazmaktadır.
> 
> **Kural:** Canlı işlem tamamlanmadan veya kontrollü bir şekilde geçici duraklatma (checkpoint) yapılmadan `scripts/openalex_snapshot_pipeline/` klasörü doğrudan taşınamaz; aksi halde çalışan Linux süreci referans hatası alarak çöker.
> 
> **Çözüm:** 
> 1. Düzenleme aşamasında geriye dönük uyumluluk (backward compatibility) için **symlink (sembolik link)** köprüleri kurulacaktır.
> 2. Veya canlı işlem `Ctrl+C` / `SIGINT` ile zarifçe durdurulup, taşıma tamamlanıp yeni yoldan kaldığı partisyondan devam ettirilecektir (SQLite defteri tam durumu korumaktadır).

---

## 4. Uygulama Adımları ve Etki Alanı (Blast Radius)

### Faz 1: Kök Dizin ve Operasyonel Script Temizliği (Düşük Risk - Tier 1)
- [ ] `openalex_snapshot.log` dosyasını `logs/` dizinine taşıma.
- [ ] `run_openalex.sh` gereksiz betiğini tasfiye etme.
- [ ] `scripts/*.mjs` operasyonel araçlarını `scripts/ops/` altına taşıma.
- [ ] `package.json` içindeki `pulse`, `doctor`, `checkpoint`, `verify` yollarını güncelleme.
- [ ] `scripts/verify-pipeline.mjs` yol denetimlerini güncelleme.

### Faz 2: Wikimedia ve Korpus Pipeline Düzenlemesi (Orta Risk - Tier 2)
- [ ] `scripts/pipelines/corpus/` ve `scripts/pipelines/wikimedia/` dizin hiyerarşisini oluşturma.
- [ ] `wikibooks_dbs.json`, `wikinews_dbs.json` vb. konfigürasyonları `scripts/pipelines/wikimedia/configs/` içine alma.
- [ ] Wikimedia dump pipeline'larını (`wikibooks_pipeline`, `wikiquote_pipeline` vb.) `scripts/pipelines/wikimedia/` altına taşıma.
- [ ] Korpus pipeline'larını (`gutenberg_pipeline`, `stackexchange_pipeline`, `semanticscholar_pipeline`, `openalex_pipeline`) `scripts/pipelines/corpus/` altına taşıma.
- [ ] Canlı çalışan `openalex_snapshot_pipeline` için `scripts/openalex_snapshot_pipeline` yoluna sembolik bağ (symlink) bırakarak yeni yerini `scripts/pipelines/corpus/openalex_snapshot/` yapma.
- [ ] `package.json`'daki Python pipeline çalıştırma komutlarını güncelleme.

### Faz 3: `data/` Dizini İzolasyonu (Düşük Risk - Tier 1)
- [ ] `data/catalogs/`, `data/parquets/wikimedia/`, `data/scratch/` dizinlerini açma.
- [ ] Dağınık duran `*wiki_parquet` klasörlerini `data/parquets/wikimedia/` altına taşıma.
- [ ] SQLite katalogları için geriye dönük uyumluluk koruyarak yapılandırma hazırlama.

### Faz 4: `src/actors/corpus/` Alan Sınıflandırması (Yüksek Risk - Tier 3)
- [ ] `src/actors/corpus/` altında 5 alt alan dizini (`academic/`, `legal/`, `reasoning_code/`, `wikimedia/`, `philosophy_humanities/`) açma.
- [ ] 59 aktör dosyasını ilgili alt alana taşıma.
- [ ] `src/actors/actor-manifests.ts` ve `src/actors/actor-registry.ts` import yollarını güncelleme.
- [ ] `tests/*.test.ts` test importlarını güncelleme.
- [ ] `context/architecture-schema.md` dosyasını yeni aktör konumlarıyla güncelleme.
- [ ] `npm test` ve `npm run verify` ile 884 TS testinin ve tüm Python testlerinin geçtiğini doğrulama.

---

## 5. Doğrulama ve Güvenlik Kriterleri
1. **Canlı Süreç Kesintisizliği:** OpenAlex S3 snapshot yüklemesi sıfır kesintiyle çalışmalıdır.
2. **Deterministik Doğrulama:** `npm run verify` 6/6 katmandan sıfır hatayla geçmelidir.
3. **Test Bütünlüğü:** Tüm 884 TypeScript testi ve 15+ Python pipeline testi %100 yeşil kalmalıdır.
4. **Mimari Şema Senkronizasyonu:** `context/architecture-schema.md` yeni şemayı birebir yansıtmalıdır.
