# Pipeline Orchestrator (Faz 1: Çekirdek) Walkthrough

## 1. Genel Bakış

Bu çalışma kapsamında `docs/plans/pipeline-orchestrator-plani.md` mimari şartnamesi uyarınca Protokol-7 bünyesindeki 18 veri çıkarma aktörünü, zamanlama ve yürütme hedeflerini, çıktı biçimlendiricilerini ve yerel depolama yönlendirmesini birleştiren genel amaçlı boru hattı orkestrasyon katmanının Faz 1 çekirdeği hayata geçirilmiştir.

## 2. Hayata Geçirilen Bileşenler

### 2.1. Pipeline Yapılandırma Şeması ve YAML Ayrıştırıcı (`src/pipeline/schema.ts`)
- **İşlev:** Zod tabanlı `PipelineConfigSchema` ve `js-yaml` ayrıştırıcısı ile YAML dosyalarını doğrular.
- **Güvenlik Kuralı:** Depolama ve bağlayıcı credential alanlarında düz metin sırları reddeder; yalnızca `${ENV_VAR}` biçimindeki ortam değişkeni referanslarını kabul eder (`ConnectorCredentialString`).
- **Hata Modeli:** Kod tabanı standardına uygun `PipelineError` tipinde `code` ve `details` taşıyan zengin hata fırlatır.

### 2.2. Aktör Çözümleyici (`src/pipeline/actor-resolver.ts`)
- **İşlev:** Boru hattı yapılandırmasında belirtilen aktörün katalogda (`ACTOR_MANIFESTS`) kayıtlı olup olmadığını denetler.
- **Doğrulama:** Aktör manifestosundaki `inputSchema.required` alanlarını tarar; eksik parametre durumunda `MISSING_REQUIRED_CONFIG` hatası üretir.

### 2.3. Yürütme Katmanı ve Yerel Yürütücü (`src/pipeline/execution/`)
- **Sözleşme:** `ExecutionTarget` arayüzü ve `ExecutionResult` çıktı sözleşmesi tanımlandı.
- **Yerel Yürütücü (`LocalExecutor`):** Aktörleri `ActorRegistry` üzerinden `ActorRunContext` ile çalıştırır veya test/mock amaçlı enjekte edilebilir `CustomActorRunner` kullanır. Aktör ham çıktılarını normalize edilmiş nesne dizisine dönüştürür.

### 2.4. Çıktı Havuzu (`src/pipeline/output-sink.ts`)
- **Bileşenler:** Akış ve bellek içi veri toplama amacıyla `BufferedSink` ve `StreamSink` uygulandı. Öğe sayısı ve tahmini bayt boyutu metriklerini hesaplar.

### 2.5. Çıktı Biçimlendiricileri (`src/pipeline/processors/`)
- **`JsonlWriter`:** Satır başı ayrılmış JSON (JSONL) tamponu ve dosya adı üretir.
- **`PassthroughWriter`:** Yapılandırılmış JSON tamponu üretir.
- **`CsvWriter`:** RFC 4180 uyumlu virgülle ayrılmış değerler tablosu üretir.
- **`ParquetPacker`:** PyArrow subprocess köprüsü üzerinden ZSTD-6 Parquet paketlemesi yapar; alt süreç başarısız olduğunda mimari kural gereği JSONL fallback'e geçer.

### 2.6. Depolama Katmanı (`src/pipeline/storage/`)
- **Sözleşme:** `StorageBackend` arayüzü ve kriptografik `StorageReceipt` (dosya yolu, bayt boyutu, SHA-256 sağlama toplamı, zaman damgası) veri sözleşmesi oluşturuldu.
- **`LocalStorage`:** Çıktıları `PROTOKOL_POOL_ROOT` veya belirtilen dizin altına yazar; SHA-256 sağlama toplamını hesaplayıp `StorageReceipt` döndürür.

### 2.7. Ana Orkestratör (`src/pipeline/pipeline-runner.ts`)
- **Akış Döngüsü:** Yapılandırma doğrulama -> aktör çözümleme -> yürütme -> çıktı havuzu -> formatlama -> depolama yüklemesi aşamalarını yönetir.
- **Süreç Güvenliği:** Yürütme ve depolama hatalarını yakalar, `failedRuns` listesine kaydeder ve süreci çökertmeden `status: "failed"` sonucu döndürür.

### 2.8. Komut Satırı Arayüzü (`src/pipeline/cli.ts` & `npm run pipeline`)
- **Kullanım:** `npm run pipeline -- --config <dosya.yaml>` komutuyla doğrudan YAML boru hatlarını çalıştırır.
- **Çıktı:** Standart ASCII loglama disipliniyle başarı durumunda JSON çıktı ve makbuz, hata durumunda hata detayını basar.

## 3. Doğrulama ve Test Sonuçları

- **Yeni Boru Hattı Testleri:** 24/24 başarılı:
  - `tests/pipeline-schema.test.ts` (9 test)
  - `tests/actor-resolver.test.ts` (5 test)
  - `tests/pipeline-runner.test.ts` (10 test)
- **Genel Test Paketi (`npm test`):** 206/206 başarılı (0 hata, 0 atlama).
- **Statik Tip ve Lint Denetimi (`npm run typecheck && npm run lint`):** Sıfır hata.
- **Deterministik Doğrulama Hattı (`npm run verify`):** 6 katmanın tümünden (Mimari Bütünlük, İsimlendirme Disiplini, Sıfır Emoji, Secret Detection, SCA Paket Halüsinasyonu, Biome Lint) başarıyla geçti.
- **Canlı CLI Yürütmesi:** `npm run pipeline -- --config examples/pipelines/wikimedia-sample.yaml` başarıyla çalıştı ve 1372 baytlık doğrulanmış JSONL çıktısı oluşturdu.
