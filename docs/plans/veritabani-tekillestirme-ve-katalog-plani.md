# Veritabanı ve Kontrol Düzlemi Konsolidasyon Planı (Unified Catalog)

Bu plan; projedeki parçalanmış veritabanı yapısının (`data/protokol_registry.sqlite`, `scripts/corpus_pipeline/schema.sql`, dil bazlı 20+ ayrık SQLite dosyası) tek bir kurumsal kontrol düzlemi defterinde (`data/catalog.sqlite`) toplanmasını, TypeScript (`RegistryDatabase`) ve Python (`MetadataCatalog`) katmanlarının aynı ANSI SQL sözleşmesini kullanmasını tanımlar.

---

## 1. Temel İlkeler ve Kararlar (Core Invariants)

1. **Tekil Kontrol Düzlemi Defteri (Single Source of Truth Database):**
   * Tüm sistem için tek bir aktif SQLite veritabanı dosyası kullanılacaktır: `data/catalog.sqlite` (veya `PROTOKOL_DB_PATH` ortam değişkeni).
   * Dil bazında ayrı SQLite dosyaları açma anti-pattern'i sonlandırılacaktır.
2. **Birleşik ANSI SQL Şeması (`context/schema.sql`):**
   * Hem TypeScript (`src/core/registry-database.ts`) hem Python (`scripts/corpus_pipeline/metadata_catalog.py`) aynı DDL şemasını ve tablolarını paylaşacaktır:
     * `datasets`: Genel külliyat ve lisans grupları.
     * `actor_runs`: REST ve MCP aktör çalıştırma kayıtları.
     * `actor_run_logs`: Aktör olay logları.
     * `pipeline_executions`: YAML boru hattı çalıştırma kayıtları.
     * `pipeline_runs`: Büyük veri külliyat ingestion oturumları.
     * `dataset_shards`: 512MB-1GB Parquet parçaları, satır sayıları ve SHA-256/BLAKE3 hash defteri.
     * `storage_replicas`: Parçaların depolama sağlayıcılarındaki (Cold Vault, R2, S3, Drive) fiziksel replikaları.
     * `verification_audit_ledger`: Ham veri silme öncesi 4 noktalı kriptografik denetim defteri.
     * `scheduled_jobs`: Cron zamanlanmış görevler.
3. **Sıfır Bağımlılık ve ACID Güvenliği:**
   * Node.js 22 yerleşik `node:sqlite` (`DatabaseSync`) ve Python `sqlite3` motorları WAL (Write-Ahead Logging) modunda eşzamanlı ve çakışmasız çalışacaktır.
   * Test ortamlarında (`NODE_ENV=test`) tam izolasyon için `:memory:` kullanılmaya devam edilecektir.

---

## 2. Faz Faz Uygulama Planı (Phased Execution)

### Faz 1: Birleşik Şema Dosyası (`context/schema.sql`)
* `context/schema.sql` oluşturulacak; `actor_runs`, `pipeline_executions`, `datasets`, `pipeline_runs`, `dataset_shards`, `storage_replicas`, `verification_audit_ledger`, `scheduled_jobs` eksiksiz tanımlanacaktır.

### Faz 2: TypeScript `RegistryDatabase` Genişletilmesi
* `src/core/registry-database.ts`:
  * Varsayılan yol `data/catalog.sqlite` olarak güncellenecek.
  * `datasets`, `storage_replicas`, `verification_audit_ledger` tablolarının DDL ve prepared statement'ları eklenecek.
  * Veri yönetim metodları (`upsertDataset`, `listDatasets`, `getDataset`, `insertReplica`, `listReplicasForShard`, `recordAuditEntry`, `getAuditLedger`) eklenecek.

### Faz 3: Python `MetadataCatalog` Senkronizasyonu
* `scripts/corpus_pipeline/metadata_catalog.py`:
  * Varsayılan veritabanı yolu `data/catalog.sqlite` olarak güncellenecek.
  * `SCHEMA_FILE_PATH` doğrudan `context/schema.sql` dosyasını referans alacak.

### Faz 4: Eski Dil Veritabanı Klasörlerinin Taşınması
* `data/` altındaki 20+ boş klasör ve eski SQLite artıkları (`data/*wiki_parquet`) `trash/old_language_dbs/` içerisine taşınacak.

### Faz 5: Testler ve Doğrulama
* `tests/registry-database.test.ts` test paketi yazılarak yeni katalog metodları doğrulanacak.
* `npm test`, `npm run lint`, `npm run build` ve `npm run verify` çalıştırılacaktır.
