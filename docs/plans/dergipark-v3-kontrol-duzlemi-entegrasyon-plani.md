# DergiPark V3 Kontrol Düzlemi ve Kaynak Tanımlayıcı Entegrasyon Planı

## 1. Amaç ve Kapsam
RFC 03 (Workers, Transaction and Control Plane), RFC 13 (Source Onboarding Protocol) ve V3 Geliştirici Sözleşmeleri uyarınca, TÜBİTAK ULAKBİM DergiPark veri kaynağının resmî Kontrol Düzlemi (Control Plane) bileşenlerine entegre edilmesi.

Bu kapsamda:
1. `contracts/source-descriptors/dergipark.json` sözleşmesi (`source-descriptor.schema.json` uyumlu).
2. `contracts/field-mappings/dergipark.json` alan eşleme sözleşmesi.
3. DergiPark bölüm toplama işçisi (`dergipark-harvest-handler.ts`).
4. Kaynak kayıt ve iş kuyruklama aracı (`scripts/register-source.ts`).
5. Bağımsız işçi daemon'ı (`scripts/run-worker.ts`) ve `WorkerPool` entegrasyonu.
6. Birim ve entegrasyon testleri (`tests/contracts.test.ts`, `tests/dergipark-worker.test.ts`).

## 2. Mimari Bileşenler

### A. Kaynak Tanımlayıcısı (`contracts/source-descriptors/dergipark.json`)
- Şema: `source-descriptor.schema.json`
- `source_id`: `"dergipark"`
- `method`: `"oai_pmh"`
- `pagination.mode`: `"resumption_token"`
- `rights_status`: `"approved"`
- `retention_policy_id`: `"raw-default"`
- `budget`: `max_requests`: 1.000.000, `max_bytes`: 50 GB, `max_seconds`: 86400.

### B. Alan Eşleme Sözleşmesi (`contracts/field-mappings/dergipark.json`)
- Dublin Core XML etiketlerinden Protokol-7 tabüler alanlarına deterministik haritalama.
- Bilinmeyen alanların ham veri içinde saklanması (`preserve_in_raw_not_silent_drop`).

### C. İşçi İşleyicisi (`src/workers/handlers/dergipark-harvest-handler.ts`)
- `dergipark_harvest` operasyonu:
  - Görev girdisi (`partition_id`, `from_date`, `until_date`, `max_records`, `batch_size`).
  - Python alt süreci (`orchestrator.py`) çağrısı ve `AbortSignal` ile anında iptal/tahliye (fencing) desteği.
  - Başarılı çıktıda shard ve kayıt metriklerinin bildirilmesi.

### D. Kaynak Kayıt CLI Aracı (`scripts/register-source.ts`)
- JSON kaynak tanımlayıcısını şemaya göre doğrular.
- SQLite `control_plane.sqlite` içerisindeki `sources` tablosuna atomik olarak kaydeder (`ledger.saveSource`).
- İsteğe bağlı `--enqueue-partitions` bayrağı ile 37 adet tarih bölümünü `jobs` tablosuna `pending` iş olarak ekler.

## 3. Doğrulama ve Testler
- `tests/contracts.test.ts`: DergiPark source descriptor ve field mapping şema uygunluğu.
- `tests/dergipark-worker.test.ts`: `dergipark_harvest` işleyici yaşam döngüsü, iptal sinyali ve hata durumları.
- `npm run verify`: 6 katmanlı tam doğrulama hattı.

## 4. Kısıtlar ve Güvenlik
- **Sıfır Emoji:** Kod, log, commit ve dokümanlarda kesinlikle emoji kullanılmaz.
- **DOAJ Süreç Güvenliği:** PID 106385 DOAJ arka plan akışı kesintisiz çalışmaya devam eder.
- **Git Standartları:** `feat(control-plane): onboard dergipark source descriptor and harvest worker handler`.
