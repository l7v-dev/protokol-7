# Mimari Faz 4: CDC ve veri kapıları

2026-10-05. Plan: docs/plans/mimari-faz-4-plani.md. Tier 2.

## Uygulama

- OpenAlex metadata delta: sabit UTC pencere, bir günlük overlap, ID/updated_date upsert, raw SHA-256 doğrulaması, fsync + exclusive dosya oluşturma, CAS page/cursor transaction. Kısmi çalışmada watermark ilerlemez. HTTP retry, istek/bayt/süre sınırları ve header/body watchdog eklendi.
- Exact SHA-256 decontamination: frozen evaluation snapshot indeksi ve aynı canonicalization sürümü zorunlu. Train overlap quarantine'e alınır; validation/test kalite ve dedup filtrelerinden korunur. Rapor ve quarantine receiptleri 0004 migration ile execution kaydında saklanır. Yakın kopya değerlendirmesi veya release gate otomatik onayı yoktur.
- TypeScript Parquet ve shared Python sharder belge bazlı string pii_status taşır. Eksik değer unchecked; geçersiz/null değer reddedilir. JSONL fallback aynı doğrulamaya tabidir. Kolon PII taraması yapmaz.
- Ayrı Compose profilinde collector 0.162.0, localhost OTLP HTTP, memory limiter ve basic debug exporter. Uygulama SQL emitter'ına OTLP exporter eklenmedi.

## Kanıt

75/75 TypeScript regresyonu (decontamination/PII, pipeline runner, kalite/dedup, dataset release, Blueprint migration ve registry); 9/9 CDC Python testi; 2/2 shared sharder Python testi; 8/8 Blueprint/source-descriptor şema testi başarılı. npm run typecheck ve npm run verify geçti; git diff --check temiz.

Collector Compose config ve izole container validate başarılı: network none, read-only, cap-drop ALL, 256 MiB, 0.5 CPU. Image digest: sha256:310a800ad69ee430e7c541796852a242c9c7db97aaad4daa5ccf843c525fbdb2. Kalıcı servis başlatılmadı.

İki eksenli incelemede raw dizinlerin fsync edilmesi ve yavaş header/body yanıtlarının süre bütçesi düzeltildi. Son standards ve spec incelemelerinde açık bulgu yok.

## Canlı durum ve kalan işler

Canlı katalog salt okunur kontrol edildi: pipeline_executions içinde processing_metadata_json yok. Migration uygulanmadı, çalışan pipeline durdurulmadı veya yeniden başlatılmadı. Yeni CDC istemcisi canlı API'de çalıştırılmadı; ücretli erişim ve kaynak hakları doğrulanmayı bekliyor. CDC silinmeleri göstermez; snapshot üzerinden reconciliation gerekir. DNS çözümleyicisi beklemesi socket watchdog tarafından kesilemez.

Bağımsız eski Python packer'ları shared sharder dışında kalır; onların PII/provenance geçişi bakım penceresinde yapılacak. Croissant public yayın öncesinde, OpenLineage ekip/makine sayısı arttığında eklenecek. Yol haritasının koşullu işleri ve canlıya geçiş henüz tamamlanmış sayılmaz.

Birincil kaynaklar: [OpenAlex sync](https://help.openalex.org/access/sync/), [authentication](https://help.openalex.org/api/authentication/), [API referansı](https://help.openalex.org/api/llm-quick-reference/), [Collector config](https://opentelemetry.io/docs/collector/configuration/), [Collector Docker](https://opentelemetry.io/docs/collector/install/docker/).
