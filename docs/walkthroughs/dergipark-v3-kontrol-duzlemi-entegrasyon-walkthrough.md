# DergiPark V3 Kontrol Düzlemi Entegrasyonu Walkthrough

## 1. Genel Bakış ve Kapsam
RFC 03 (Workers, Transaction and Control Plane), RFC 13 (Source Onboarding Protocol) ve V3 Geliştirici Sözleşmeleri uyarınca, TÜBİTAK ULAKBİM DergiPark akademik külliyatı resmî Kontrol Düzlemi mimarisine dahil edildi. Kaynak manifesti, alan eşleme sözleşmesi, `dergipark_harvest` görev işleyicisi ve bağımsız işçi havuzu entegrasyonu tamamlandı.

## 2. Yapılan Değişiklikler

### A. Kaynak Tanımlayıcı Sözleşmesi (`contracts/source-descriptors/dergipark.json`)
- `source-descriptor.schema.json` standardına tam uyumlu kaynak manifesti:
  - `source_id`: `"dergipark"`
  - `method`: `"oai_pmh"`
  - `record_type`: `"academic_article"`
  - `pagination`: `{ "mode": "resumption_token", "checkpoint_after_durable_commit": true }`
  - `budget`: 1.000.000 istek, 50 GB veri, 86.400 saniye (24 saat).
  - `rights_status`: `"approved"` (Açık Erişim / CC lisanslı akademik dergiler).
  - `retention_policy_id`: `"raw-default"`.

### B. Alan Eşleme Sözleşmesi (`contracts/field-mappings/dergipark.json`)
- Upstream OAI-PMH Dublin Core etiketlerinden Protokol-7 tabüler alanlarına deterministik haritalama:
  - `external_id`: `id`
  - `title`, `authors`, `abstract`, `publisher`, `journal`, `language`, `doi`, `issn`, `fulltext_url`, `identifiers`, `keywords`.
  - Bilinmeyen alanların ham nesnede saklanması (`preserve_in_raw_not_silent_drop`).

### C. DergiPark Bölüm Toplama İşleyicisi (`src/workers/handlers/dergipark-harvest-handler.ts`)
- `createDergiParkHarvestJobHandler()`:
  - `dergipark_harvest` operasyonu için asenkron görev yöneticisi.
  - Python orkestratörünü (`orchestrator.py`) alt süreç olarak başlatır.
  - `AbortSignal` ile işçi iptallerinde ve kiralama aşımında (lease expiry) `SIGTERM` / `SIGKILL` göndererek zombi süreç oluşmasını engeller.
  - Başarılı yürütme sonrası `dergipark.harvest.completed` olayını transactional outbox kuyruğuna yazar.

### D. Kaynak Kayıt CLI Aracı (`scripts/register-source.ts`)
- `source-descriptor.json` dosyasını JSON Schema'ya göre doğrular.
- SQLite `control_plane.sqlite` içerisindeki `sources` tablosuna atomik olarak kaydeder (`createSource`).
- `--enqueue-partitions` bayrağı ile DergiPark tarih bölümlerini otomatik olarak `jobs` tablosuna `pending` iş olarak ekler.
- `package.json` içerisine `"source:register": "tsx scripts/register-source.ts"` betiği eklendi.

### E. Bağımsız İşçi Daemon'ı Entegrasyonu (`scripts/run-worker.ts`)
- `WorkerPool` içerisine `dergipark_harvest` işleyicisi kaydedildi; `npm run worker` ile çalıştırılan işçiler doğrudan DergiPark toplama görevlerini üstlenebilir duruma getirildi.

## 3. Doğrulama ve Test Sonuçları

### Sözleşme ve Şema Testleri
```bash
npx tsx --test tests/contracts.test.ts
```
- `validates that contracts/source-descriptors/dergipark.json conforms to source-descriptor.schema.json` PASSED
- `validates that contracts/field-mappings/dergipark.json defines valid mapping` PASSED
**Sonuç:** 8/8 test yeşil geçti.

### İşçi ve Görev Yaşam Döngüsü Testleri
```bash
npx tsx --test tests/dergipark-worker.test.ts
```
- `registers dergipark_harvest handler and executes dry-run task` PASSED
- `handles abort signal properly during job execution` PASSED
- `runs full worker task lifecycle with lease and finalization` PASSED
**Sonuç:** 3/3 test yeşil geçti.

### Külliyat Aktör ve Python Boru Hattı Testleri
```bash
npx tsx --test tests/dergipark-actor.test.ts && .venv/bin/pytest pipelines/api_stream/dergipark/test_dergipark_pipeline.py
```
**Sonuç:** 11/11 TypeScript aktör testi ve 12/12 Python boru hattı testi yeşil geçti.

### 6 Katmanlı Doğrulama Hattı (`npm run verify`)
- [1/6] Mimari Dosya Bütünlüğü: PASS
- [2/6] İsimlendirme ve Dokümantasyon Disiplini: PASS
- [3/6] Loglama Disiplini (Sıfır Emoji): PASS
- [4/6] Gizli Anahtar Taraması: PASS
- [5/6] Bağımlılık ve Paket Halüsinasyonu (SCA): PASS (11 paket doğrulandı)
- [6/6] Kod Stili ve Statik Analiz (Biome Lint): PASS (360 dosya temiz)

### Canlı Süreç Güvenliği
- DOAJ Arka Plan Daemon'ı (PID 106385) kesintisiz ve hatasız biçimde akmaya devam etmektedir.

## 4. Kullanım Örnekleri

### Kaynağı Kontrol Düzlemine Kaydetme ve İş Kuyruklama
```bash
# Kaynağı kaydet ve 1970-2026 arası tüm tarih bölüm işlerini kuyruğa al
npm run source:register -- --enqueue-partitions --start-year 1970 --end-year 2026
```

### İşçi Havuzunu Başlatma
```bash
# Bağımsız işçi daemon'ını 2 işçi ile başlat
npm run worker -- --concurrency 2 --operations dergipark_harvest
```

## 5. Sıradaki Adım (Yol Haritası)
- **Madde D:** Tam Metin PDF İndirme ve Metin Çıkarımı (126.953 DergiPark makalesinin `fulltext_url` üzerinden PDF'lerinin indirilmesi, `unpdf` ile Markdown'a dönüştürülmesi ve Zstd Parquet formatında Google Drive'a aktarılması).
