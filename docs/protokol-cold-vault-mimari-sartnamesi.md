# Protokol-Cold-Vault — Mimari Şartname ve Veri Modeli Belgesi

Bu belge, bağımsız olarak geliştirilecek **`protokol-cold-vault`** projesinin çekirdek mimarisini, donanım kimlikleme disiplinini, veri modelini ve çevrimdışı (offline/raflanan) disk yönetim protokolünü tanımlar.

---

## 1. Sistemin Amacı ve Temel İlke

`protokol-cold-vault`, 7/24 çalışmayan, doldukça fiziksel olarak unmount edilip raflara kaldırılan (cold storage / offline media) HDD ve SSD depolama birimleri için tasarlanmış bir **Dijital Varlık Koruma ve Çevrimdışı Depo Yönetim Platformudur.**

### Temel Prensip: Mantıksal Obje ile Fiziksel Konumun Ayrımı
```text
OBJECT (Mantıksal Veri: BLAKE3/SHA-256, Boyut, MIME)
  │
  └── OBJECT_LOCATION (Fiziksel Kopya)
        ├── VOL-2026-001 (Rafta / Offline) ──> /objects/ab/c1/abc123...
        └── VOL-2026-004 (Bağlı / Online)  ──> /objects/ab/c1/abc123...
```
* Bir disk çıkarılmış olsa bile sistem dosyanın var olduğunu, kaç kopyası olduğunu ve hangi raftaki hangi diskte durduğunu bilir (`copies = 2, available_now = 1`).

---

## 2. Teknoloji Yığını ve Standartlar

* **Dosya Sistemi:** Btrfs (Dahili bit-rot tespiti ve scrub desteği).
* **Birincil Kriptografik Hash:** BLAKE3 (Yüksek hızlı I/O ve doğrulamalar için).
* **İkincil Kriptografik Hash:** SHA-256 (Arşiv standardı ve harici uyumluluk için).
* **Sıkıştırma Algoritması:** Zstandard (Zstd).
* **Metaveri Veritabanı:** PostgreSQL veya SQLite (WAL modu).
* **Disk Manifest Formatı:** Self-describing JSON + `SHA256SUMS` / `BLAKE3SUMS`.
* **Fiziksel Kimlikleme:** `Filesystem UUID` + `Donanım Seri Numarası (Hardware Serial)` (Asla `/dev/sdX` isimlerine güvenilmez).

---

## 3. 5 Katmanlı Sistem Mimarisi

```text
┌────────────────────────────────────────────────────────┐
│                      APPLICATION                       │
│              vault-cli / REST API / Web UI             │
├────────────────────────────────────────────────────────┤
│                        CATALOG                         │
│             PostgreSQL / SQLite (Hot Catalog)          │
├────────────────────────────────────────────────────────┤
│                        OBJECTS                         │
│             Content-Addressed Storage (CAS)            │
├────────────────────────────────────────────────────────┤
│                        VOLUMES                         │
│               Removable HDDs & Partitions              │
├────────────────────────────────────────────────────────┤
│                       PHYSICAL                         │
│             Hardware Serial, SMART, Btrfs              │
└────────────────────────────────────────────────────────┘
```

---

## 4. Çekirdek Veri Modeli (Şema Tasarımı)

### Katman 1: Fiziksel Donanım ve Hacimler
* **`devices`:** Fiziksel sürücüler (`serial_number`, `manufacturer`, `model`, `interface`, `capacity_bytes`, `smart_status`).
* **`partitions`:** Disk bölümleri (`device_id`, `partition_number`, `size_bytes`, `filesystem_uuid`).
* **`storage_volumes`:** Mantıksal arşiv hacimleri (`volume_uuid`, `label`, `capacity_bytes`, `used_bytes`, `status`: *online / offline / missing / retired*, `mount_path`, `storage_type`: *hdd / ssd / nvme*).
* **`mount_sessions`:** Takılma/çıkarılma oturumları (`volume_id`, `device_path`, `mount_path`, `mounted_at`, `unmounted_at`, `clean_unmount`).
* **`volume_events`:** Denetim olayları (`connected`, `disconnected`, `mounted`, `scanned`, `verified`, `scrubbed`).

