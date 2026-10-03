# Boru Hattı Entegrasyonu ve İşçi CLI Daemon'ı Doğrulama Raporu (Faz 4 Walkthrough)

## 1. Genel Bakış
Bu çalışma ile Geliştirici Paketi V3 şartnameleri doğrultusunda (RFC 03 — Worker, Transaction ve Control Plane ve RFC 05 — Production Runbook), Faz 0 (Sözleşmeler), Faz 1 (Nesne Deposu), Faz 2 (Kontrol Düzlemi) ve Faz 3 (İşçi Havuzu) ile kurulan mimari altyapı; bağımsız bir işçi CLI koşturucusu (`scripts/run-worker.ts`), HTTP REST kontrol düzlemi yönlendiricisi (`ControlRouter`) ve `package.json` CLI betikleri (`npm run worker`) ile üretime hazır tam bir mikroservis yapısına kavuşturulmuştur.

---

## 2. Geliştirilen Bileşenler ve Mimari Mekanizmalar

### 2.1 HTTP REST Kontrol Düzlemi Yönlendiricisi (`src/api/routers/control-router.ts`)
- **`POST /api/v1/control/jobs`**: Yeni iş bildirimi oluşturma. `operation`, `idempotencyKey`, `input`, `maxAttempts`, `documentId` alanlarını doğrular ve `LedgerRepository.createJob` aracılığıyla atomik ACID kaydını sağlar.
- **`GET /api/v1/control/jobs/:id`**: İş durumu, geçerli deneme sayısı (`attempt`), kira sahibi (`leaseOwner`) ve hata kodlarını tek sorguda döndürür.
- **`POST /api/v1/control/sources`**: Yeni bir kaynak katılım tanımlayıcısını (`source_descriptor`) kontrol düzlemine kaydeder.
- **`GET /api/v1/control/sources/:id`**: Kaynak tanımlayıcısını ve bütçe/hak durumunu getirir.
- **`POST /api/v1/control/leases/reap`**: Süresi dolmuş işçi kiralamalarını ve outbox kilitlerini temizlemek için süpürücüyü zorla tetikler.

### 2.2 HTTP Sunucu Entegrasyonu (`src/api/server.ts`)
- `ControlRouter` bağımsız bir kontrol modülü olarak ana sunucu router'ına bağlanmıştır.
- Tüm kontrol düzlemi rotaları `/api/v1/control/*` ön ekiyle izole edilmiş ve CORS/hata standartlarına uyarlanmıştır.

### 2.3 Bağımsız İşçi CLI Daemon'ı (`scripts/run-worker.ts`)
- **Parametreler**:
  - `--concurrency <n>` (varsayılan: 2): Eşzamanlı işçi sayısı.
  - `--db-path <path>` (varsayılan: `data/catalogs/control_plane.sqlite`): SQLite kontrol düzlemi defteri.
  - `--storage-dir <path>` (varsayılan: `data/vault`): `LocalObjectStore` depolama kökü.
  - `--operations <ops>` (varsayılan: hepsi): İşçinin uzmanlaşacağı görev tipleri (ör. `download,extract`).
  - `--poll-interval <ms>` (varsayılan: 1000): Kuyruk sorgulama sıklığı.
- **Kayıtlı İşleyiciler**:
  - `download`: `createDownloadJobHandler()` (SSRF korumalı indirme, SHA-256 doğrulama, `ObjectStore.putStream`, alt `extract` işi planlama).
  - `extract`: `createExtractJobHandler()` (`ObjectStore.openStream` ile okuma, metin/HTML damıtma, türetilmiş artifact kaydı ve outbox bildirimi).
- **Graceful Shutdown**: `SIGINT` ve `SIGTERM` sinyallerinde havuz boşaltılır (`pool.drain()`), defter bağlantısı kapatılır ve final telemetri ASCII paneliyle raporlanır.
- **Loglama Standardı**: `TerminalTheme` kullanılarak sıfır emoji, saf ASCII rozet ve panellerle loglanır.

### 2.4 npm Entegrasyonu (`package.json`)
- `"worker": "tsx scripts/run-worker.ts"` komutu eklenerek standartlaştırılmıştır.

---

## 3. Doğrulama ve Test Sonuçları

### 3.1 Kontrol Düzlemi REST API Testleri (`tests/control-router.test.ts`)
| Test Senaryosu | Doğrulanan Mekanizma | Sonuç |
|---|---|---|
| `should create a job via POST /api/v1/control/jobs and retrieve it via GET` | REST üzerinden iş oluşturma ve ID ile durumunu getirme | **BAŞARILI** (45.3 ms) |
| `should reject job creation when required parameters are missing` | Eksik `idempotencyKey` veya `operation` için 400 hatası | **BAŞARILI** (6.2 ms) |
| `should return 404 for non-existent job ID` | Olmayan iş ID'si için 404 `JOB_NOT_FOUND` yanıtı | **BAŞARILI** (5.3 ms) |
| `should create and fetch a source descriptor via /api/v1/control/sources` | Kaynak tanımlayıcısı oluşturma ve getirme | **BAŞARILI** (9.8 ms) |
| `should trigger lease reaping via POST /api/v1/control/leases/reap` | REST üzerinden kiralama süpürme tetikleme | **BAŞARILI** (5.1 ms) |

### 3.2 Mimari Uyumluluk ve Tam Test Özeti
- **Yeni Mimarinin 5 Test Süiti**: **35/35 test başarılı** (4.3 saniye).
- **Tam Test Süiti (`npm test`)**: **954/954 test**, 202 test süiti %100 başarılı.
- **Doğrulama Boru Hattı (`npm run verify`)**: 6/6 katmanda tam yeşil.
- **Canlı DOAJ Akışı**: Arka planda PID 106385 üzerinde kesintisiz çalışıyor.
