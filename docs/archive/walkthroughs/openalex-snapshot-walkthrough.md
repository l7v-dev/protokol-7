# OpenAlex S3 Parquet Snapshot Pipeline Walkthrough — protokol-7

Bu doküman, OpenAlex resmi AWS S3 açık Parquet snapshot'ını (`s3://openalex/data/parquet/works/`) sıfır disk artığıyla akış halinde indiren, filtreleyen, Zstandard Parquet shard'ları halinde paketleyen, Google Drive'a aktaran ve SQLite metadata kayıtlarını tutan hattın doğrulama ve operasyon adımlarını belgeler.

---

## 1. Mimari Bileşenler

| Modül | Dosya Yolu | Sorumluluk |
|---|---|---|
| **Temizleyici (Cleaner)** | `scripts/openalex_snapshot_pipeline/cleaner.py` | Retracted (`is_retracted == True`) ve paratext (`is_paratext == True`) kayıtları eler; `abstract_inverted_index` üzerinden doğal dilde özetleri yeniden inşa eder; LLM eğitimi için optimize edilmiş Markdown dokümanları üretir. |
| **Paketleyici (Packer)** | `scripts/openalex_snapshot_pipeline/packer.py` | `OpenAlexSnapshotSharder` sınıfı ile `oa_w_YYYYMMDD_p00000.parquet` formatında kompakt isimli Zstandard (level 3) Parquet parçaları üretir. SHA-256 ve MD5 hash'lerini hesaplar. |
| **İndirici (Downloader)** | `scripts/openalex_snapshot_pipeline/downloader.py` | `s3://openalex/data/parquet/manifest.json` dosyasını çeker, 2.040 partisyonu ayıklar; AWS CLI (`--no-sign-request`) ve HTTPS akışıyla tek tek indirir; işi biten ham partisyonu anında siler (`zero disk residue`). |
| **Drive Eşitleyici (DriveSync)** | `scripts/openalex_snapshot_pipeline/drive_sync.py` | Parquet shard'larını Google Drive üzerinde `OpenAlex/Snapshots/` dizinine 64 MB chunk'larla yükler; Drive MD5 checksum'ı ile doğrular; yerel dosyayı anında siler. |
| **Defter (Ledger)** | `scripts/openalex_snapshot_pipeline/ledger.py` | `data/openalex_snapshot_catalog.sqlite` üzerinde `s3_partitions`, `output_shards` ve `pipeline_metadata` tablolarını yönetir; eşzamanlı olarak merkezi `data/catalog.sqlite` (`dataset_shards` ve `storage_replicas`) ile dual-sync yapar. |
| **Orkestratör (Orchestrator)** | `scripts/openalex_snapshot_pipeline/orchestrator.py` | CLI arayüzü (`--all`, `--max-partitions`, `--max-part-gb`, `--dry-run`, `--status`, `--require-abstract`), SIGINT/SIGTERM sinyal yönetimi ve genel yürütme motoru. |
| **Test Paketi** | `scripts/openalex_snapshot_pipeline/test_snapshot_pipeline.py` | Cleaner, Packer, Downloader ve Ledger bileşenlerini kapsayan 8 birim testi. |

---

## 2. Doğrulama ve Test Sonuçları

### 2.1 Birim Testleri
```bash
npm run test:openalex:snapshot
```
**Çıktı:**
```text
> protokol-7@1.0.0 test:openalex:snapshot
> .venv/bin/python -m unittest scripts/openalex_snapshot_pipeline/test_snapshot_pipeline.py

......[LEDGER] Manifest registered. Partitions: total=2, newly_added=2
.[SHARDER] Opened new shard: oa_w_20260930_p00000.parquet
[SHARDER] Shard completed: oa_w_20260930_p00000.parquet (25 works, 0.01 MB, sha256=887c2130a34b...)
.
----------------------------------------------------------------------
Ran 8 tests in 0.085s

OK
```

### 2.2 Uçtan Uca Pilot Doğrulama (Dry-Run Canlı Test)
```bash
.venv/bin/python scripts/openalex_snapshot_pipeline/orchestrator.py --dry-run --max-partitions 1
```
**Doğrulanan Mekanizmalar:**
1. AWS S3'ten gerçek OpenAlex partisyonu (`part_00000.parquet`, 0.97 MB) başarıyla indirildi.
2. 1.578 ham eser filtrelendi ve 4.780 eser/saniye hızla temizlendi.
3. Ham partisyon işlendikten hemen sonra diskten silindi (`Freed: 0.97 MB`).
4. `oa_w_20260923_p00000.parquet` Parquet shard'ı oluşturuldu (1.578 eser, 0.28 MB, Zstandard sıkıştırma).
5. Parquet şeması (`id`, `doi`, `title`, `year`, `authors`, `topics`, `is_oa`, `oa_url`, `citations`, `text`, `char_count`, `word_count`) doğrulandı.
6. SQLite veritabanına partisyon ve shard bilgileri kaydedildi.

### 2.3 Protokol-7 Doğrulama Hattı (`npm run verify`)
Tüm 6 katman (Mimari dosya bütünlüğü, isimlendirme disiplini, sıfır emoji kuralı, gizli anahtar taraması, SCA paket denetimi, Biome lint) başarıyla geçti.

---

## 3. Çalıştırma Talimatları

### Durum Sorgulama
```bash
.venv/bin/python scripts/openalex_snapshot_pipeline/orchestrator.py --status
```

### Belirli Sayıda Partisyon İşleme (Örnek: 10 partisyon, 10 GB shard tavanı)
```bash
.venv/bin/python scripts/openalex_snapshot_pipeline/orchestrator.py --max-partitions 10 --max-part-gb 10.0
```

### 50 GB Parçalar Halinde Drive'a Yükleme (Kullanıcı Tercihi)
```bash
.venv/bin/python scripts/openalex_snapshot_pipeline/orchestrator.py --all --max-part-gb 50.0
```

### Tam Akışı Arka Planda Başlatma
```bash
nohup .venv/bin/python scripts/openalex_snapshot_pipeline/orchestrator.py --all --max-part-gb 10.0 > openalex_snapshot.log 2>&1 &
```