### Katman 2: Mantıksal Objeler ve Fiziksel Konumlar
* **`objects`:** Sistemdeki tekil veri varlıkları (`object_id`, `content_hash_blake3`, `content_hash_sha256`, `size_bytes`, `mime_type`, `compression`, `state`: *active / archived / quarantined*).
* **`object_locations`:** Objenin fiziksel diskteki yeri (`object_id`, `volume_id`, `relative_path`, `is_primary`, `verification_status`: *verified / corrupted / missing*).
* **`collections` & `object_collections`:** Mantıksal gruplar (Örn: `saglik-bakanligi-kutuphane`, `github-mirrors`, `medical-papers`).

### Katman 3: Git Depoları ve Kod Arşivi
* **`repositories`:** Uzak git depoları (`provider`, `owner`, `name`, `repository_url`, `default_branch`).
* **`repository_snapshots`:** Belirli commit/tag halleri (`repository_id`, `commit_sha`, `branch`, `snapshot_type`: *mirror / bundle / bare*, `captured_at`).
* **`repository_locations`:** Snapshot'ın bulunduğu fiziksel disk ve yol.

### Katman 4: Fihrist ve Bütünlük Doğrulama
* **`manifests`:** Disk kökünde üretilen bağımsız fihrist kayıtları (`volume_id`, `manifest_version`, `generated_at`, `content_hash`, `object_count`, `total_bytes`).
* **`verification_runs`:** Doğrulama görevleri (`volume_id`, `verification_type`: *checksum / scrub / manifest*, `objects_checked`, `objects_failed`, `status`).
* **`verification_results`:** Bozuk/değişmiş objelerin dökümü (`object_id`, `expected_hash`, `actual_hash`, `status`: *ok / corrupted / missing*).

### Katman 5: Politikalar, Replikasyon ve Denetim
* **`storage_policies`:** 3-2-1 kuralları (`minimum_copies`, `offline_allowed`, `verification_interval_days`).
* **`replication_jobs` & `replication_items`:** Diskler arası kopyalama ve kesintiden devam edebilen (resumable) transfer takibi.
* **`deletion_requests`:** İki aşamalı güvenli silme mekanizması (`pending_delete` state machine).
* **`archive_operations`:** Tüm kullanıcı ve CLI hareketlerinin denetim günlüğü (audit log).

---

## 5. Fiziksel Disk Klasör Standardı (Self-Describing Volume)

Her HDD/SSD formatlanıp arşive alındığında şu hiyerarşiyi taşır:

```text
/VOL-2026-001/
├── volume.json             # Diskin kimlik kartı (UUID, label, schema_version)
├── manifest.parquet        # Diskteki tüm nesnelerin sütunsal indeksi
├── manifest.json           # İnsan tarafından okunabilir özet
├── checksums/
│   ├── BLAKE3SUMS          # BLAKE3 hash doğrulama tablosu
│   └── SHA256SUMS          # SHA-256 hash doğrulama tablosu
├── objects/
│   ├── ab/
│   │   └── c1/
│   │       └── abc123...   # Content-Addressable depolanan ikili dosyalar
├── repositories/           # Bare git veya bundle git depoları
├── datasets/               # Tablosal / Parquet veri setleri
└── logs/                   # Disk içi yerel operasyon logları
```

---

## 6. Protokol-7 ile Entegrasyon Sözleşmesi

Protokol-7 (Scraping Motoru), kazıdığı verileri bu sisteme aktarırken bir HTTP veya CLI ingest hattı kullanır:

```bash
# Protokol-7 çıktısını cold-vault'a aktarma örneği:
vault-cli ingest \
  --collection "saglik-bakanligi-kutuphane" \
  --file "output/pdfs/767.pdf" \
  --metadata '{"title":"DSÖ Kılavuzu","year":2026,"source_url":"https://..."}'
```

* `vault-cli` aktif takılı olan volume'a dosyayı yazar (`objects/..`), BLAKE3 ve SHA-256 özetini çıkarır, ana kataloğu günceller.
* Disk dolduğunda (`used > %95`), `vault-cli seal` komutu ile disk mühürlenir ve rafa kaldırılır.
