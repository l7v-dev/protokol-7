# Walkthrough — Kurumsal Big Data LLM Veri Hattı & Sıfır Ham Veri Yaşam Döngüsü

## 1. Genel Bakış

500 TB dağıtık soğuk disk (`protokol-cold-vault`), Cloudflare R2 ve S3 uyumlu nesne depolama sağlayıcılarını eklenti (plugin) mimarisiyle soyutlayan; gelen ham verileri temizleyip ZSTD-6 sıkıştırmalı Parquet parçalarına dönüştüren; 4 aşamalı kriptografik doğrulama sonrasında ham veriyi diskten güvenle silen kurumsal büyük veri hattı tamamlandı.

---

## 2. Geliştirilen Bileşenler ve Mimari Katmanlar

### A. Veri Kataloğu & Denetim Defteri (`scripts/bigdata_pipeline/`)
* **`schema.sql`**: ANSI/SQLite ilişkisel DDL. `datasets`, `pipeline_runs`, `dataset_shards`, `storage_replicas` ve `verification_audit_ledger` tabloları.
* **`metadata_catalog.py`**: Atomik işlemler, shard özetleri, replika durumları ve `export_dataset_manifest()` JSON fihrist üreticisi.

### B. Eklenti Tabanlı Depolama Katmanı (`scripts/bigdata_pipeline/storage/`)
* **`base.py`**: `StorageProvider` soyut taban sınıfı ve `StorageReceipt` veri sözleşmesi.
* **`local_cold_vault.py`**: `docs/protokol-cold-vault-mimari-sartnamesi.md` şartnamesine uygun, Btrfs/POSIX takılabilir soğuk disk sağlayıcısı. Diskte `datasets/{dataset_id}/` dizinini yönetir ve `checksums/SHA256SUMS` defterini atomik olarak günceller.
* **`cloudflare_r2.py`**: Cloudflare R2 / S3 0-egress nesne depolama sağlayıcısı. Checksum doğrulama ve testler için kuru çalıştırma (dry-run) desteği.
* **`__init__.py`**: Depolama sağlayıcı factory arayüzü (`get_storage_provider()`).

### C. Temizleme ve Heuristik Kalite Filtresi (`scripts/bigdata_pipeline/cleaner.py`)
* **`TextNormalizer`**: HTML entity çözümü, Unicode NFKC standardizasyonu, null bayt ve kontrol karakteri temizliği, zero-width boşlukların elenmesi.
* **`QualityFilter`**: Gopher / FineWeb heuristik kuralları (minimum karakter, kelime sayısı, ortalama kelime uzunluğu, sembol oranı ve tekrarlayan satır oran analizi).

### D. Parquet Paketleyici & Parçalayıcı (`scripts/bigdata_pipeline/packer.py`)
* **`StreamingParquetPacker`**: PyArrow tabanlı, ZSTD seviye 6 sıkıştırmalı, 64 MB RowGroup ve 512 MB - 1 GB parça (shard) yuvarlama desteği. Standart şema: `doc_id`, `text`, `title`, `source`, `domain`, `license_group`, `char_count`, `word_count`, `ref_token_count`, `created_at`.

### E. 4 Aşamalı Doğrulama Kapısı ve Güvenli Silici (`scripts/bigdata_pipeline/verifier.py`)
* **`VerificationGatekeeper`**:
  1. **Kayıt Sayısı Kontrolü:** Girdi kayıt sayısı == Parquet dosya satır sayısı.
  2. **Parquet Sağlık & Şema Kontrolü:** PyArrow metadata okunabilirliği ve zorunlu alan doğrulaması.
  3. **Depolama Checksum Kontrolü:** Hedef depolamadaki dosya boyutu ve SHA-256 hash eşleşmesi.
  4. **Güvenli Ham Veri Silme:** Yalnızca tüm kontroller geçerse ham veriyi diskten siler (`os.unlink`); denetim defterine `raw_purged = 1` kaydeder. Doğrulama başarısız olursa ham veri **asla silinmez**.

### F. Master Orkestratör ve CLI (`scripts/bigdata_pipeline/orchestrator.py`)
* CLI parametreleri: `--dataset-id`, `--name`, `--source`, `--license`, `--raw-file`, `--storage`, `--shard-size-mb`, `--no-purge`.

---

## 3. Doğrulama ve Test Sonuçları

### 1. Birim ve Entegrasyon Testleri (`npm run bigdata:test`)
```text
........
----------------------------------------------------------------------
Ran 8 tests in 0.547s

OK
```
* `test_metadata_catalog_lifecycle`: Başarılı.
* `test_local_cold_vault_provider`: Başarılı.
* `test_cleaner_and_quality_heuristics`: Başarılı.
* `test_streaming_parquet_packer`: Başarılı.
* `test_verification_gatekeeper_success_purges_raw`: Başarılı (Ham veri doğrulama sonrası diskten silindi).
* `test_verification_gatekeeper_failure_strictly_preserves_raw`: Başarılı (Doğrulama hatasında ham verinin kesinlikle korunduğu kanıtlandı).
* `test_end_to_end_orchestrator`: Başarılı.
* `test_advanced_backend_stack`: Başarılı (`tiktoken` kesin tokenizasyon, `lingua` 75-dil yüksek doğruluklu tespiti, `regex` PII maskeleme, `blake3` 5+ GB/s kriptografik özetleme, `duckdb` sıfır-RAM Parquet SQL analitiği).

### 2. Canlı CLI Testi
* Test girdisi: `data/sample_raw.jsonl`
* Komut:
```bash
python scripts/bigdata_pipeline/orchestrator.py \
  --dataset-id "arxiv-sample" \
  --name "arXiv Sample Dataset" \
  --source "arxiv" \
  --license "permissive_commercial" \
  --raw-file "data/sample_raw.jsonl" \
  --storage "local_cold_vault" \
  --shard-size-mb 10
```
* Çıktı:
```json
{
  "run_id": "run-arxiv-sample-3d512cee",
  "dataset_id": "arxiv-sample",
  "status": "COMPLETED",
  "total_raw": 5,
  "total_clean": 5,
  "total_rejected": 0,
  "total_shards": 1,
  "total_tokens": 165,
  "raw_purged": true,
  "manifest_path": "/home/l7v/l7v-dev/play/protokol-7/data/staging/arxiv-sample-manifest.json"
}
```
* Doğrulama: `ls data/sample_raw.jsonl` -> `No such file or directory` (Doğrulama onaylandı, dosya güvenle silindi).
* Soğuk disk fihristi: `data/cold_vault/VOL-001/checksums/SHA256SUMS` -> `28d514d9b43a69d7fced6353f01f082b29e97f0639b662ba11cec5fe8e510a8f  datasets/arxiv-sample/arxiv-sample-part-00001.parquet`.
