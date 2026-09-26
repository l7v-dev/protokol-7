# Pipeline Orchestrator (Faz 1 & Faz 2) Walkthrough

## 1. Genel Bakış

Bu çalışma kapsamında `docs/plans/pipeline-orchestrator-plani.md` mimari şartnamesi uyarınca Protokol-7 bünyesindeki veri çıkarma aktörlerini, zamanlama ve yürütme hedeflerini, çıktı biçimlendiricilerini ve çoklu depolama yönlendirmesini (yerel disk, AWS S3, Cloudflare R2, Backblaze B2) birleştiren genel amaçlı boru hattı orkestrasyon katmanının **Faz 1 (Çekirdek)** ve **Faz 2 (Depolama Bağlayıcıları)** modülleri hayata geçirilmiştir.

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

### 2.6. Depolama Katmanı ve Bağlayıcılar (`src/pipeline/storage/` & `src/pipeline/connectors/`)
- **Ortam Değişkeni Çözümleyici (`env-resolver.ts`):** `${ENV_VAR}` belirteçlerini çalışma zamanı ortamından (`process.env`) güvenle çözer; eksik tanımlarda `MISSING_ENV_VAR` hatası fırlatır.
- **Bağlayıcı Kayıt Defteri (`connector-registry.ts`):** YAML içinden veya koddan gelen depolama bağlayıcılarını adlarına göre yönetir ve kimlik bilgilerini çözümler.
- **`LocalStorage`:** Çıktıları `PROTOKOL_POOL_ROOT` veya belirtilen dizin altına yazar; SHA-256 sağlama toplamını hesaplayıp `StorageReceipt` döndürür.
- **`S3Storage`:** `@aws-sdk/client-s3` üzerinden `PutObjectCommand` ile AWS S3 kovalarına yükleme yapar; MIME türünü dinamik tespit eder ve `s3://` URI formatında `StorageReceipt` üretir.
- **`R2Storage`:** Cloudflare R2 hesaba özel uç nokta (`https://${accountId}.r2.cloudflarestorage.com`) ve `auto` bölge eşlemesiyle S3-uyumlu sıfır-egress depolama sağlar.
- **`B2Storage`:** Backblaze B2 S3-uyumlu uç noktası (`https://s3.${region}.backblazeb2.com`) ile depolama sağlar.

### 2.7. Ana Orkestratör (`src/pipeline/pipeline-runner.ts`)
- **Akış Döngüsü:** Yapılandırma doğrulama -> aktör çözümleme -> yürütme -> çıktı havuzu -> formatlama -> depolama yüklemesi (yerel, S3, R2, B2) aşamalarını yönetir.
- **Süreç Güvenliği:** Yürütme ve depolama hatalarını yakalar, `failedRuns` listesine kaydeder ve süreci çökertmeden `status: "failed"` sonucu döndürür.

### 2.8. Komut Satırı Arayüzü (`src/pipeline/cli.ts` & `npm run pipeline`)
- **Kullanım:** `npm run pipeline -- --config <dosya.yaml>` komutuyla doğrudan YAML boru hatlarını çalıştırır.
- **Çıktı:** Standart ASCII loglama disipliniyle başarı durumunda JSON çıktı ve makbuz, hata durumunda hata detayını basar.

## 3. Doğrulama ve Test Sonuçları

- **Boru Hattı ve Depolama Testleri:** 37/37 başarılı:
  - `tests/pipeline-schema.test.ts` (9 test)
  - `tests/actor-resolver.test.ts` (5 test)
  - `tests/pipeline-runner.test.ts` (10 test)
  - `tests/storage-router.test.ts` (13 test)
- **Genel Test Paketi (`npm test`):** 219/219 başarılı (0 hata, 0 atlama).
- **Statik Tip ve Lint Denetimi (`npm run typecheck && npm run lint`):** Sıfır hata.
- **Deterministik Doğrulama Hattı (`npm run verify`):** 6 katmanın tümünden (Mimari Bütünlük, İsimlendirme Disiplini, Sıfır Emoji, Secret Detection, SCA Paket Halüsinasyonu, Biome Lint) başarıyla geçti.
- **Canlı CLI Yürütmesi:** `npm run pipeline -- --config examples/pipelines/wikimedia-sample.yaml` başarıyla çalıştı ve 1372 baytlık doğrulanmış JSONL çıktısı oluşturdu.
