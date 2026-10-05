# Kurumsal Big Data LLM Veri Hattı, Eklenti Tabanlı Depolama ve Sıfır Ham Veri Yaşam Döngüsü Planı

Bu plan; 500 TB ölçeğinde dağıtık soğuk disk (protokol-cold-vault), Cloudflare R2 ve S3 uyumlu depolama sağlayıcılarını eklenti (plugin) mimarisiyle soyutlayan, çoklu platformlardan veri çekip temizleyen, ZSTD sıkıştırmalı Parquet parçalarına paketleyen, %100 kriptografik doğrulama ve kayıt sayısı karşılaştırmasından sonra ham veriyi diskten güvenli silen kurumsal bir büyük veri mimarisini tanımlar.

---

## 1. Temel İlkeler ve Kararlar (Core Invariants)

1. **Sıfır Ham Veri Tutma (Zero-Raw-Retention Lifecycle):**
   * Ham veriler (orijinal HTML, XML, WARC veya PDF) yalnızca geçici çalışma alanında (scratch NVMe) akışlı olarak tutulur.
   * Temizlenip Parquet olarak paketlendikten ve hedef depolamadaki kopyanın boyutu + kriptografik hash'i (SHA-256 / BLAKE3) ve satır sayısı karşılaştırılarak doğrulandıktan hemen sonra **ham veri kalıcı olarak silinir (`purge`)**.
   * Sistemde yalnızca:
     1. Nihai Altın (Gold) Parquet dosyaları,
     2. Değiştirilemez Kriptografik Denetim Defteri (Audit Ledger & Hashes),
     3. İspat/Üstveri (Provenance & Token Counts) kalır.
2. **Eklenti Tabanlı Depolama Arayüzü (Pluggable Storage Providers):**
   * Veri işleme motoru depolama tipinden tamamen bağımsızdır (`StorageProvider` soyut sınıfı).
   * Sağlayıcı seçenekleri:
     * `LocalColdVaultProvider`: Doğrudan Btrfs/POSIX fiziksel soğuk diske (`docs/protokol-cold-vault-mimari-sartnamesi.md` uyumlu).
     * `CloudflareR2Provider`: S3 API uyumlu, 0-egress maliyetli dağıtım katmanı.
     * `GenericS3Provider`: MinIO, Ceph RGW veya AWS S3 için.
     * `GoogleDriveProvider`: Mevcut Google Drive entegrasyonu.
3. **Kurumsal Envanter Kataloğu (Enterprise Metadata Catalog):**
   * SQLite (tek düğüm / yerel) ve PostgreSQL (kurumsal dağıtık) uyumlu ANSI SQL şeması.
   * `datasets`, `pipeline_runs`, `dataset_shards`, `verification_audit_ledger`, `storage_replicas`.
4. **Lisans İzolasyonu (License Segregation):**
   * Ticari kullanım lisansları (`permissive_commercial`) ile kısıtlayıcı/akademik lisanslar (`non_commercial_research`) asla aynı Parquet dosyasında birleştirilmez.

---

## 2. Kullanıcı Onayı Gerektiren Konular (User Review Required)

> [!IMPORTANT]
> **Ham Veri Silme Güvencesi:** Ham verinin silinmesi geri döndürülemez bir işlemdir. Silme işleminin tetiklenmesi için aşağıdaki 4 koşulun **hepsinin** sağlanması zorunlu bir "Gatekeeper" haline getirilecektir:
> 1. `Record Count Verification`: Giriş filtrelenmiş kayıt sayısı == Parquet'e yazılan kayıt sayısı.
> 2. `Parquet Health Check`: PyArrow / DuckDB ile dosyanın metadata ve footer'ının hatasız okunabilmesi.
> 3. `Storage Checksum Verification`: Hedef depolamadaki dosya boyutu ve SHA-256 hash'inin yerel hesaplanan hash ile %100 eşleşmesi.
> 4. `Atomic Ledger Commit`: Doğrulama kaydının metadata DB'ye `VERIFIED` statüsüyle commit edilmiş olması.

