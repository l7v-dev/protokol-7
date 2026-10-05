# Mimari Faz 3 — Provenance ve release

## Uygulanan davranış

- Snapshot manifesti run_id, trace_id, isteğe bağlı git_commit ve başlangıç gate değerlerini içerir.
- Publish işlemi candidate oluşturur. Dataset/version ve çıktı dizini SQLite'da ilk await öncesinde atomik ayrılır. Başarısız deneme namespace'i tutar; yeniden deneme yeni sürüm ve dizin kullanır.
- Manifest, statistics, README ve checksums dosyaları exclusive create ile yazılır. Remote manifest anahtarı datasets/{prefix}/{snapshot_id}/manifest.json olur. Aynı manifest serileştirmesi disk, upload, registry ve review hash'inde kullanılır.
- Release, beş passing gate, her kapıya kanıt URI'si, reviewer ve zaman damgası gerektirir. Review tam candidate manifest SHA-256'sına bağlıdır; snapshot öncesi veya gelecekteki review reddedilir. Gate, kanıt ve released durumunun yazılması tek transaction'dır.
- Review bir insan/harici audit attestation'ıdır. Kod audit çalıştırmaz veya kanıt URI'lerini fetch etmez. Immutable artifact'lar creation-time gate değerlerini korur; güncel release kararı registry'den okunur.
- GET /api/v1/datasets/:name/gates, POST /api/v1/datasets/:name/release, GET /api/v1/datasets/:name/lineage ve GET /api/v1/lineage/:run_id eklendi; OpenAPI güncellendi. Release snapshotId'nin dataset adıyla eşleşmesini doğrular.
- document_occurrence_runs tablosu kaynak oluşumunu run'a bağlar. Registry provenance/occurrence yazarları ve lineage sorguları document, occurrence ve source evidence kayıtlarını döndürür. Kaydedilmemiş geçmiş bağlantılar tahmin edilmez.
- TextNormalizer canonicalization_version alanını uygulanan dönüşüm seçeneklerinin sürümlü fingerprint'i olarak kaydeder. Metin bulunmayan kayıt normalizasyon yapılmış sayılmaz.
- BaseLedger get_cursor()/commit_cursor() stream bazlı JSON cursor'ı yalnız yerel ledger'a yazar. Çağıran, durable çıktı tamamlandıktan sonra commit eder. Başarısız serialization eski cursor'ı korur.
- StorageReplica pathTier alanı round-trip eder. buildArtifactPrefix tier ve relative path segmentlerini doğrular; opaque Drive ID'lerinde tier açık metadata'dır. Eski bilinmeyen tier kayıtları tahmin edilmez.
- statistics.json toplamlar, splitler, token tahmini ve dil/kalite ölçüm durumunu içerir. Ölçüm verilmemişse unavailable yazılır. Dataset Card README çıktısı ve docs/templates/dataset-card-README.md şablonu eklendi.

## Migration ve canlı durum

0003-release-reviews.sql review kanıtları, yayın rezervasyonları ve occurrence/run bağlantıları için üç tablo ekler. Mevcut snapshot sürümleri rezervasyonlara aktarılır; mevcut satırlar değiştirilmez. Migration 0002 ile birlikte transaction içinde, tekrar uygulanabilir şekilde çalışır. Docker migration dizinini zaten içerir.

Canlı data/catalog.sqlite salt okunur sorgulandı: üç Faz 3 tablosu bulunmuyor. Canlı migration uygulanmadı, pipeline durdurulmadı veya yeniden başlatılmadı. Mevcut Python üreticilerinin yeni provenance/cursor arayüzlerine geçirilmesi ayrıca bakım penceresinde yapılacak. Kodun varsayılan registry açılışı migration uyguladığından canlı servis başlatmadan önce shared catalog yazıcıları için bu pencere hazırlanmalıdır.

## Doğrulama

- NODE_ENV=test tsx ile dataset-release, blueprint-registry, registry-database, pipeline-quality-and-dedup, dataset-publisher-and-api ve contracts: 83/83 test başarılı.
- Yeni negatif testler: beş kapının her biri, eksik kanıt/reviewer, yanlış hash, future timestamp, farklı dataset, tekrar release, namespace yarışı ve çıktı dizini tekrar kullanımı.
- SQL trigger ile kanıt yazma hatası üretildi; gates ve state rollback doğrulandı. Manifest artifact baytları ile registry içeriğinin eşitliği, source/document lineage ve tier path traversal reddi doğrulandı.
- PYTHONPATH=. .venv/bin/python tests/ledger_cursor_test.py: 2/2 başarılı. Sistem Python'unda shared package import'u pyarrow gerektirdiği için proje venv'i kullanıldı; paket eklenmedi.
- npm run typecheck ve npm run verify başarılı. Verify 372 dosyada Biome ve altı doğrulama katmanını geçti. git diff --check başarılı.
- Regresyonların ürettiği 15 bilinen test run log kaydı temizlendi; mevcut ledger geçmişi korundu.

## İnceleme

Standards incelemesinin eşzamanlı overwrite ve farklı manifest hash baytları bulguları düzeltildi. Spec incelemesinin output-dir overwrite, document lineage, dil/kalite boyutları ve tier prefix bulguları düzeltildi. Tekrar incelemelerde açık kod bulgusu kalmadı; Dataset Card şablonu teslimden önce eklendi.

Canlıya geçiş, gerçek gate audit'lerinin yürütülmesi ve mevcut pipeline üreticilerinden provenance doldurma bu kod tesliminin çalıştırdığı işlemler değildir.
