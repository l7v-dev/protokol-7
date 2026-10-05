# Veri Kumesi Envanteri ve Egitim Manifestosu Yayincisi Plani

Bu plan; damıtılmış ve elenmiş veri şardlarının (Parquet / JSONL) tek bir eğitim veri kümesi anlık görüntüsü (`DatasetSnapshot`) olarak mühürlenmesini, kriptografik SHA-256 sağlama toplamı denetimini, veri bölme (train / validation / test) oranlarının hesaplanmasını, `manifest.json` üretimini, depolama bağlayıcılarına (S3/R2/B2/Yerel) aktarımını, SQLite ACID kaydını ve REST API / MCP araçları üzerinden sunulmasını tanımlar.

---

## 1. Temel Ilkeler ve Sozlesmeler (Core Invariants)

1. **Deterministik Kriptografik Dogrulama (Cryptographic Invariant):**
   * Her şard için SHA-256 özeti doğrulanır. Manifestoda her dosyanın boyutu, kayıt adedi, dosya adı, depolama URI'si ve SHA-256 sağlama toplamı açıkça yer alır.
2. **Egitim Bolumleme Standarti (Dataset Splits):**
   * Varsayılan olarak `%80 train`, `%10 validation`, `%10 test` veya kullanıcı tarafından belirtilen oranlar (`splitRatios`) üzerinden şardlar deterministik olarak ayrılır.
   * Alternatif olarak kullanıcı doğrudan şard-bölüm eşleştirmesini belirtebilir.
3. **Standart `manifest.json` Semasi:**
   * HuggingFace Datasets, PyTorch DataLoader ve Protokol-Cold-Vault uyumlu JSON yapısı:
     - `schema_version`: "1.0.0"
     - `snapshot_id`: Benzersiz UUID / kilit kimliği.
     - `dataset_name`: Veri kümesi teknik adı.
     - `version`: Semantik sürüm veya tarih damgası.
     - `created_at`: ISO 8601 zaman damgası.
     - `splits`: `{ train: { shard_count, record_count, size_bytes, shards: [...] }, validation: {...}, test: {...} }`.
     - `statistics`: Toplam kayıt, toplam bayt boyutu, tahmini toplam token adedi, sıkıştırma algoritması.
     - `checksums`: `{ [fileName]: sha256_hash }`.
     - `license`: Lisans grubu ve açıklama.
     - `metadata`: Ek bağlamsal etiketler (diller, kaynak platform, filtreleme parametreleri).
4. **ACID Kalicilik (RegistryDatabase Persistence):**
   * `dataset_snapshots` tablosu üzerinde kaydedilir.
5. **Coklu Erisim (REST API + MCP):**
   * REST: `POST /api/v1/datasets/publish`, `GET /api/v1/datasets`, `GET /api/v1/datasets/:name`, `GET /api/v1/datasets/:name/snapshots`, `GET /api/v1/datasets/:name/snapshots/:snapshotId`, `GET /api/v1/datasets/:name/manifest`.
   * MCP: `publish_dataset`, `list_datasets`, `get_dataset_manifest`.

---

## 2. Faz Faz Uygulama Adimlari

### Faz 1: Veritabani Sema ve CRUD Katmani (`src/core/registry-database.ts`)
* `dataset_snapshots` tablosunun ve indekslerinin oluşturulması.
* `recordDatasetSnapshot`, `listDatasetSnapshots`, `getDatasetSnapshot`, `getLatestDatasetSnapshot` metotlarının ve hazırlanmış ifadelerinin (prepared statements) eklenmesi.

### Faz 2: Yayinci Motoru (`src/dataset/dataset-publisher.ts`)
* `DatasetPublisher` sınıfının oluşturulması:
  - `publishSnapshot(options: PublishDatasetOptions): Promise<PublishDatasetResult>`
  - Şard envanterini veritabanından çekme veya doğrudan parametre olarak alma.
  - Şard dosyalarının varlık ve sağlama toplamı kontrolü (varsa diskten SHA-256 doğrulama).
  - Şardların split'lere deterministik dağıtımı.
  - `manifest.json` dosyasını derleme ve hedef dizine (`outputDir` veya `data/snapshots/...`) yazma.
  - Opsiyonel olarak `StorageRouting` bağlayıcıları (S3, R2, B2) ile depolama hedefine yükleme.
  - `RegistryDatabase` üzerine snapshot kaydı.

### Faz 3: HTTP REST API Yonlendiricisi (`src/core/dataset-router.ts`) ve Sunucu Entegrasyonu (`src/core/server.ts`)
* `DatasetRouter` sınıfı ile rotaların ayrıştırılması:
  - `POST /api/v1/datasets/publish`
  - `GET /api/v1/datasets`
  - `GET /api/v1/datasets/:name`
  - `GET /api/v1/datasets/:name/snapshots`
  - `GET /api/v1/datasets/:name/snapshots/:snapshotId`
  - `GET /api/v1/datasets/:name/manifest`
* `src/core/server.ts` içinde `datasetRouter` çağrılarının bağlanması.

### Faz 4: MCP Protokol Araclari (`src/mcp/protokol-mcp-server.ts`)
* `publish_dataset`, `list_datasets`, `get_dataset_manifest` araçlarının `getTools()` ve `tools/call` akışlarına eklenmesi.
* Toplam MCP araç sayısının 33'ten 36'ya yükseltilmesi.

### Faz 5: OpenAPI 3.1.0 Spesifikasyonu (`src/core/openapi-spec.ts`)
* `Datasets` etiketiyle tüm uç noktaların Swagger UI ve OpenAPI JSON şemasına eklenmesi.

### Faz 6: Entegrasyon Testleri (`tests/dataset-publisher-and-api.test.ts`)
* `DatasetPublisher` birim testleri (split oranları, token toplamı, checksum, manifest çıktısı).
* REST API uç noktalarının entegrasyon testleri (200, 400, 404).
* MCP JSON-RPC 2.0 çağrı testleri.
* `tests/protokol-mcp-server.test.ts` araç sayısı güncellemesi (36 araç).

### Faz 7: Dogrulama ve Surec Kapanisi
* `npm test`, `npm run lint`, `npm run verify` ve `npm run connectome` kontrolleri.
* `context/architecture-schema.md` ve `TASKS.md` güncellemeleri.
* Git Commit Convention v1.0 ile işleme.