> [!NOTE]
> **Çalışma Ortamı ve Dil Tercihi:** Veri işleme ve yüksek hızlı streaming operasyonları (PyArrow, Zstandard, MinHash, xxhash/blake3) mevcut `scripts/wikipedia_pipeline/` yapısıyla uyumlu olarak Python 3.11+ motoru ile; REST API, kuyruk orkestrasyonu ve Store yönetimi ise Node.js/TypeScript (`src/`) tarafı ile koordineli çalışacaktır.

---

## 3. Faz Faz Uygulama Planı (Phased Execution)

### Faz 1: Çekirdek Sözleşmeler, Şema ve Envanter Kataloğu (Cortex & Metadata)
* Çoklu platform, eklenti depolama ve doğrulama denetim defteri için genişletilmiş kurumsal şema (`scripts/bigdata_pipeline/schema.sql`):
  * `datasets`: Genel veri seti tanımları (Wikipedia, arXiv, PubMed, WebCrawl vb.), lisans grubu, dil.
  * `pipeline_runs`: Ingest çalışma oturumları, zaman damgaları, toplam sayaçlar.
  * `dataset_shards`: 512 MB - 1 GB boyutundaki her Parquet parçası, kayıt sayısı, sıkıştırma, BLAKE3 ve SHA-256 özetleri.
  * `storage_replicas`: Parçanın hangi depolama sağlayıcısında (R2, Cold Vault, Drive, S3) hangi URI ile durduğu ve doğrulama tarihi.
  * `verification_audit_ledger`: Ham veri silme kararı öncesi çalıştırılan doğrulamaların kriptografik kanıt kaydı.
* Python metadata yönetim sınıfı (`scripts/bigdata_pipeline/metadata_catalog.py`).

### Faz 2: Eklenti Tabanlı Depolama Katmanı (Storage Provider Plugins)
* `StorageProvider` soyut taban sınıfı (`scripts/bigdata_pipeline/storage/base.py`):
  * `upload(local_path, remote_key, expected_hash) -> StorageReceipt`
  * `verify(remote_key, expected_hash, expected_size) -> bool`
  * `stream_download(remote_key, dest_path)`
  * `delete(remote_key)`
* Somut Eklentiler:
  * `local_cold_vault.py`: Btrfs / yerel takılabilir soğuk disk sağlayıcısı (`docs/protokol-cold-vault-mimari-sartnamesi.md` uyumlu).
  * `cloudflare_r2.py`: Boto3 / S3-uyumlu Cloudflare R2 sağlayıcısı (Multipart upload, zero-egress).
  * `generic_s3.py`: MinIO / AWS S3 sağlayıcısı.

### Faz 3: Birleşik Veri Çıkarım, Temizleme ve Normalizasyon Motoru
* Çoklu platform kaynak adaptörleri (`scripts/bigdata_pipeline/sources/`):
  * `wikipedia_source.py`: Çok dilli XML dump akışı ve wikitext ayrıştırıcı.
  * `arxiv_source.py`: arXiv metin ve LaTeX/PDF akışı.
  * `generic_jsonl_source.py`: Genel web tarama ve REST API kaynakları.
* `Normalizer & Cleaner` (`scripts/bigdata_pipeline/cleaner.py`):
  * Unicode NFKC standardizasyonu, geçersiz UTF-8 temizliği.
  * Gopher / FineWeb kalite heuristik filtreleri (karakter/kelime oranı, tekrar eden satır elemesi).
  * PII maskeleme ve temel regex temizleyicileri.

### Faz 4: Parquet Paketleme, Doğrulama Kapısı ve Güvenli Ham Veri Silme
* `ParquetPacker` (`scripts/bigdata_pipeline/packer.py`):
  * 512 MB - 1 GB parçalama (sharding), RowGroup (64 MB), ZSTD-6 sıkıştırma.
  * Standart Parquet şeması: `doc_id`, `text`, `source`, `domain`, `license_group`, `char_count`, `word_count`, `ref_token_count`, `created_at`.
