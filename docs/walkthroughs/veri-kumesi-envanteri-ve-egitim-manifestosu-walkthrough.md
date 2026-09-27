# Veri Kumesi Envanteri ve Egitim Manifestosu Dogrulama Raporu (Walkthrough)

Bu dokuman; `protokol-7` veri katmaninda damıtılmış ve elenmiş külliyat şardlarının tek bir eğitim veri kümesi anlık görüntüsü (`DatasetSnapshot`) olarak mühürlenmesini, deterministik SHA-256 sağlama toplamı denetimini, veri bölme (train / validation / test) oranlarının hesaplanmasını, `manifest.json` üretimini, depolama bağlayıcılarına aktarımını, SQLite ACID kaydını ve REST API / MCP araçları üzerinden sunulmasını doğrular.

---

## 1. Uygulanan Bilesenler

### 1.1 Veritabani Sema ve CRUD Katmani (`src/core/registry-database.ts`)
* `dataset_snapshots` tablosu oluşturuldu (`snapshot_id`, `dataset_name`, `version`, `splits_json`, `shard_count`, `total_record_count`, `total_size_bytes`, `total_tokens_estimated`, `manifest_uri`, `manifest_json`, `created_at`).
* `idx_dataset_snapshots_name` ve `idx_dataset_snapshots_created` indeksleri tanımlandı.
* `recordDatasetSnapshot`, `listDatasetSnapshots`, `getDatasetSnapshot`, `getLatestDatasetSnapshot` metotları ve hazırlanmış ifadeleri (prepared statements) eklendi.

### 1.2 Yayinci Motoru (`src/dataset/dataset-publisher.ts`)
* `DatasetPublisher` sınıfı geliştirildi:
  - `publishSnapshot(options: PublishDatasetOptions): Promise<PublishDatasetResult>`
  - Otomatik şard çözümleme (veritabanı sorgusu, `shardIds` veya diskteki doğrudan `filePaths`).
  - Kriptografik SHA-256 bütünlük doğrulaması (`verifyChecksumsOnDisk`).
  - Deterministik veri bölümleme (proporcional oranlar veya explicit split haritalama).
  - Standart `manifest.json` ve `checksums.sha256` dosyalarının hedef çıktı dizinine (`outputDir`) güvenli yazımı (path traversal korumalı).
  - Opsiyonel uzak depolama bağlayıcılarına (S3, R2, B2) manifesto yükleme.
  - `RegistryDatabase` üzerine ACID kayıt.

### 1.3 Veri Kumesi Tipleri ve Sozlesmeleri (`src/dataset/types.ts` & `src/dataset/index.ts`)
* `TrainingDatasetManifest`, `PublishDatasetOptions`, `PublishDatasetResult`, `SplitDefinition`, `ShardManifestEntry` tipleri tanımlandı ve unified barrel üzerinden dışa aktarıldı.

### 1.4 HTTP REST API Yonlendiricisi (`src/core/dataset-router.ts` & `src/core/server.ts`)
* `POST /api/v1/datasets/publish`: Veri kümesi anlık görüntüsü mühürleme ve manifesto üretimi (HTTP 201).
* `GET /api/v1/datasets`: Katalogdaki tüm veri kümelerini şard sayıları, boyutları ve en son anlık görüntü durumuyla listeleme (HTTP 200).
* `GET /api/v1/datasets/:name`: Belirli bir veri kümesinin şard envanterini ve anlık görüntü geçmişini sorgulama (HTTP 200 / HTTP 404).
* `GET /api/v1/datasets/:name/manifest`: Veri kümesinin en son `manifest.json` dosyasını doğrudan döndürme (HTTP 200 / HTTP 404).
* `GET /api/v1/datasets/:name/snapshots`: Veri kümesine ait anlık görüntü listesi (HTTP 200).
* `GET /api/v1/datasets/:name/snapshots/:snapshotId`: Belirli bir anlık görüntünün ayrıştırılmış manifestosu ve bölümleri (HTTP 200 / HTTP 404).

### 1.5 MCP Protokol Araclari (`src/mcp/protokol-mcp-server.ts`)
* Toplam MCP araç sayısı 33'ten **36'ya** yükseltildi.
* `publish_dataset`: Ajanların parametrik olarak eğitim veri kümesi yayınlamasını ve `manifest.json` üretmesini sağlar.
* `list_datasets`: Ajanların mevcut veri kümelerini, şard envanterlerini ve anlık görüntü durumlarını incelemesini sağlar.
* `get_dataset_manifest`: Ajanların doğrudan doğrulanmış `manifest.json` karnesini çekmesini sağlar.

### 1.6 OpenAPI 3.1.0 Spesifikasyonu (`src/core/openapi-spec.ts`)
* `Datasets` etiketi altında tüm yeni REST rotaları şemaları ve durum kodlarıyla belgelendi.

---

## 2. Test ve Dogrulama Sonuclari

### 2.1 Entegrasyon Testleri (`tests/dataset-publisher-and-api.test.ts`)
11 entegrasyon testi çalıştırıldı ve tümü başarıyla geçti:
1. `DatasetPublisher.publishSnapshot` ile `manifest.json` ve `checksums.sha256` dosyalarının doğrulanması.
2. Tek şardlık sınır durumunda `%100 train` bölümünün atanması.
3. Açık (explicit) şard-bölüm haritalamasının doğrulanması.
4. `outputDir` parametresinde path traversal denemelerinin reddedilmesi.
5. `POST /api/v1/datasets/publish` ile HTTP REST üzerinden anlık görüntü oluşturma (HTTP 201).
6. `POST /api/v1/datasets/publish` geçersiz gövde için HTTP 400 hata yanıtı.
7. `GET /api/v1/datasets` katalog listesi ve özet bilgisi (HTTP 200).
8. `GET /api/v1/datasets/:name` şard envanteri ve detay sorgusu (HTTP 200).
9. `GET /api/v1/datasets/:name` bilinmeyen veri kümesi için HTTP 404 yanıtı.
10. `GET /api/v1/datasets/:name/manifest` ham `manifest.json` çekimi (HTTP 200).
11. MCP `publish_dataset`, `list_datasets` ve `get_dataset_manifest` JSON-RPC 2.0 araç çağrıları.

### 2.2 Genel Test Paketi
* Çalıştırılan test paketi: 74 süit, **470 test**.
* Başarılı: 470 test (%100 geçiş).

### 2.3 6 Aşamalı Deterministik Doğrulama Hattı (`npm run verify`)
1. Mimari Dosya Bütünlüğü: Geçti.
2. İsimlendirme ve Dokümantasyon Disiplini: Geçti (0 yasaklı pazarlama terimi).
3. Loglama Disiplini (Sıfır Emoji): Geçti (0 emoji).
4. Gizli Anahtar Taraması: Geçti (0 secret).
5. Bağımlılık ve Canlı SCA Denetimi: Geçti (11/11 paket doğrulandı).
6. Kod Stili ve Biome Lint: Geçti (218 dosya hatasız).
