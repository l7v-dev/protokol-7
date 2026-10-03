# Nesne Deposu ve Adaptör Uyumluluk Walkthrough (Faz 1)

## Genel Bakış
`contracts/storage.ts` içinde tanımlanan `ObjectStore`, `StorageRef` ve `Capabilities` sözleşmelerine tam uyumlu depolama adaptörleri TypeScript (`src/storage/adapters/`) ve Python (`pipelines/shared/object_store_base.py`) katmanlarında hayata geçirildi.

## Yapılan İşlemler

### 1. TypeScript Adaptörleri (`src/storage/adapters/`)
- **`LocalObjectStore` (`src/storage/adapters/local-object-store.ts`):**
  - `contracts/storage.ts` içindeki `ObjectStore` arayüzünü uygular.
  - Yol güvenliği denetimleri: Göreli `..`, mutlak kök `/`, ters eğik çizgi `\\` ve dizin dışına kaçan sembolik bağlar (symlink escape) `SecurityInvariantViolation` ile engellenir.
  - Atomik yazma ve dayanıklılık: Gelen akış önce aynı dizinde benzersiz geçici bir dosyaya yazılır, `fsyncSync` ile disk kontrolcüsüne işlenir ve hedef konuma atomik olarak taşınır.
  - Değişmezlik ve çakışma yönetimi (Immutable Conflict Defense): Mevcut bir anahtara aynı içerik yazılmak istendiğinde idempotent `StorageRef` döner; farklı bir içerikle üzerine yazma denenirse `ImmutableConflict` hatası fırlatır.
  - Aralıklı okuma (`openStream(ref, range)`): Belirli bayt aralıklarını parçalı (chunked) akış olarak sunar.
  - Metadata ve sayfalama: `head(ref)` ile boyut ve SHA-256 doğrulama, `listPage(prefix, cursor)` ile sıralı sayfalama.
- **`R2ObjectStore` (`src/storage/adapters/r2-object-store.ts`):**
  - Cloudflare R2 / S3-compatible uç noktalarına `@aws-sdk/client-s3` üzerinden bağlanır.
  - Yetenekler: `multipart: true`, `ranged_read: true`, `conditional_create: true`, `versioning: true`, `presign: true`.
  - HTTP `bytes=start-end` Range başlığı ile parçalı okuma desteği.
  - Akış sırasında SHA-256 sağlama toplamı hesaplayarak nesne üstverisine ekler.
- **`src/storage/adapters/index.ts`:**
  - Adaptörlerin toplu dışa aktarımı sağlandı.

### 2. Python Adaptörleri (`pipelines/shared/object_store_base.py`)
- `StorageRef` ve `Capabilities` veri sınıfları tanımlandı.
- `BaseObjectStore` soyut sınıfı ve `LocalObjectStore` uygulaması geliştirildi:
  - `PurePosixPath` ile yol ayrıştırma, kök kaçış ve symlink güvenlik bariyeri.
  - `mkstemp` + `os.fsync` + atomik bağlantı (`os.link`) ve dizin fsync desteği.
  - Değişmezlik çakışma kontrolü (`ImmutableConflict`).
  - Aralıklı okuma (`get(ref, start, end)`).

### 3. Test ve Doğrulama
- `tests/object-store-adapters.test.ts` (10/10 test yeşil):
  - LocalObjectStore yetenekleri, putStream, head, aralıklı okuma, idempotency, çakışma engeli, yol geçişi (path traversal) engelleri, sayfalama ve silme test edildi.
  - R2ObjectStore yapılandırma ve yetenek testleri doğrulandı.
- `pipelines/shared/test_object_store.py` (6/6 Python testi yeşil):
  - Python LocalObjectStore atomik fsync, traversal ve çakışma kontrolleri doğrulandı.
- `npm run test:shared-pipelines` güncellendi ve 15/15 test başarıyla geçti.
- `context/architecture-schema.md` ve `context/connectome.md` güncellendi.
- `npm run verify` ile 6/6 katmanda tam başarı sağlandı.