* `VerificationGate & Purge Engine` (`scripts/bigdata_pipeline/verifier.py`):
  * Okunabilirlik testi: Parquet dosyasını açıp şema ve satır sayısını doğrular.
  * Çift yönlü kayıt doğrulaması: İşlenen temiz doküman sayısı ile Parquet içindeki satır sayısını karşılaştırır.
  * Hedef depolama doğrulaması: Eklentiye yüklenen dosyanın hash ve boyutunu kontrol eder.
  * Güvenli Ham Veri Temizleme (`purge_raw_data`): Yalnızca doğrulama başarılı olursa ham kaynak dosyasını güvenli siler (`os.unlink` / zero-fill opsiyonel), denetim defterine `RAW_PURGED` durumunu işler.

### Faz 5: Master Orkestratör, CLI ve Otomasyon
* Master CLI (`scripts/bigdata_pipeline/orchestrator.py`):
  * Parametreler: `--source`, `--storage` (`r2`, `cold_vault`, `s3`, `drive`), `--shard-size-mb`, `--purge-raw`.
* Unit ve Entegrasyon Testleri (`tests/bigdata_pipeline/`):
  * Eklenti depolama testleri (Mock S3 / R2, Local FS).
  * Doğrulama kapısı ve ham veri silme güvenlik testleri (bozuk dosyada ham verinin asla silinmediğini kanıtlayan testler).

---

## 4. Değişecek ve Eklenecek Dosyalar (Proposed Changes)

### Yeni Modüller (`scripts/bigdata_pipeline/`)
* [NEW] `scripts/bigdata_pipeline/schema.sql` — Kurumsal envanter, replika ve denetim şeması.
* [NEW] `scripts/bigdata_pipeline/metadata_catalog.py` — Veri kataloğu ve denetim defteri yöneticisi.
* [NEW] `scripts/bigdata_pipeline/storage/base.py` — Eklenti depolama arayüzü ve veri sözleşmeleri.
* [NEW] `scripts/bigdata_pipeline/storage/local_cold_vault.py` — Soğuk disk Btrfs/POSIX eklentisi.
* [NEW] `scripts/bigdata_pipeline/storage/cloudflare_r2.py` — Cloudflare R2 S3 eklentisi.
* [NEW] `scripts/bigdata_pipeline/cleaner.py` — Unicode NFKC, heuristik kalite filtresi ve PII koruyucu.
* [NEW] `scripts/bigdata_pipeline/packer.py` — ZSTD-6 512MB-1GB akışlı Parquet paketleyici.
* [NEW] `scripts/bigdata_pipeline/verifier.py` — 4 aşamalı doğrulama kapısı ve ham veri güvenli silici.
* [NEW] `scripts/bigdata_pipeline/orchestrator.py` — Ana orkestrasyon komuta merkezi.
* [NEW] `scripts/bigdata_pipeline/test_bigdata_pipeline.py` — Çekirdek birim ve regresyon testleri.

### Dokümantasyon ve Sistem Haritaları
* [NEW] `docs/plans/kurumsal-big-data-pipeline-plani.md` — Kalıcı plan kaydı.
* [MODIFY] `context/architecture-schema.md` — Yeni modüllerin mimari envantere eklenmesi.
* [MODIFY] `TASKS.md` — Hipokampüs görev takibi ve güven kademesi (Tier: 1).

---

## 5. Doğrulama Planı (Verification Plan)

### Otomatik Testler
1. `test_metadata_catalog`: Tabloların oluşturulması, run başlatma, shard kaydı, denetim defteri commit testleri.
2. `test_storage_providers`: Local cold vault ve R2 mock yükleme, hash kontrolü ve doğrulama testleri.
3. `test_cleaner_heuristics`: Gopher/FineWeb heuristik filtreleri, bozuk UTF-8 onarımı, NFKC normalizasyon testleri.
4. `test_verifier_and_safety_purge`:
   * Başarılı senaryo: Parquet oluşturulur -> Doğrulanır -> Ham veri başarıyla silinir.
   * Başarısız senaryo: Parquet kasti olarak bozulur -> Doğrulama hata verir -> **Ham verinin silinmediği kesin olarak doğrulanır.**

### Bütünsel Sistem Doğrulaması
* `npm run verify`: Protokol-7 genel linter, tip kontrolü, test koşuları ve format denetimi.
