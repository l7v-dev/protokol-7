# Proje Konsolidasyonu, Adlandırma Disiplini, Atıl Dosya Temizliği ve Taşınabilirlik Planı

Bu plan; projedeki pazarlama jargonu içeren adlandırmaların ("big data" vb.) teknik terimlerle değiştirilmesini, bağımsız ve atıl durumdaki dosyaların `trash/` klasörüne taşınmasını, çift başlı boru hattı kodlarının tekil `scripts/corpus_pipeline/` altında birleştirilmesini, aktörlerin 6 kategoride çocuk seviyesinde sade dokümantasyon ve örnek konfigürasyonlarla (`examples/actors/`) donatılmasını, Docker konteynerizasyonunu ve GitHub Actions CI boru hattının kurulmasını tanımlar.

---

## 1. Temel İlkeler ve Kararlar (Core Invariants)

1. **Sıfır Pazarlama Jargonu (Strict Naming Discipline):**
   * "Big Data" terimi tasfiye edilerek `corpus_pipeline` (külliyat işleme boru hattı) ve `dataset_pipeline` teknik terimleri kullanılacaktır.
   * `package.json`, örnek YAML dosyaları ve kod içi tanımlar bu standarda uyarlanacaktır.
2. **Bağımsız Çalıştırılabilir Betiklerin Tasfiyesi:**
   * Projeden bağımsız olarak kendi `.venv` ortamında çalışan `scripts/wikipedia_pipeline/` ve kökteki artık dosyalar (`pipeline.log`, `credentials.json`, `token.json`, `omega-mcp.json`, boş `web/` dizini) `trash/` klasörüne taşınacaktır.
   * `trash/` dizini `.gitignore` içerisine eklenecektir.
3. **Tekil Külliyat Boru Hattı (Corpus Pipeline):**
   * `scripts/bigdata_pipeline/` dizini `scripts/corpus_pipeline/` olarak yeniden yapılandırılacak; temizleyici, paketleyici ve doğrulama kapısı tekilleştirilecektir.
4. **Aktör Dokümantasyon Standardı:**
   * `src/actors/README.md` hazırlanacak; 31 aktör 6 net kategoride sınıflandırılacak, her aktörün amacı, REST rotası, MCP aracı, örnek girdi ve çıktı JSON şemaları belgelenecektir.
   * `examples/actors/` altında her aktör için çalıştırılabilir örnek JSON konfigürasyonları sunulacaktır.
5. **Taşınabilirlik ve Sürekli Entegrasyon (CI/CD):**
   * Multi-stage `Dockerfile` (Node 22 + Playwright Chromium kütüphaneleri + Python 3) ve `docker-compose.yml` üretilecektir.
   * `.github/workflows/ci.yml` eklenerek her push/PR'da testler ve statik analiz otomatik koşturulacaktır.

---

## 2. Faz Faz Uygulama Planı (Phased Execution)

### Faz 1: `trash/` Klasörü ve Atıl Dosyaların Ayrıştırılması
* `trash/` dizini oluşturulacak ve `.gitignore` dosyasına eklenecektir.
* Taşınacak öğeler:
  * `scripts/wikipedia_pipeline/` -> `trash/wikipedia_pipeline/`
  * `pipeline.log` -> `trash/pipeline.log`
  * `credentials.json` (kök dizin) -> `trash/credentials.json`
  * `token.json` (kök dizin) -> `trash/token.json`
  * `omega-mcp.json` -> `trash/omega-mcp.json`
  * `web/` (boş dizin) -> `trash/web/`
  * `scratch/*.xml.bz2` (9 GB geçici arşivler) -> `trash/scratch_dumps/`
* `src/pipeline/processors/parquet-packer.ts` dosyasında `scripts/wikipedia_pipeline/.venv/bin/python` bağımlılığı kaldırılarak `process.env.PYTHON_PATH || "python3"` standardına geçilecektir.

### Faz 2: Adlandırma Disiplini ve Boru Hattı Birleştirmesi
* `scripts/bigdata_pipeline/` -> `scripts/corpus_pipeline/` olarak taşınacak ve yeniden adlandırılacaktır.
* `examples/pipelines/bigdata-parquet-sample.yaml` -> `examples/pipelines/corpus-parquet-sample.yaml` olarak güncellenecektir.
* `package.json` içerisindeki komutlar temizlenecektir:
  * Kaldırılacaklar: `wiki:download`, `trwiki:pipeline`, `trwiki:multilang`, `bigdata:pipeline`, `bigdata:test`.
  * Eklenecekler: `corpus:pipeline`, `test:corpus`.
* `context/architecture-schema.md` güncellenecektir.

### Faz 3: Aktörlerin Kategorizasyonu, Dokümantasyonu ve Örnek Konfigürasyonlar
* `src/actors/README.md` oluşturulacaktır (6 kategori, 31 aktör tam kataloğu, REST ve MCP çağırma rehberi).
* `examples/actors/` dizini altında 31 aktör için doğrudan kopyalanabilir örnek konfigürasyon JSON şablonları hazırlanacaktır.

### Faz 4: Konteynerizasyon ve CI/CD Boru Hattı
* `Dockerfile` (Node.js 22 LTS, Playwright Chromium headless sistem kütüphaneleri, non-root güvenlik kullanıcısı) oluşturulacaktır.
* `docker-compose.yml` (Port 4000 REST/MCP, yerel veri ve konfigürasyon hacim eşleştirmeleri) oluşturulacaktır.
* `.github/workflows/ci.yml` (Lint, Tip Kontrolü, Naming Discipline, Test Runner 435 test, SCA güvenlik taraması) eklenecektir.

### Faz 5: Kök Dokümantasyon ve Sistem Doğrulaması
* Kök `README.md` projenin güncel mikroservis mimarisini, aktörlerini, MCP ve Docker kullanımını yansıtacak şekilde baştan yazılacaktır.
* `npm test`, `npm run lint`, `npm run lint:naming`, `npm run build` ve `npm run verify` çalıştırılarak tüm doğrulama kapıları teyit edilecektir.
